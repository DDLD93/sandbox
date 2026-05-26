// HTTP routes for the transcriber section. handle() returns true if it owned
// the request (so server.js can fall through to its 404 otherwise).

const crypto = require("crypto");
const os = require("os");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const db = require("./db");
const storage = require("./storage");
const worker = require("./worker");
const openrouter = require("./openrouter");
const { PAGE } = require("./ui");

const MAX_UPLOAD = 1024 * 1024 * 1024; // 1 GB guard

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

// Stream the raw request body to a temp file, enforcing a size cap.
function saveBodyToFile(req, filePath) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(filePath);
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_UPLOAD) {
        out.destroy();
        req.destroy();
        reject(new Error("Upload exceeds 1 GB limit"));
      }
    });
    req.on("error", reject);
    out.on("error", reject);
    out.on("finish", () => resolve(size));
    req.pipe(out);
  });
}

async function startJob(req, res, url) {
  const q = url.searchParams;
  const filename = (q.get("filename") || "audio.mp3").replace(/[\\/]/g, "_");
  const unit = q.get("unit") === "mb" ? "mb" : "seconds";
  const size = Number(q.get("size"));
  const model = q.get("model");
  const systemPrompt = q.get("prompt") || null;

  if (!model) return sendJson(res, 400, { error: "Missing 'model'" });
  if (!size || size <= 0) return sendJson(res, 400, { error: "Invalid 'size'" });

  const jobId = crypto.randomUUID();
  const tmp = path.join(os.tmpdir(), "transcribe", `upload-${jobId}`);
  await fsp.mkdir(path.dirname(tmp), { recursive: true });

  let bytes;
  try {
    bytes = await saveBodyToFile(req, tmp);
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    return sendJson(res, 400, { error: err.message });
  }
  if (!bytes) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    return sendJson(res, 400, { error: "Empty upload" });
  }

  const contentType = req.headers["content-type"] || "application/octet-stream";
  const sourceKey = `jobs/${jobId}/source/${filename}`;

  try {
    await storage.putFile(sourceKey, tmp, contentType);
  } finally {
    await fsp.rm(tmp, { force: true }).catch(() => {});
  }

  await db.query(
    `INSERT INTO transcribe_jobs
       (id, filename, content_type, file_size, chunk_unit, chunk_size, model, system_prompt, source_key, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')`,
    [jobId, filename, contentType, bytes, unit, size, model, systemPrompt, sourceKey]
  );

  // Remember these as the last-used defaults so the form can pre-fill next time.
  await db.query(
    `INSERT INTO transcribe_settings (id, chunk_unit, chunk_size, model, system_prompt, updated_at)
       VALUES ('last_used', $1, $2, $3, $4, now())
     ON CONFLICT (id) DO UPDATE
       SET chunk_unit = $1, chunk_size = $2, model = $3, system_prompt = $4, updated_at = now()`,
    [unit, size, model, systemPrompt]
  );

  worker.enqueue(jobId);
  sendJson(res, 202, { jobId });
}

async function getSettings(res) {
  const { rows } = await db.query(
    `SELECT chunk_unit, chunk_size, model, system_prompt FROM transcribe_settings WHERE id = 'last_used'`
  );
  sendJson(res, 200, { settings: rows[0] || null });
}

async function listJobs(res) {
  const { rows } = await db.query(
    `SELECT id, filename, status, total_chunks, completed_chunks, model, error, created_at, updated_at
       FROM transcribe_jobs ORDER BY created_at DESC LIMIT 200`
  );
  sendJson(res, 200, { jobs: rows });
}

async function jobDetail(res, id) {
  const job = await db.query(`SELECT * FROM transcribe_jobs WHERE id = $1`, [id]);
  if (!job.rows[0]) return sendJson(res, 404, { error: "Job not found" });
  const chunks = await db.query(
    `SELECT idx, status, start_sec, dur_sec, transcript, words, error FROM transcribe_chunks WHERE job_id = $1 ORDER BY idx`,
    [id]
  );
  sendJson(res, 200, { job: job.rows[0], chunks: chunks.rows });
}

async function resumeJob(res, id) {
  const job = await db.query(`SELECT id FROM transcribe_jobs WHERE id = $1`, [id]);
  if (!job.rows[0]) return sendJson(res, 404, { error: "Job not found" });
  await db.query(
    `UPDATE transcribe_jobs SET status = 'processing', error = NULL, updated_at = now() WHERE id = $1`,
    [id]
  );
  worker.enqueue(id);
  sendJson(res, 202, { jobId: id, resumed: true });
}

