# Project Specification — Fetch & Download + Audio Transcriber

This document describes a single HTTP service that bundles two independent
features behind one web server:

1. **Fetch & Download** — a browser-header-mimicking download proxy. Give it a
   file URL; it fetches the file with realistic browser headers and streams it
   back as a download. Useful for CDNs that gate requests on `Origin`/`Referer`/
   `Sec-Fetch-*` headers.
2. **Audio Transcriber** — upload audio, the service splits it into chunks,
   transcribes each chunk via OpenRouter (speech-to-text or audio-capable chat
   models), and compiles a single Markdown transcript. Jobs persist in a SQL
   database, artifacts in S3-compatible object storage, and jobs are fully
   **resumable** across restarts.

This spec is **framework- and language-agnostic**. It describes the contracts,
data models, algorithms, and behaviors precisely enough to re-implement in any
stack. The reference implementation is Node.js with no web framework, but
nothing here requires that.

---

## 1. High-level architecture

```
                 ┌──────────────────────────────────────────────┐
   Browser  ───▶ │  HTTP server (single process, single port)    │
   / API client  │                                                │
                 │  ┌─────────────┐      ┌──────────────────────┐ │
                 │  │ Download     │      │ Transcriber           │ │
                 │  │ feature      │      │ feature               │ │
                 │  │ (stateless)  │      │ (stateful)            │ │
                 │  └─────────────┘      └────────┬─────────────┘ │
                 └──────────────────────────────────│─────────────┘
                                                     │
                          ┌──────────────────────────┼────────────────────┐
                          ▼                           ▼                    ▼
                  ┌───────────────┐         ┌──────────────────┐  ┌────────────────┐
                  │ SQL database  │         │ S3-compatible    │  │ OpenRouter API │
                  │ (Postgres)    │         │ object storage   │  │ (STT / chat)   │
                  │ jobs + chunks │         │ source/chunks/md │  │                │
                  └───────────────┘         └──────────────────┘  └────────────────┘
```

Key properties:

- **One server, one port.** Both features share the same HTTP listener. The
  transcriber claims the path prefixes `/transcribe` and `/api/transcribe/*`;
  everything else belongs to the download feature.
- **The download feature has zero external dependencies** and must keep working
  even if the database / object store / OpenRouter are unreachable.
- **The transcriber's backing services are bootstrapped at startup but failures
  are non-fatal** — they are logged, and the relevant endpoints surface the
  error only when used. The server must still come up and serve the download UI.
- **In-process background worker** runs transcription jobs one at a time. All
  durable state is in the database and object store, so the worker is
  crash-safe and resumable.

---

## 2. Configuration (environment variables)

All configuration comes from environment variables. A `.env` file should be
loaded at startup if present, but real environment variables (e.g. from a
container) must take precedence — never override an already-set variable.

| Variable | Default | Used by | Purpose |
|---|---|---|---|
| `HOST` | `127.0.0.1` | server | Bind address. In containers set to `0.0.0.0`. |
| `PORT` | `8000` | server | Listen port. |
| `OPENROUTER_API_KEY` | *(none)* | transcriber | OpenRouter API key. Required for transcription; missing it throws only when an STT/model call is made. |
| `DATABASE_URL` | *(none)* | transcriber | Full Postgres connection string. If unset, fall back to the standard libpq vars below. |
| `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` | libpq defaults | transcriber | Discrete connection params used when `DATABASE_URL` is unset. |
| `AWS_S3_ENDPOINT` | *(none)* | transcriber | Custom S3 endpoint (e.g. a MinIO URL). Presence implies path-style addressing. |
| `AWS_S3_REGION` (or `AWS_REGION`) | `us-east-1` | transcriber | S3 region. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | *(none)* | transcriber | S3 credentials. If both unset, fall back to the SDK/default credential provider chain. |
| `AWS_S3_BUCKET_NAME` | `transcriber` | transcriber | Bucket for all artifacts. |
| `AWS_S3_FORCE_PATH_STYLE` | derived | transcriber | `true`/`false`. If unset, defaults to **true whenever `AWS_S3_ENDPOINT` is set**, else false. |

Provide a `.env.example` documenting all of these. The download feature requires
none of them; only the transcriber does.

---

