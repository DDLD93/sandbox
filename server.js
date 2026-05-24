// Fetch-as-a-service: paste a URL in the browser to download a file,
// or POST a URL to the API and get the file streamed back.
//
// Zero dependencies — uses only Node built-ins (Node 18+ for global fetch).
// Usage: node server.js   then open http://localhost:3000

const http = require("http");
const path = require("path");
const { Readable } = require("stream");

// Transcriber section (audio chunking + OpenRouter STT, jobs in Postgres,
// artifacts in MinIO). Self-contained under ./transcribe.
const transcribe = require("./transcribe/routes");

const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || "127.0.0.1";

// The "site" origin for a host — the parent domain a browser sends as
// origin/referer for a same-site CDN request. e.g. pdf.hausabook.com ->
// https://hausabook.com  (exactly what the original fetch-pdf.js hard-coded).
function siteOrigin(target) {
  const u = new URL(target);
  const parts = u.hostname.split(".");
  // Drop a single leading subdomain when there are 3+ labels (pdf/cdn/www/…).
  const host = parts.length > 2 ? parts.slice(1).join(".") : u.hostname;
  return `${u.protocol}//${host}`;
}

// Browser-mimicking headers — a 1:1 copy of the captured Chrome request in
// fetch-pdf.js. origin/referer point at the parent site and sec-fetch-site is
// "same-site", which is what CDNs like hausabook's verify before serving.
// (The HTTP/2 :authority/:method/:path/:scheme pseudo-headers are set by the
//  protocol automatically and cannot be assigned here.)
function browserHeaders(target) {
  const origin = siteOrigin(target);
  return {
    accept: "*/*",
    "accept-encoding": "gzip, deflate, br, zstd",
    "accept-language": "en-US,en;q=0.9",
    origin,
    priority: "u=1, i",
    referer: origin + "/",
    "sec-ch-ua":
      '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  };
}

// Pull a sensible download filename from the upstream headers or URL path.
function deriveFilename(target, upstream) {
  const cd = upstream.headers.get("content-disposition");
  if (cd) {
    const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(cd);
    if (star) {
      try {
        return decodeURIComponent(star[1].replace(/"/g, "").trim());
      } catch {}
    }
    const plain = /filename="?([^";]+)"?/i.exec(cd);
    if (plain) return plain[1].trim();
  }
  try {
    const name = decodeURIComponent(path.basename(new URL(target).pathname));
    if (name) return name;
  } catch {}
  return "download";
}

// Core: fetch the target URL and stream it back to our HTTP response.
async function proxyDownload(target, res) {
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return sendJson(res, 400, { error: "Invalid URL" });
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return sendJson(res, 400, { error: "Only http/https URLs are supported" });
  }

  let upstream;
  try {
    upstream = await fetch(target, {
      method: "GET",
      headers: browserHeaders(target),
      redirect: "follow",
    });
  } catch (err) {
    return sendJson(res, 502, { error: `Fetch failed: ${err.message}` });
  }

  if (!upstream.ok) {
    return sendJson(res, upstream.status, {
      error: `Upstream responded ${upstream.status} ${upstream.statusText}`,
    });
  }

  const filename = deriveFilename(target, upstream);
  const contentType =
    upstream.headers.get("content-type") || "application/octet-stream";
  const contentLength = upstream.headers.get("content-length");

  res.writeHead(200, {
    "content-type": contentType,
    "content-disposition": `attachment; filename="${filename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    ...(contentLength ? { "content-length": contentLength } : {}),
  });

  // Stream the body straight through — no buffering, handles large files.
  if (upstream.body) {
    Readable.fromWeb(upstream.body).pipe(res);
  } else {
    res.end();
  }
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 1_000_000) reject(new Error("Body too large"));
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Transcriber owns /transcribe and /api/transcribe/* — let it handle first.
  if (await transcribe.handle(req, res, url)) return;

  // Landing page / UI.
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(PAGE);
  }

  // GET /download?url=...  — handy for direct browser links.
  if (req.method === "GET" && url.pathname === "/download") {
    const target = url.searchParams.get("url");
    if (!target) return sendJson(res, 400, { error: "Missing ?url=" });
    return proxyDownload(target, res);
  }

  // POST /api/download  — JSON { "url": "..." }  or  form-encoded url=...
  if (req.method === "POST" && url.pathname === "/api/download") {
    let target;
    try {
      const raw = await readBody(req);
      const ctype = req.headers["content-type"] || "";
      if (ctype.includes("application/json")) {
        target = JSON.parse(raw).url;
      } else {
        target = new URLSearchParams(raw).get("url");
      }
    } catch (err) {
      return sendJson(res, 400, { error: `Bad request body: ${err.message}` });
    }
    if (!target) return sendJson(res, 400, { error: "Missing 'url' field" });
    return proxyDownload(target, res);
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Service running:`);
  console.log(`    Download UI  ->  http://${HOST}:${PORT}/`);
  console.log(`    Download API ->  POST http://${HOST}:${PORT}/api/download  { "url": "..." }`);
  console.log(`    Transcriber  ->  http://${HOST}:${PORT}/transcribe\n`);
  initTranscribe();
});

