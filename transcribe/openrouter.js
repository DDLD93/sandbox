// OpenRouter access for the transcriber.
//
//  * Model list  — via the official @openrouter/sdk (models.list), filtered to
//    audio-capable models. Falls back to the raw /models endpoint, then to a
//    tiny curated list if everything fails.
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

function isAudioModel(m) {
  const mods = m?.architecture?.input_modalities || m?.input_modalities || [];
  return Array.isArray(mods) && mods.includes("audio");
}

let cache = { at: 0, models: null };
const CACHE_MS = 5 * 60 * 1000;

async function listAudioModels() {
  if (cache.models && Date.now() - cache.at < CACHE_MS) return cache.models;

  let raw = [];
  try {
    raw = asArray(await sdk().models.list());
  } catch {
    try {
      const r = await fetch(`${API_BASE}/models`, {
        headers: { Authorization: `Bearer ${apiKey()}` },
      });
      raw = asArray(await r.json());
    } catch {
      raw = [];
    }
  }

  const audio = raw
    .filter(isAudioModel)
    .map((m) => ({ id: m.id, name: m.name || m.id }));

  const models = audio.length ? audio : FALLBACK_MODELS;
  cache = { at: Date.now(), models };
  return models;
}

// Transcribe one base64-encoded audio chunk. `format` is the container ext
// (mp3, wav, m4a, ...). Returns the transcript text.
async function transcribeChunk(model, base64Data, format, language) {
  const body = {
    model,
    input_audio: { data: base64Data, format },
  };
  if (language) body.language = language;

  // Cap the request so a hung upstream can't stall the single-threaded worker.
  // OpenRouter's STT upstream times out at 60s; 120s leaves headroom + transit.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  let res;
  try {
    res = await fetch(`${API_BASE}/audio/transcriptions`, {
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
      err.name === "AbortError" ? "OpenRouter STT timed out after 120s" : err.message
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenRouter STT ${res.status}: ${detail.slice(0, 500)}`);
  }

  const json = await res.json();
  // Whisper-style responses put the transcript in `text`; be lenient.
  return json.text ?? json.transcript ?? json.choices?.[0]?.message?.content ?? "";
}

module.exports = { listAudioModels, transcribeChunk };