## 3. Download feature

### 3.1 Routes

| Method | Path | Body / Query | Behavior |
|---|---|---|---|
| `GET` | `/` | — | Serve the Download HTML UI (see §3.5). |
| `GET` | `/download` | `?url=<target>` | Proxy-download the target URL. Convenient for direct browser links. |
| `POST` | `/api/download` | JSON `{ "url": "..." }` **or** form-encoded `url=...` | Proxy-download the target URL. |

Any other path not owned by the transcriber returns `404` JSON `{ "error": "Not found" }`.

### 3.2 Core proxy-download algorithm

Given a target URL and the outgoing HTTP response:

1. **Parse & validate** the URL. If it doesn't parse → `400 { error: "Invalid URL" }`.
   If the protocol isn't `http:` or `https:` → `400 { error: "Only http/https URLs are supported" }`.
2. **Fetch** the target with `GET`, following redirects, using the
   browser-mimicking headers (§3.3). On a network/fetch exception →
   `502 { error: "Fetch failed: <message>" }`.
3. If the upstream response is **not OK** (status ≥ 400) → respond with the same
   status and `{ error: "Upstream responded <status> <statusText>" }`.
4. **Derive the filename** (§3.4).
5. Write response headers:
   - `Content-Type`: upstream's `content-type`, or `application/octet-stream`.
   - `Content-Disposition`: `attachment; filename="<name without quotes>"; filename*=UTF-8''<percent-encoded name>`.
   - `Content-Length`: pass through upstream's value **only if present**.
6. **Stream** the upstream body straight through to the response with no
   buffering (must handle multi-GB files). If there is no body, end the response.

### 3.3 Browser-mimicking request headers

The point of the proxy is to look like a real same-site browser request so CDNs
that verify origin headers will serve the file. Compute a "site origin" from the
target, then send a fixed Chrome-like header set.

**Site origin derivation:** parse the target URL. Split the hostname on `.`. If
there are **3 or more labels**, drop the single leading label (the subdomain like
`pdf`/`cdn`/`www`) and rejoin; otherwise keep the hostname as-is. The site origin
is `<protocol>//<resulting-host>`. Examples:
- `https://pdf.example.com/file` → site origin `https://example.com`
- `https://example.com/file` → site origin `https://example.com`

**Headers sent** (values mirror a captured Chrome request — keep them literal):

```
accept: */*
accept-encoding: gzip, deflate, br, zstd
accept-language: en-US,en;q=0.9
origin: <site origin>
priority: u=1, i
referer: <site origin>/
sec-ch-ua: "Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"
sec-ch-ua-mobile: ?0
sec-ch-ua-platform: "Windows"
sec-fetch-dest: empty
sec-fetch-mode: cors
sec-fetch-site: same-site
user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36
```

The crucial trio is `origin`/`referer` pointing at the **parent** site plus
`sec-fetch-site: same-site`. (HTTP/2 pseudo-headers like `:authority` are set by
the protocol layer and must not be assigned manually.)

### 3.4 Filename derivation

1. If the upstream sent a `Content-Disposition`:
   - Prefer the RFC 5987 form `filename*=UTF-8''<value>` (strip quotes,
     percent-decode). If decoding fails, fall through.
   - Else use the plain `filename="..."` form.
2. Else use the **last path segment** of the target URL, percent-decoded.
3. Else fall back to the literal `download`.

### 3.5 Download UI (`GET /`)

A single self-contained HTML page (inline CSS + JS, dark theme). Behavior:

- A form with one URL input and a "Download" button.
- On submit: `POST /api/download` with JSON `{ url }`.
- On error: show the server's `error` message.
- On success: read `Content-Disposition` from the response to recover the
  filename, turn the response body into a Blob, and trigger a client-side
  download via a temporary `<a download>` element + object URL. Show a success
  line including the filename and size in MB.
- Include a small "API" note and a link to `/transcribe`.

Visual style (shared with the transcriber page): dark radial-gradient
background, a translucent rounded "card" with blur, cyan accent
(`#38bdf8`→`#22d3ee`) gradient buttons. Exact styling is not load-bearing;
match the spirit.

### 3.6 Request body size guard

