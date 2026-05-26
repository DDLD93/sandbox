// In-process background worker. Jobs run one at a time through a tiny queue.
// All progress lives in Postgres and all bytes live in MinIO, so the worker is
// fully resumable: on boot recover() re-enqueues unfinished jobs, and because
// chunk rows carry their own status, processing picks up at the first chunk
// that isn't already 'done' — no re-transcription, no re-upload.

const crypto = require("crypto");
const os = require("os");
const fsp = require("fs/promises");
const path = require("path");

const db = require("./db");
const storage = require("./storage");
const chunker = require("./chunker");
const openrouter = require("./openrouter");

const queue = [];
const queued = new Set();
let running = false;

function enqueue(jobId) {
  if (queued.has(jobId)) return;
  queued.add(jobId);
  queue.push(jobId);
  pump();
}

// Cooperative stop. A queued-but-not-started job is dropped from the queue so
// it never starts. A job already running is halted by the DB-status check in
// processJob (the route flips status to 'stopped' before calling this).
function requestStop(jobId) {
  const i = queue.indexOf(jobId);
  if (i !== -1) queue.splice(i, 1);
  queued.delete(jobId);
}

async function isStopped(jobId) {
  const { rows } = await db.query(`SELECT status FROM transcribe_jobs WHERE id = $1`, [jobId]);
  // A deleted job (row gone) counts as stopped so an in-flight job halts cleanly
  // instead of erroring on objects the delete handler has already removed.
  return !rows[0] || rows[0].status === "stopped";
}

async function pump() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const jobId = queue.shift();
      queued.delete(jobId);
      try {
        await processJob(jobId);
      } catch (err) {
        console.error(`[transcribe] job ${jobId} failed:`, err.message);
        await setJob(jobId, { status: "failed", error: err.message }).catch(() => {});
      }
    }
  } finally {
    running = false;
  }
}

async function setJob(id, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  await db.query(
    `UPDATE transcribe_jobs SET ${sets}, updated_at = now() WHERE id = $1`,
    [id, ...keys.map((k) => fields[k])]
  );
}

function ext(filename) {
  const e = path.extname(filename || "").replace(".", "").toLowerCase();
  return e || "mp3";
}

async function processJob(jobId) {
  const { rows } = await db.query(`SELECT * FROM transcribe_jobs WHERE id = $1`, [jobId]);
  const job = rows[0];
  if (!job || job.status === "completed") return;

  const workDir = path.join(os.tmpdir(), "transcribe", jobId);
  await fsp.mkdir(workDir, { recursive: true });
  const fileExt = ext(job.filename);

  // --- Chunking ------------------------------------------------------------
  // total_chunks is set only after every segment is uploaded + inserted, so it
  // is the reliable "chunking finished" marker. If a previous run died partway,
  // total_chunks is still 0 and we re-run: ffmpeg is deterministic, inserts use
  // ON CONFLICT DO NOTHING, and uploads overwrite — so re-running is idempotent.
  if (Number(job.total_chunks) === 0) {
    await setJob(jobId, { status: "chunking", error: null });
    const srcPath = path.join(workDir, `source.${fileExt}`);
    await storage.getFile(job.source_key, srcPath);

    const outDir = path.join(workDir, "chunks");
    const segments = await chunker.split(
      srcPath,
      outDir,
      job.chunk_unit,
      Number(job.chunk_size),
      fileExt
    );

    for (const seg of segments) {
      if (await isStopped(jobId)) {
        console.log(`[transcribe] job ${jobId} stopped during chunking`);
        return;
      }
      const key = `jobs/${jobId}/chunks/${String(seg.idx).padStart(3, "0")}.${fileExt}`;
      await storage.putFile(key, seg.path, `audio/${fileExt}`);
      await db.query(
        `INSERT INTO transcribe_chunks (id, job_id, idx, object_key, start_sec, dur_sec, status)
         VALUES ($1,$2,$3,$4,$5,$6,'pending')
         ON CONFLICT (job_id, idx) DO NOTHING`,
        [crypto.randomUUID(), jobId, seg.idx, key, seg.startSec, seg.durSec]
      );
    }
    await setJob(jobId, { total_chunks: segments.length });
  }

  // --- Transcription -------------------------------------------------------
  await setJob(jobId, { status: "processing", error: null });
  const pending = await db.query(
    `SELECT * FROM transcribe_chunks WHERE job_id = $1 AND status <> 'done' ORDER BY idx`,
    [jobId]
  );

  for (const chunk of pending.rows) {
    // Cooperative stop: the in-flight chunk (previous iteration) is already
    // saved; halt before touching the next one. Leaves the job 'stopped'.
    if (await isStopped(jobId)) {
      console.log(`[transcribe] job ${jobId} stopped before chunk ${chunk.idx}`);
      return;
    }
    await db.query(`UPDATE transcribe_chunks SET status = 'processing' WHERE id = $1`, [chunk.id]);
    try {
      const buf = await storage.getBuffer(chunk.object_key);
      const { text, words } = await openrouter.transcribeChunk(
        job.model,
        buf.toString("base64"),
        fileExt,
        { prompt: job.system_prompt }
      );
      await db.query(
        `UPDATE transcribe_chunks SET status = 'done', transcript = $2, words = $3::jsonb, error = NULL WHERE id = $1`,
        [chunk.id, text, words ? JSON.stringify(words) : null]
      );
      await db.query(
        `UPDATE transcribe_jobs SET completed_chunks =
           (SELECT count(*) FROM transcribe_chunks WHERE job_id = $1 AND status = 'done'),
           updated_at = now() WHERE id = $1`,
        [jobId]
      );
    } catch (err) {
      await db.query(
        `UPDATE transcribe_chunks SET status = 'failed', error = $2 WHERE id = $1`,
        [chunk.id, err.message]
      );
      // Leave the job 'failed' so it can be resumed from this chunk.
      throw new Error(`chunk ${chunk.idx}: ${err.message}`);
    }
  }

  // --- Compile + store result ---------------------------------------------
  const all = await db.query(
    `SELECT * FROM transcribe_chunks WHERE job_id = $1 ORDER BY idx`,
    [jobId]
  );
  const md = compileMarkdown(job, all.rows);
  const resultKey = `jobs/${jobId}/result.md`;
  await storage.putBuffer(resultKey, md, "text/markdown; charset=utf-8");
  await setJob(jobId, { status: "completed", result_key: resultKey, error: null });

  await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
}

function ts(sec) {
  const s = Math.max(0, Math.round(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function compileMarkdown(job, chunks) {
  const lines = [
    `# Transcription: ${job.filename}`,
    "",
    `- **Model:** ${job.model}`,
    `- **Chunking:** ${job.chunk_size} ${job.chunk_unit}`,
    `- **Segments:** ${chunks.length}`,
    `- **Generated:** ${new Date().toISOString()}`,
    "",
    "---",
    "",
  ];
  for (const c of chunks) {
    const end = Number(c.start_sec) + Number(c.dur_sec);
    lines.push(`## Segment ${c.idx + 1} (${ts(c.start_sec)}–${ts(end)})`, "");
    lines.push((c.transcript || "").trim() || "_(no speech detected)_", "");
  }
  return lines.join("\n");
}

// Re-enqueue every job that wasn't finished before the last shutdown.
async function recover() {
  const { rows } = await db.query(
    `SELECT id FROM transcribe_jobs
       WHERE status IN ('pending','chunking','processing')
       ORDER BY created_at`
  );
  for (const r of rows) enqueue(r.id);
  if (rows.length) console.log(`[transcribe] recovering ${rows.length} job(s)`);
}

module.exports = { enqueue, requestStop, recover };
