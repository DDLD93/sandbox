// OpenRouter access for the transcriber.
//
//  * Model list  — the full OpenRouter catalog via the official @openrouter/sdk
//    (models.list), falling back to the raw /models endpoint, then to a tiny
//    curated list. No modality filtering: every model is offered (grouped by
//    provider in the UI), since callers may use any audio-capable model.
//  * Transcription — the installed SDK (0.1.x) has no STT namespace yet, so we
//    POST directly to OpenRouter's dedicated speech-to-text endpoint, which the
//    SDK shares a base URL with. Body is base64 audio per their docs.

const { OpenRouter } = require("@openrouter/sdk");

const API_BASE = "https://openrouter.ai/api/v1";
const FALLBACK_MODELS = [
  { id: "openai/whisper-1", name: "OpenAI Whisper v1" },
  { id: "google/gemini-2.5-flash", name: "Google Gemini 2.5 Flash" },
];

function apiKey() {
  const k = process.env.OPENROUTER_API_KEY;
  if (!k) throw new Error("OPENROUTER_API_KEY is not set");
  return k;
}

let client = null;
function sdk() {
  if (!client) client = new OpenRouter({ apiKey: apiKey() });
  return client;
}

// Normalize whatever shape models.list / the REST endpoint returns into an
// array of raw model objects.
function asArray(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.models)) return res.models;
  return [];
}

let cache = { at: 0, models: null };
const CACHE_MS = 5 * 60 * 1000;

// Fetch the full model catalog (no modality filter — widen the scope so nothing
// is dropped). Returns [{ id, name }] for every model OpenRouter exposes.
async function listModels() {
  if (cache.models && Date.now() - cache.at < CACHE_MS) return cache.models;

  let raw = [];
  try {
    raw = asArray(await sdk().models.list());
  } catch {
    raw = [];
  }
  // Fall back to (or supplement with) the raw REST catalog if the SDK returned
  // little or nothing — the /models endpoint returns the complete list at once.
  if (raw.length < 2) {
    try {
      const r = await fetch(`${API_BASE}/models`, {
        headers: { Authorization: `Bearer ${apiKey()}` },
      });
      const rest = asArray(await r.json());
      if (rest.length > raw.length) raw = rest;
    } catch {
      /* keep whatever we have */
    }
  }

  const all = raw
    .filter((m) => m && m.id)
    .map((m) => ({ id: m.id, name: m.name || m.id }));

  const models = all.length ? all : FALLBACK_MODELS;
  cache = { at: Date.now(), models };
  return models;
}

// POST JSON to OpenRouter with a 120s cap (the upstream STT timeout is 60s; this
// leaves headroom + transit) so a hung request can't stall the single worker.
async function orFetch(path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    throw new Error(
      err.name === "AbortError" ? "OpenRouter request timed out after 120s" : err.message
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const e = new Error(`OpenRouter ${path} ${res.status}: ${detail.slice(0, 500)}`);
    e.status = res.status;
    e.detail = detail;
    throw e;
  }
  return res.json();
}

// Dedicated speech-to-text endpoint — only accepts STT models (e.g. whisper-1).
async function transcribeViaSTT(model, base64Data, format, opts) {
  const body = { model, input_audio: { data: base64Data, format } };
  if (opts.language) body.language = opts.language;
  if (opts.prompt) body.prompt = opts.prompt;
  const json = await orFetch("/audio/transcriptions", body);
  return json.text ?? json.transcript ?? json.choices?.[0]?.message?.content ?? "";
}

// Chat-completions path — for audio-capable chat models (Gemini, gpt-4o-audio,
// Qwen-audio, …) that aren't registered on the STT endpoint. The audio rides in
// as an `input_audio` content part and the model is told to transcribe verbatim.
async function transcribeViaChat(model, base64Data, format, opts) {
  const system =
    "Transcribe the provided audio verbatim. Output only the transcript text — " +
    "no preamble, commentary, or timestamps." +
    (opts.prompt ? `\n\n${opts.prompt}` : "");
  const body = {
    model,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe this audio." },
          { type: "input_audio", input_audio: { data: base64Data, format } },
        ],
      },
    ],
  };
  const json = await orFetch("/chat/completions", body);
  return json.choices?.[0]?.message?.content ?? "";
}

// A 400/404 that means "this model isn't valid for this endpoint" — the signal
// to try the other transcription route. Real errors (auth, rate limit, 5xx,
// timeouts) are not retried.
function isWrongEndpoint(err) {
  if (!err || (err.status !== 400 && err.status !== 404)) return false;
  const m = `${err.detail || err.message || ""}`.toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("not a valid") ||
    m.includes("no endpoints") ||
    m.includes("not support") ||
    m.includes("no allowed providers")
  );
}

// Remember which endpoint worked for each model so we don't re-probe every chunk.
const routeCache = new Map();
const guessRoute = (model) => (/whisper/i.test(model) ? "stt" : "chat");

// Transcribe one base64-encoded audio chunk. `format` is the container ext
// (mp3, wav, m4a, ...). `opts.prompt` is an optional system/guidance prompt and
// `opts.language` an optional language hint. Routes to the STT endpoint for
// whisper-style models and to chat-completions for audio chat models, falling
// back to the other route if the model isn't valid on the first. Returns text.
async function transcribeChunk(model, base64Data, format, opts = {}) {
  const order = routeCache.has(model)
    ? [routeCache.get(model)]
    : guessRoute(model) === "stt"
    ? ["stt", "chat"]
    : ["chat", "stt"];

  let lastErr;
  for (const route of order) {
    try {
      const text =
        route === "stt"
          ? await transcribeViaSTT(model, base64Data, format, opts)
          : await transcribeViaChat(model, base64Data, format, opts);
      routeCache.set(model, route);
      return text;
    } catch (err) {
      lastErr = err;
      if (!isWrongEndpoint(err)) throw err; // genuine failure — don't try the other route
    }
  }
  throw lastErr;
}

module.exports = { listModels, transcribeChunk };