async function stopJob(res, id) {
  const job = await db.query(`SELECT status FROM transcribe_jobs WHERE id = $1`, [id]);
  if (!job.rows[0]) return sendJson(res, 404, { error: "Job not found" });
  // Flip to 'stopped' only if still active; the worker observes this between
  // chunks (finishing the in-flight one) and a queued job is dropped below.
  await db.query(
    `UPDATE transcribe_jobs SET status = 'stopped', updated_at = now()
       WHERE id = $1 AND status IN ('pending','chunking','processing')`,
    [id]
  );
  worker.requestStop(id);
  sendJson(res, 202, { jobId: id, stopped: true });
}

// Stop the job if active, remove every object under its bucket prefix, then delete
// the job row (transcribe_chunks cascades). Works for ongoing and completed jobs.
async function deleteJob(res, id) {
  const job = await db.query(`SELECT id FROM transcribe_jobs WHERE id = $1`, [id]);
  if (!job.rows[0]) return sendJson(res, 404, { error: "Job not found" });
  worker.requestStop(id);
  await storage.deletePrefix(`jobs/${id}/`);
  await db.query(`DELETE FROM transcribe_jobs WHERE id = $1`, [id]);
  sendJson(res, 200, { deleted: true });
}

// Content type for a chunk's audio, keyed off its stored object extension.
const CHUNK_CONTENT_TYPE = {
  mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac",
  wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg",
  flac: "audio/flac", webm: "audio/webm",
};

// Stream a single chunk's audio (used by the preview modal's per-segment player).
async function streamChunkAudio(res, id, idx) {
  const { rows } = await db.query(
    `SELECT object_key FROM transcribe_chunks WHERE job_id = $1 AND idx = $2`,
    [id, idx]
  );
  const key = rows[0]?.object_key;
  if (!key) return sendJson(res, 404, { error: "Chunk not found" });
  const ext = (key.split(".").pop() || "").toLowerCase();
  res.writeHead(200, {
    "content-type": CHUNK_CONTENT_TYPE[ext] || "application/octet-stream",
    "cache-control": "private, max-age=300",
  });
  const stream = await storage.getStream(key);
  stream.pipe(res);
}

async function streamResult(res, id, inline) {
  const job = await db.query(`SELECT result_key, filename FROM transcribe_jobs WHERE id = $1`, [id]);
  const row = job.rows[0];
  if (!row || !row.result_key)
    return sendJson(res, 404, { error: "Result not ready" });
  const headers = { "content-type": "text/markdown; charset=utf-8" };
  // Inline mode (used by the in-page preview) omits the attachment disposition so
  // the browser/fetch receives the raw markdown rather than triggering a download.
  if (!inline) {
    const name = (row.filename || "transcription").replace(/\.[^.]+$/, "") + ".md";
    headers["content-disposition"] = `attachment; filename="${name.replace(/"/g, "")}"`;
  }
  res.writeHead(200, headers);
  const stream = await storage.getStream(row.result_key);
  stream.pipe(res);
}

async function handle(req, res, url) {
  const p = url.pathname;
  if (!(p === "/transcribe" || p.startsWith("/api/transcribe"))) return false;

  try {
    if (req.method === "GET" && p === "/transcribe") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(PAGE);
      return true;
    }
    if (req.method === "GET" && p === "/api/transcribe/models") {
      sendJson(res, 200, { models: await openrouter.listModels() });
      return true;
    }
    if (req.method === "GET" && p === "/api/transcribe/settings") {
      await getSettings(res);
      return true;
    }
    if (req.method === "POST" && p === "/api/transcribe") {
      await startJob(req, res, url);
      return true;
    }
    if (req.method === "GET" && p === "/api/transcribe/jobs") {
      await listJobs(res);
      return true;
    }

    const cm = p.match(/^\/api\/transcribe\/jobs\/([0-9a-f-]+)\/chunks\/(\d+)\/audio$/i);
    if (cm && req.method === "GET")
      return (await streamChunkAudio(res, cm[1], Number(cm[2]))), true;

    const m = p.match(/^\/api\/transcribe\/jobs\/([0-9a-f-]+)(\/result|\/resume|\/stop)?$/i);
    if (m) {
      const id = m[1];
      if (req.method === "GET" && !m[2]) return (await jobDetail(res, id)), true;
      if (req.method === "DELETE" && !m[2]) return (await deleteJob(res, id)), true;
      if (req.method === "GET" && m[2] === "/result")
        return (await streamResult(res, id, url.searchParams.get("inline") === "1")), true;
      if (req.method === "POST" && m[2] === "/resume") return (await resumeJob(res, id)), true;
      if (req.method === "POST" && m[2] === "/stop") return (await stopJob(res, id)), true;
    }

    sendJson(res, 404, { error: "Not found" });
    return true;
  } catch (err) {
    console.error("[transcribe] route error:", err);
    // AggregateError (e.g. ECONNREFUSED to Postgres/MinIO) has an empty message.
    const msg = err.message || err.code || String(err);
    if (!res.headersSent) sendJson(res, 500, { error: msg });
    return true;
  }
}

module.exports = { handle };