For `POST /api/download`, cap the buffered request body at **1,000,000 bytes**
and reject with an error if exceeded (the body is just a small JSON/form
payload). Parse JSON when `Content-Type` includes `application/json`, otherwise
parse as URL-encoded form. Missing `url` → `400 { error: "Missing 'url' field" }`.

---

## 4. Transcriber feature

The transcriber owns all paths equal to `/transcribe` or starting with
`/api/transcribe`. It is composed of these logical modules:

- **DB** — SQL pool, migration runner, query helper.
- **Storage** — S3-compatible object storage wrapper.
- **Chunker** — audio splitting via ffmpeg/ffprobe.
- **OpenRouter** — model catalog + per-chunk transcription with endpoint routing.
- **Worker** — in-process job queue / processor / recovery.
- **Routes** — HTTP handlers.
- **UI** — inline HTML page.

### 4.1 HTTP routes

All JSON responses set `Content-Type: application/json` with a correct
`Content-Length`. A route handler returns "handled" so the outer server knows
not to fall through to its own 404. Errors thrown inside any handler are caught
and returned as `500 { error: <message> }` (using `err.message`, else `err.code`,
else stringified error — needed because aggregate connection errors can have an
empty message).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/transcribe` | Serve the transcriber HTML UI. |
| `GET` | `/api/transcribe/models` | List available OpenRouter models `{ models: [{id,name}] }`. |
| `GET` | `/api/transcribe/settings` | Return last-used form defaults `{ settings: {...} | null }`. |
| `POST` | `/api/transcribe` | Start a new job (audio uploaded as the raw request body; params in query string). Returns `202 { jobId }`. |
| `GET` | `/api/transcribe/jobs` | List recent jobs (most recent first, limit 200). |
| `GET` | `/api/transcribe/jobs/{id}` | Job detail + its chunks. |
| `GET` | `/api/transcribe/jobs/{id}/result` | Stream the compiled Markdown as a download. |
| `POST` | `/api/transcribe/jobs/{id}/resume` | Re-enqueue a failed/stopped job. Returns `202 { jobId, resumed: true }`. |
| `POST` | `/api/transcribe/jobs/{id}/stop` | Cooperatively stop an active job. Returns `202 { jobId, stopped: true }`. |

The job-id sub-routes match a job id of hex + hyphens (UUID shape). Unknown
sub-paths under `/api/transcribe` → `404 { error: "Not found" }`.

### 4.2 Start-job request contract (`POST /api/transcribe`)

The audio is sent as the **raw request body** (not multipart). Parameters are in
the **query string**:

| Query param | Required | Default | Notes |
|---|---|---|---|
| `filename` | no | `audio.mp3` | Used for extension detection and result naming. Sanitize: replace `\` and `/` with `_`. |
| `unit` | no | `seconds` | Either `seconds` or `mb`. Anything other than `mb` is treated as `seconds`. |
| `size` | **yes** | — | Positive number. The chunk duration in seconds, or target size in MB. Invalid/≤0 → `400 { error: "Invalid 'size'" }`. |
| `model` | **yes** | — | OpenRouter model id. Missing → `400 { error: "Missing 'model'" }`. |
| `prompt` | no | null | Optional system/guidance prompt passed to the model. |

Processing steps:

1. Generate a `jobId` (UUID v4 generated in app code — no DB extension needed).
2. **Stream the request body to a temp file**, enforcing a **1 GiB** cap
   (`1024*1024*1024`). On overflow destroy the stream and reject
   `400 { error: "Upload exceeds 1 GB limit" }`. Empty upload (0 bytes) →
   `400 { error: "Empty upload" }`. Clean up the temp file on any failure.
3. Determine `contentType` from the request `Content-Type` header (default
   `application/octet-stream`).
4. Upload the temp file to object storage at key
   `jobs/{jobId}/source/{filename}` (call this `sourceKey`). Always delete the
   temp file afterward (success or failure).
5. Insert a `transcribe_jobs` row with status `pending` and the params above.
6. **Upsert** the `last_used` settings row (so the form pre-fills next time).
7. Enqueue the job in the worker.
8. Respond `202 { jobId }`.

### 4.3 Object storage layout & semantics

All artifacts live in one bucket under a per-job prefix:

```
jobs/{jobId}/source/{filename}         the original uploaded audio
jobs/{jobId}/chunks/000.{ext}          chunk 0 audio
jobs/{jobId}/chunks/001.{ext}          chunk 1 audio
...
jobs/{jobId}/result.md                 the compiled Markdown transcript
```

Storage wrapper responsibilities:

- **On startup, ensure the bucket exists** (HEAD; create on 404/NotFound/
  NoSuchBucket). For real AWS outside `us-east-1`, include a
  `LocationConstraint`; for a custom endpoint (MinIO), do not.
- **Path-style addressing** must be enabled when a custom endpoint is set
  (most S3-compatible servers require it).
- Operations needed:
  - `putFile(key, localPath, contentType)` — multipart/managed upload streaming
    from disk (must handle the large source file without buffering it in memory).
  - `getFile(key, localPath)` — download object to disk.
  - `putBuffer(key, bytes, contentType)` — upload an in-memory buffer/string.
  - `getBuffer(key)` — read object fully into memory (used for chunk audio).
  - `getStream(key)` — open a readable stream (used to stream results to clients).

### 4.4 Database schema

IDs are UUIDs generated in application code. Apply via an ordered, idempotent
migration system (see §4.8). The schema, in order:

**Migration 0001 — jobs & chunks:**

```sql
CREATE TABLE IF NOT EXISTS transcribe_jobs (
  id               uuid PRIMARY KEY,
  filename         text NOT NULL,
  content_type     text,
  file_size        bigint,
  chunk_unit       text NOT NULL,            -- 'seconds' | 'mb'
  chunk_size       numeric NOT NULL,
  model            text NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  total_chunks     int  NOT NULL DEFAULT 0,
  completed_chunks int  NOT NULL DEFAULT 0,
  source_key       text,
  result_key       text,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transcribe_chunks (
  id         uuid PRIMARY KEY,
  job_id     uuid NOT NULL REFERENCES transcribe_jobs(id) ON DELETE CASCADE,
  idx        int  NOT NULL,                  -- 0-based chunk index
  object_key text NOT NULL,
  start_sec  numeric,
  dur_sec    numeric,
  status     text NOT NULL DEFAULT 'pending',
  transcript text,
  error      text,
  UNIQUE (job_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_chunks_job ON transcribe_chunks(job_id);
```

**Migration 0002 — per-job system prompt:**

```sql
ALTER TABLE transcribe_jobs ADD COLUMN IF NOT EXISTS system_prompt text;
```

**Migration 0003 — last-used form defaults (single row):**

```sql
CREATE TABLE IF NOT EXISTS transcribe_settings (
  id            text PRIMARY KEY DEFAULT 'last_used',
  chunk_unit    text,
  chunk_size    numeric,
  model         text,
  system_prompt text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

**Job status values:** `pending` → `chunking` → `processing` → `completed`;
plus `failed` and `stopped`. A job is "active" when in
(`pending`, `chunking`, `processing`).

**Chunk status values:** `pending` → `processing` → `done`; or `failed`.

### 4.5 Audio chunker

Uses bundled static **ffmpeg** and **ffprobe** binaries (so no system install is
required). Note: glibc builds — they will not run on musl/Alpine; use a
glibc base image.

- `probe(input)` → `{ duration (seconds), size (bytes) }` via
  `ffprobe -v error -show_entries format=duration,size -print_format json`.
- `split(input, outDir, unit, size, ext)`:
  1. Probe duration.
  2. Compute **seconds-per-segment**:
     - `unit === "mb"`: probe byte size, compute `bytesPerSec = size/duration`,
       target `size * 1024 * 1024` bytes, then
       `secondsPerSegment = max(5, floor(targetBytes / bytesPerSec))`
       (fallback `60` if rate unknown). Exact byte targets are impossible for
       VBR audio without re-encoding — this is an approximation.
     - `unit === "seconds"`: `secondsPerSegment = max(1, floor(size))`.
  3. Segment with ffmpeg:
     `-f segment -segment_time <secs> -reset_timestamps 1 -c copy -y outDir/%03d.<ext>`
     (stream copy = fast, no re-encode). **If copy-segmenting fails** (some
     containers can't cut cleanly at arbitrary points), retry **without** `-c copy`
     (re-encode).
  4. Read back the produced `%03d.<ext>` files sorted by name. If none →
     error "ffmpeg produced no segments".
  5. Return ordered descriptors: `{ path, idx, startSec, durSec }` where
     `startSec = idx * secondsPerSegment` and
     `durSec = clamp(secondsPerSegment, 0, duration - startSec)`.

### 4.6 OpenRouter integration

**Model listing** (`listModels`): fetch the full OpenRouter catalog, cache it for
**5 minutes**. Try the SDK's `models.list()` first; if it returns < 2 entries,
fall back to / supplement with the raw REST endpoint `GET
https://openrouter.ai/api/v1/models` (Bearer auth). Normalize to `[{ id, name }]`
(`name` defaults to `id`). If everything fails, return a tiny hardcoded fallback
list (e.g. `openai/whisper-1`, `google/gemini-2.5-flash`). **No modality
filtering** — offer every model; the UI groups them by provider.

**Per-chunk transcription** (`transcribeChunk(model, base64Audio, format, opts)`):
There are two possible upstream routes, and the right one depends on the model:

- **STT route** — `POST /api/v1/audio/transcriptions` with body
  `{ model, input_audio: { data: <base64>, format }, language?, prompt? }`.
  Extract text from `json.text ?? json.transcript ?? choices[0].message.content`.
  Only STT models (e.g. whisper) are valid here.
- **Chat route** — `POST /api/v1/chat/completions` with a system message
  instructing verbatim transcription ("Transcribe the provided audio verbatim.
  Output only the transcript text — no preamble, commentary, or timestamps."
  optionally followed by the user's prompt), and a user message whose content is
  `[{type:"text", text:"Transcribe this audio."}, {type:"input_audio",
  input_audio:{data:<base64>, format}}]`. Extract `choices[0].message.content`.
  For audio-capable chat models (Gemini, gpt-4o-audio, Qwen-audio, …).

**Routing logic:**
- Guess the initial route from the model id: contains `whisper` → try STT first,
  else try chat first. Always keep the other route as a fallback.
- After a route **succeeds for a model id, cache that choice** so subsequent
  chunks don't re-probe.
- Only fall back to the other route when the error indicates a **wrong-endpoint**
  condition: HTTP 400 or 404 **and** the error text contains one of
  `does not exist`, `not a valid`, `no endpoints`, `not support`,
  `no allowed providers` (case-insensitive). Any other error (auth, rate-limit,
  5xx, timeout) is a genuine failure — throw immediately, do not try the other
  route.

**HTTP details:** Bearer auth with `OPENROUTER_API_KEY` (throw "OPENROUTER_API_KEY
is not set" if missing). Apply a **120-second timeout** per request (abort + map
to "OpenRouter request timed out after 120s"). On non-OK responses, throw an
error carrying the status and a truncated (≤500 char) response body.

### 4.7 Background worker

A tiny in-process FIFO queue that runs **one job at a time**.

- `enqueue(jobId)` — de-duplicated (a job already queued is ignored); appends and
  kicks the pump.
- `pump()` — if already running, return; otherwise drain the queue sequentially.
  Each job runs inside a try/catch; on uncaught error set the job to `failed`
  with the error message.
- `requestStop(jobId)` — cooperative stop. If the job is still queued (not
  started), remove it from the queue so it never starts. If it's already running,
  the running loop observes the DB status flip to `stopped` (the stop route sets
  that **before** calling `requestStop`) and halts between chunks.
- `recover()` — run **at startup**: re-enqueue every job whose status is in
  (`pending`, `chunking`, `processing`). This makes the system crash-safe.

**`processJob(jobId)` algorithm:**

1. Load the job. If missing or already `completed`, return.
2. Create a temp work dir. Determine the file extension from `filename`
   (default `mp3`).
3. **Chunking phase** — only if `total_chunks === 0` (the reliable "chunking not
   yet finished" marker; it is set only after *all* segments are uploaded &
   inserted):
   - Set status `chunking`, clear error.
   - Download `source_key` to the work dir.
   - Run the chunker (§4.5).
   - For each segment, in order:
     - If the job is now `stopped` (DB check), log and return.
     - Upload the segment to `jobs/{jobId}/chunks/{idx:000}.{ext}`.
     - Insert a `transcribe_chunks` row (status `pending`) with
       `ON CONFLICT (job_id, idx) DO NOTHING`.
   - Set `total_chunks = segments.length`.
   - **Idempotency:** ffmpeg is deterministic, inserts are conflict-safe, and
     uploads overwrite — so re-running a partially-completed chunking phase is
     safe.
4. **Transcription phase:**
   - Set status `processing`, clear error.
   - Select all chunks where `status <> 'done'`, ordered by `idx`.
   - For each such chunk:
     - If the job is now `stopped`, log and return (the previously-finished
       chunk is already persisted).
     - Mark the chunk `processing`.
     - Read the chunk audio from storage, base64-encode it, call
       `transcribeChunk(model, base64, ext, { prompt: system_prompt })`.
     - On success: set chunk `done` with `transcript`, clear its error; then
       recompute `completed_chunks` =
       `count(chunks where status='done')` for the job.
     - On failure: set chunk `failed` with the error, and **throw**
       `"chunk {idx}: {message}"` — leaving the job `failed` so it can be
       resumed from exactly this chunk.
5. **Compile phase:**
   - Load all chunks ordered by `idx`, build the Markdown (§4.9).
   - Upload it to `jobs/{jobId}/result.md`.
   - Set job `completed`, set `result_key`, clear error.
   - Remove the temp work dir.

This design means a job resumes correctly after any crash or stop: chunking is
skipped if already done, and only not-yet-`done` chunks are (re)transcribed.

### 4.8 Migrations

A minimal migration runner that:

- Reads `.sql` files from a `migrations/` directory, **sorted by filename**
  (`0001_*`, `0002_*`, …). The migration id is the filename without `.sql`.
- Maintains a `schema_migrations(id text PRIMARY KEY, applied_at timestamptz
  DEFAULT now())` table.
- Takes a **session-level advisory lock** (a fixed arbitrary key) so concurrent
  app instances serialize and don't migrate simultaneously.
- Runs each unapplied migration **in its own transaction**; on failure roll back
  and stop (leaving the rest unapplied), surfacing
  `"migration {id} failed: {message}"`.
- Runs automatically at server startup, and is also exposed as a standalone
  command (e.g. `migrate` script) that loads `.env`, runs migrations, and exits
  0/1.

### 4.9 Result Markdown format

```markdown
# Transcription: {filename}

- **Model:** {model}
- **Chunking:** {chunk_size} {chunk_unit}
- **Segments:** {N}
- **Generated:** {ISO-8601 timestamp}

---

## Segment 1 (MM:SS–MM:SS)

{chunk 0 transcript, trimmed; or "_(no speech detected)_" if empty}

## Segment 2 (MM:SS–MM:SS)

{chunk 1 transcript...}
```

- Segments are numbered from 1 (`idx + 1`).
- Time range is `start_sec` to `start_sec + dur_sec`, each formatted `MM:SS`
  (rounded to whole seconds, zero-padded).
- The result is served at `/api/transcribe/jobs/{id}/result` as
  `text/markdown; charset=utf-8` with
  `Content-Disposition: attachment; filename="{filename without ext}.md"`.
  If `result_key` is unset → `404 { error: "Result not ready" }`.

### 4.10 Stop / resume route semantics

- **Stop** (`POST .../stop`): if the job exists, flip status to `stopped`
  **only if** it is currently in (`pending`, `chunking`, `processing`), then call
  the worker's `requestStop`. The status flip must happen before `requestStop` so
  a running job's cooperative check sees it. Return `202 { jobId, stopped: true }`.
- **Resume** (`POST .../resume`): if the job exists, set status `processing`,
  clear error, and enqueue it. The worker picks up where it left off (chunking
  skipped if `total_chunks>0`, only non-`done` chunks transcribed). Return
  `202 { jobId, resumed: true }`.

### 4.11 Transcriber UI (`GET /transcribe`)

A self-contained dark-themed HTML page (same visual language as the download
page) with:

- A back-link to `/`.
- **Upload form:** file input (`accept="audio/*"`), a "chunk by" select
  (`seconds`/`mb`), a numeric chunk-size input (default `30`), a model select,
  and an optional multiline system-prompt textarea.
  - On load: `GET /api/transcribe/models`, group options by provider (the id
    prefix before `/`) into `<optgroup>`s, sorted; fall back to a single
    `openai/whisper-1` option on error. **Then** `GET /api/transcribe/settings`
    and pre-fill unit/size/prompt, and select the saved model **only if it
    exists** among the loaded options.
  - On submit: `POST /api/transcribe?<query>` with the file as the raw body and
    `Content-Type` = the file's type. Show "Started job {id}" on success, reset
    the form, refresh the jobs table.
- **Jobs table:** `GET /api/transcribe/jobs` every 3 seconds. Columns: file,
  model, status (colored badge + inline error if any), progress
  (`completed_chunks/total_chunks` + a bar), and an action:
  - `completed` → link "View Markdown" to `.../result`.
  - `failed` or `stopped` → "Resume" button → `POST .../resume`.
  - active (`pending`/`chunking`/`processing`) → "Stop" button → `POST .../stop`.

---

## 5. Server bootstrap sequence

1. Load `.env` (non-overriding) **before** any module reads env vars — the DB and
   storage clients are built from env at import time.
2. Start the HTTP listener on `HOST:PORT`. Log the three entry points (download
   UI, download API, transcriber).
3. Bootstrap the transcriber asynchronously and **non-fatally**:
   - run DB migrations,
   - ensure the storage bucket,
   - run worker `recover()`.
   Wrap in try/catch; on failure (e.g. Postgres/MinIO unreachable) log a
   "init skipped" line but keep serving (the download feature still works, and
   transcriber endpoints will surface the error when used).

Request dispatch order in the listener: **give the transcriber first refusal**
(it returns whether it handled the request); only if it declines do the download
routes run; otherwise `404`.

---

## 6. Packaging & deployment

### 6.1 Dependencies (reference implementation)

- Runtime: Node.js 18+ (for global `fetch`); reference Dockerfile uses Node 24.
- Libraries: an env loader (`dotenv`), Postgres client (`pg`), S3 SDK
  (`@aws-sdk/client-s3` + `@aws-sdk/lib-storage`), OpenRouter SDK
  (`@openrouter/sdk`), and bundled `ffmpeg-static` + `ffprobe-static`.
- Scripts: `start` (run server), `dev` (run with watch), `migrate` (standalone
  migrations).

In another language, substitute equivalents: any Postgres driver, any S3 client
with path-style support, any HTTP client, and a system or bundled ffmpeg/ffprobe.

### 6.2 Container

- Use a **glibc** base image (e.g. `node:24-slim`) — the static ffmpeg/ffprobe
  binaries are glibc and won't run on Alpine/musl.
- Install deps first (cache-friendly layer), then copy source.
- Set `HOST=0.0.0.0` and `PORT=8000` in the image (the app defaults to
  `127.0.0.1`, unreachable from outside a container).
- Run as a non-root user.
- `EXPOSE 8000`.
- Health check: hit `GET /` and exit 0 if OK (this verifies the always-on
  download feature, independent of DB/storage availability).

### 6.3 Local dependencies for the transcriber

To exercise the transcriber locally you need a Postgres instance and an
S3-compatible store (MinIO works well). Point the env vars at them, set
`OPENROUTER_API_KEY`, and the bucket + schema are created automatically on first
boot.

---

## 7. Behavioral invariants (must-hold properties)

1. The server **starts and serves `/` and `/api/download`** even when Postgres,
   object storage, and OpenRouter are all unavailable.
2. The download proxy **never buffers** whole files in memory — it streams.
3. A transcription job is **resumable** across process restarts and explicit
   stop/resume, never re-transcribing a chunk already marked `done` and never
   re-running chunking once `total_chunks > 0`.
4. Chunking is **idempotent** (deterministic segmenting + conflict-safe inserts +
   overwriting uploads).
5. Only **wrong-endpoint** OpenRouter errors trigger the STT↔chat fallback; all
   other errors fail the chunk (and the job, resumably) immediately.
6. Migrations are applied **at most once**, **in order**, and **serialized** across
   instances via an advisory lock.
7. Uploads are capped at **1 GiB**; the small download-API body is capped at
   **1 MB**.
8. Last-used form parameters are **persisted on every job start** and pre-fill the
   UI on next load.
```