// Bootstrap the transcriber's backing services. Failures here (e.g. Postgres or
// MinIO not reachable) are logged but don't take down the download feature —
// the transcriber endpoints will surface the error on use.
async function initTranscribe() {
  try {
    const db = require("./transcribe/db");
    const storage = require("./transcribe/storage");
    const worker = require("./transcribe/worker");
    await db.migrate();
    await storage.ensureBucket();
    await worker.recover();
    console.log("  [transcribe] ready (migrations + bucket ok)\n");
  } catch (err) {
    // AggregateError (ECONNREFUSED to Postgres/MinIO) carries an empty message.
    console.error(`  [transcribe] init skipped: ${err.message || err.code || err}\n`);
  }
}

// ---- Inline UI ----------------------------------------------------------
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Fetch &amp; Download</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font: 16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: radial-gradient(circle at 30% 10%, #1e293b, #0f172a 60%);
    color: #e2e8f0;
  }
  .card {
    width: min(560px, 92vw); padding: 2.2rem;
    background: rgba(30, 41, 59, .7); border: 1px solid #334155;
    border-radius: 18px; box-shadow: 0 20px 60px rgba(0,0,0,.45);
    backdrop-filter: blur(6px);
  }
  h1 { margin: 0 0 .3rem; font-size: 1.5rem; }
  p.sub { margin: 0 0 1.5rem; color: #94a3b8; font-size: .92rem; }
  label { display: block; font-size: .8rem; color: #94a3b8; margin-bottom: .4rem; }
  input {
    width: 100%; padding: .8rem 1rem; font-size: 1rem;
    background: #0f172a; color: #e2e8f0;
    border: 1px solid #334155; border-radius: 10px; outline: none;
  }
  input:focus { border-color: #38bdf8; box-shadow: 0 0 0 3px rgba(56,189,248,.2); }
  button {
    margin-top: 1rem; width: 100%; padding: .85rem; font-size: 1rem; font-weight: 600;
    color: #04121f; background: linear-gradient(135deg, #38bdf8, #22d3ee);
    border: 0; border-radius: 10px; cursor: pointer; transition: opacity .15s;
  }
  button:disabled { opacity: .55; cursor: progress; }
  .status { margin-top: 1rem; min-height: 1.4rem; font-size: .9rem; }
  .status.err { color: #f87171; }
  .status.ok { color: #4ade80; }
  code { background: #0f172a; padding: .15rem .4rem; border-radius: 6px; font-size: .82rem; }
  .api { margin-top: 1.6rem; padding-top: 1.2rem; border-top: 1px solid #334155; color: #64748b; font-size: .8rem; }
</style>
</head>
<body>
  <div class="card">
    <h1>Fetch &amp; Download</h1>
    <p class="sub">Paste any file URL — we fetch it with browser headers and hand you the download.</p>
    <form id="f">
      <label for="url">File URL</label>
      <input id="url" name="url" type="url" placeholder="https://example.com/path/file.mp3" required autofocus />
      <button id="btn" type="submit">Download</button>
    </form>
    <div id="status" class="status"></div>
    <div class="api">
      API: <code>POST /api/download</code> with JSON <code>{ "url": "..." }</code> returns the file.
      <br /><br />Need speech-to-text? <a href="/transcribe" style="color:#38bdf8">Open the Audio Transcriber &rarr;</a>
    </div>
  </div>
<script>
const f = document.getElementById('f');
const btn = document.getElementById('btn');
const status = document.getElementById('status');

f.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = document.getElementById('url').value.trim();
  if (!url) return;
  btn.disabled = true;
  status.className = 'status';
  status.textContent = 'Fetching…';
  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || ('HTTP ' + res.status));
    }
    // Pull filename from Content-Disposition.
    let name = 'download';
    const cd = res.headers.get('content-disposition') || '';
    const m = /filename\\*=UTF-8''([^;]+)/i.exec(cd) || /filename="?([^";]+)"?/i.exec(cd);
    if (m) name = decodeURIComponent(m[1]);

    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    status.className = 'status ok';
    status.textContent = 'Downloaded ' + name + ' (' + (blob.size/1048576).toFixed(2) + ' MB)';
  } catch (err) {
    status.className = 'status err';
    status.textContent = 'Error: ' + err.message;
  } finally {
    btn.disabled = false;
  }
});
</script>
</body>
</html>`;
