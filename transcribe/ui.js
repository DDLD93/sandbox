// Inline HTML for the transcriber page. Light, professional theme shared with the
// fetch/download page. Jobs are created in a modal; completed results can be
// previewed segment-by-segment (audio playback + synced word highlight) or downloaded.

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Audio Transcriber</title>
<style>
  :root {
    color-scheme: light;
    --bg: #f8fafc;
    --surface: #ffffff;
    --surface-2: #f1f5f9;
    --border: #e2e8f0;
    --text: #0f172a;
    --muted: #64748b;
    --accent: #2563eb;
    --accent-hover: #1d4ed8;
    --danger: #dc2626;
    --ok: #16a34a;
    --radius: 12px;
    --shadow: 0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.06);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; padding: 3rem 1rem;
    font: 15px/1.55 "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: var(--bg); color: var(--text);
    display: flex; flex-direction: column; align-items: center; gap: 1.4rem;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .nav { width: min(840px, 94vw); font-size: .85rem; color: var(--muted); }
  .card {
    width: min(840px, 94vw); padding: 1.8rem 1.9rem;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); box-shadow: var(--shadow);
  }
  h1 { margin: 0 0 .25rem; font-size: 1.4rem; font-weight: 600; letter-spacing: -.01em; }
  p.sub { margin: 0 0 1.4rem; color: var(--muted); font-size: .9rem; }
  label { display: block; font-size: .72rem; font-weight: 600; letter-spacing: .03em;
          text-transform: uppercase; color: var(--muted); margin: 1rem 0 .4rem; }
  input, select, textarea {
    width: 100%; padding: .65rem .8rem; font-size: .95rem;
    background: var(--surface); color: var(--text);
    border: 1px solid var(--border); border-radius: 9px; outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  input[type=file] { padding: .55rem .8rem; background: var(--surface-2); cursor: pointer; }
  textarea { resize: vertical; font: inherit; }
  input:focus, select:focus, textarea:focus {
    border-color: var(--accent); box-shadow: 0 0 0 3px rgba(37,99,235,.15);
  }
  .row { display: flex; gap: 1rem; flex-wrap: wrap; }
  .row > div { flex: 1; min-width: 140px; }
  .btn {
    width: 100%; padding: .75rem; font-size: .95rem; font-weight: 600;
    color: #fff; background: var(--accent); border: 0; border-radius: 9px;
    cursor: pointer; transition: background .15s, opacity .15s; box-shadow: var(--shadow);
  }
  .btn:hover { background: var(--accent-hover); }
  .btn:disabled { opacity: .55; cursor: progress; }
  .btn-secondary {
    background: var(--surface); color: var(--text); border: 1px solid var(--border);
    box-shadow: none; font-weight: 500;
  }
  .btn-secondary:hover { background: var(--surface-2); }
  .card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.1rem; }
  .card-head h1 { margin: 0; }
  .card-head p.sub { margin: .25rem 0 0; }
  .card-head .btn { width: auto; white-space: nowrap; margin-top: .15rem; }
  .upload-progress { display: none; align-items: center; gap: .6rem; margin-top: 1.2rem; }
  .upload-progress.show { display: flex; }
  .upload-progress .bar { flex: 1; height: 8px; }
  .upload-pct { font-size: .78rem; color: var(--muted); min-width: 3.5ch; text-align: right; }
  .file-info {
    display: none; margin-top: .7rem; padding: .65rem .8rem;
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 9px;
    font-size: .82rem; color: var(--muted);
  }
  .file-info b { color: var(--text); font-weight: 600; }
  .file-info .meta { display: flex; flex-wrap: wrap; gap: .25rem 1.1rem; margin-top: .2rem; }
  .status { margin-top: .9rem; min-height: 1.3rem; font-size: .88rem; }
  .status.err { color: var(--danger); }
  .status.ok { color: var(--ok); }
  table { width: 100%; border-collapse: collapse; font-size: .85rem; margin-top: .4rem; }
  th, td { text-align: left; padding: .6rem .55rem; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 600; font-size: .72rem;
       text-transform: uppercase; letter-spacing: .03em; }
  tr:last-child td { border-bottom: 0; }
  .badge { display: inline-block; padding: .15rem .55rem; border-radius: 999px;
           font-size: .7rem; font-weight: 600; }
  .b-completed { background: #dcfce7; color: #15803d; }
  .b-failed { background: #fee2e2; color: #b91c1c; }
  .b-sync { background: #e0e7ff; color: #4338ca; }
  .b-stopped { background: #fef3c7; color: #b45309; }
  .b-processing, .b-chunking, .b-pending { background: #dbeafe; color: #1d4ed8; }
  .bar { height: 6px; background: var(--surface-2); border-radius: 999px; overflow: hidden; min-width: 80px; }
  .bar > i { display: block; height: 100%; background: var(--accent); transition: width .3s; }
  .act { display: inline-block; background: var(--surface); border: 1px solid var(--border);
         color: var(--text); margin: 0 .3rem .3rem 0; padding: .3rem .6rem; border-radius: 7px;
         font-size: .76rem; font-weight: 500; cursor: pointer; }
  .act:hover { background: var(--surface-2); text-decoration: none; }
  .act.danger { color: var(--danger); border-color: #fecaca; }
  .act.danger:hover { background: #fef2f2; }

  /* Modal */
  .modal-backdrop {
    position: fixed; inset: 0; background: rgba(15,23,42,.45);
    display: none; align-items: flex-start; justify-content: center;
    padding: 4rem 1rem; z-index: 50; overflow-y: auto;
  }
  .modal-backdrop.open { display: flex; }
  .modal {
    width: min(640px, 96vw); background: var(--surface);
    border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: 0 24px 60px rgba(15,23,42,.25); padding: 1.6rem 1.7rem;
  }
  .modal.wide { width: min(820px, 96vw); }
  .modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: .4rem; }
  .modal-head h2 { margin: 0; font-size: 1.15rem; font-weight: 600; }
  .modal-close { background: none; border: 0; color: var(--muted); font-size: 1.4rem;
                 line-height: 1; cursor: pointer; padding: .1rem .3rem; border-radius: 6px; }
  .modal-close:hover { background: var(--surface-2); color: var(--text); }
  .modal label:first-of-type { margin-top: .6rem; }

  /* Rendered markdown */
  .markdown-body { font-size: .92rem; color: var(--text); max-height: 64vh; overflow-y: auto; }
  .markdown-body h1, .markdown-body h2, .markdown-body h3 {
    margin: 1.1rem 0 .5rem; font-weight: 600; line-height: 1.3; }
  .markdown-body h1 { font-size: 1.3rem; } .markdown-body h2 { font-size: 1.12rem; }
  .markdown-body h3 { font-size: 1rem; }
  .markdown-body p { margin: .55rem 0; }
  .markdown-body ul, .markdown-body ol { margin: .55rem 0; padding-left: 1.4rem; }
  .markdown-body li { margin: .2rem 0; }
  .markdown-body code { background: var(--surface-2); padding: .1rem .35rem;
    border-radius: 5px; font-size: .85em; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .markdown-body pre { background: var(--surface-2); padding: .8rem 1rem; border-radius: 9px;
    overflow-x: auto; border: 1px solid var(--border); }
  .markdown-body pre code { background: none; padding: 0; }
  .markdown-body blockquote { margin: .6rem 0; padding: .2rem 0 .2rem .9rem;
    border-left: 3px solid var(--border); color: var(--muted); }
  .markdown-body a { color: var(--accent); }

  /* Preview segments (audio + synced highlight) */
  .seg { margin: 0 0 1.3rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border); }
  .seg:last-child { border-bottom: 0; margin-bottom: 0; padding-bottom: 0; }
  .seg-head { display: flex; align-items: center; justify-content: space-between;
              gap: .8rem; margin-bottom: .5rem; flex-wrap: wrap; }
  .seg-title { font-weight: 600; font-size: .9rem; }
  .seg-audio { height: 34px; max-width: 320px; }
  .seg-text { line-height: 1.85; }
  .seg-text > :first-child { margin-top: 0; }
  .seg-text > :last-child { margin-bottom: 0; }
  .wd { border-radius: 4px; transition: background .1s, color .1s; }
  .wd.active { background: #fde68a; color: #0f172a; box-shadow: 0 0 0 2px #fde68a; }

  /* Preview quick-action toolbar */
  .preview-toolbar {
    display: flex; align-items: center; gap: .5rem; flex-wrap: wrap;
    margin: .2rem 0 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border);
  }
  .preview-toolbar .act { margin: 0; }
  .preview-toolbar .spacer { flex: 1; }
  .preview-toolbar label.inline {
    display: inline-flex; align-items: center; gap: .35rem; margin: 0;
    font-size: .76rem; font-weight: 500; text-transform: none; letter-spacing: 0;
    color: var(--text); cursor: pointer;
  }
  .preview-toolbar label.inline input { width: auto; }
  .preview-toolbar select.speed {
    width: auto; padding: .3rem 1.6rem .3rem .6rem; font-size: .76rem; border-radius: 7px;
  }
</style>
</head>
<body>
  <div class="nav">&larr; <a href="/">Fetch &amp; Download</a></div>

  <div class="card">
    <div class="card-head">
      <div>
        <h1>Audio Transcriber</h1>
        <p class="sub">Upload audio — we split it into chunks, transcribe each via OpenRouter, and compile one Markdown document. Jobs are tracked and resumable.</p>
      </div>
      <button type="button" id="newJobBtn" class="btn">+ New transcription</button>
    </div>
    <table>
      <thead><tr><th>File</th><th>Model</th><th>Status</th><th>Progress</th><th>Created</th><th>Time taken</th><th>Sync</th><th></th></tr></thead>
      <tbody id="jobs"><tr><td colspan="8" style="color:var(--muted)">No jobs yet.</td></tr></tbody>
    </table>
  </div>

  <!-- Create-job modal -->
  <div class="modal-backdrop" id="createModal">
    <div class="modal">
      <div class="modal-head">
        <h2>New transcription</h2>
        <button type="button" class="modal-close" data-close="createModal">&times;</button>
      </div>
      <form id="f">
        <label for="file">Audio file</label>
        <input id="file" type="file" accept="audio/*" required />
        <div id="fileInfo" class="file-info"></div>
        <div class="row">
          <div>
            <label for="unit">Chunk by</label>
            <select id="unit">
              <option value="seconds">Seconds (duration)</option>
              <option value="mb">MB (size)</option>
            </select>
          </div>
          <div>
            <label for="size">Chunk size</label>
            <input id="size" type="number" min="1" value="30" required />
          </div>
          <div>
            <label for="model">Model</label>
            <select id="model"><option>Loading…</option></select>
          </div>
        </div>
        <label for="prompt">System prompt <span style="text-transform:none;letter-spacing:0;font-weight:400;color:var(--muted)">(optional — guides the transcription model)</span></label>
        <textarea id="prompt" rows="3" placeholder="e.g. This is a medical lecture; preserve technical terms and speaker labels."></textarea>
        <div id="uploadWrap" class="upload-progress">
          <div class="bar"><i id="uploadBar" style="width:0%"></i></div>
          <span id="uploadPct" class="upload-pct">0%</span>
        </div>
        <button id="btn" class="btn" type="submit">Start transcription</button>
      </form>
      <div id="status" class="status"></div>
    </div>
  </div>

  <!-- Preview modal -->
  <div class="modal-backdrop" id="previewModal">
    <div class="modal wide">
      <div class="modal-head">
        <h2 id="previewTitle">Preview</h2>
        <button type="button" class="modal-close" data-close="previewModal">&times;</button>
      </div>
      <div class="preview-toolbar" id="previewToolbar" style="display:none">
        <button type="button" class="act" id="copyBtn">Copy transcript</button>
        <a class="act" id="downloadBtn" href="#">Download .md</a>
        <span class="spacer"></span>
        <label class="inline"><input type="checkbox" id="autoScroll" checked /> Auto-scroll</label>
        <label class="inline">Speed
          <select class="speed" id="speedSel">
            <option value="1">1×</option>
            <option value="1.25">1.25×</option>
            <option value="1.5">1.5×</option>
            <option value="2">2×</option>
          </select>
        </label>
      </div>
      <div class="markdown-body" id="previewBody"></div>
    </div>
  </div>

<script>
const $ = (id) => document.getElementById(id);
const statusEl = $('status');

/* ---------- formatting helpers ---------- */
function fmtBytes(n) {
  if (!n && n !== 0) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (i === 0 ? v : v.toFixed(v < 10 ? 2 : 1)) + ' ' + u[i];
}
function fmtDuration(sec) {
  if (!isFinite(sec) || sec <= 0) return '';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
}
// Compact local date+time for the jobs table, e.g. "May 26, 14:32".
function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
// Human elapsed time between two timestamps, e.g. "45s", "3m 24s", "1h 2m".
function fmtElapsed(fromIso, toIso) {
  const a = new Date(fromIso).getTime(), b = new Date(toIso).getTime();
  if (!isFinite(a) || !isFinite(b) || b < a) return '';
  let s = Math.round((b - a) / 1000);
  if (s < 60) return s + 's';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); s = s % 60;
  if (h) return h + 'h ' + m + 'm';
  return m + 'm ' + s + 's';
}

/* ---------- modal plumbing ---------- */
function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) {
  $(id).classList.remove('open');
  $(id).querySelectorAll('audio').forEach((a) => a.pause()); // stop segment playback on close
}
document.querySelectorAll('[data-close]').forEach((el) =>
  el.addEventListener('click', () => closeModal(el.getAttribute('data-close'))));
document.querySelectorAll('.modal-backdrop').forEach((bd) =>
  bd.addEventListener('click', (e) => { if (e.target === bd) closeModal(bd.id); }));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-backdrop.open').forEach((bd) => closeModal(bd.id));
});
// Open the create-job modal with a clean status/progress state.
$('newJobBtn').addEventListener('click', () => {
  statusEl.textContent = ''; statusEl.className = 'status';
  $('uploadWrap').classList.remove('show');
  openModal('createModal');
});

// Remember the chosen model for an instant default next time.
$('model').addEventListener('change', () => localStorage.setItem('tr_model', $('model').value));

/* ---------- file info on selection ---------- */
$('file').addEventListener('change', () => {
  const file = $('file').files[0];
  const box = $('fileInfo');
  if (!file) { box.style.display = 'none'; return; }
  const render = (durTxt) => {
    box.innerHTML = '<b>' + file.name + '</b><div class="meta">' +
      '<span>Size: <b>' + fmtBytes(file.size) + '</b></span>' +
      (durTxt ? '<span>Length: <b>' + durTxt + '</b></span>' : '') +
      (file.type ? '<span>Type: <b>' + file.type + '</b></span>' : '') +
      '</div>';
    box.style.display = 'block';
  };
  render('');
  // Probe duration client-side; some formats may not decode — degrade gracefully.
  try {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => { render(fmtDuration(audio.duration)); URL.revokeObjectURL(url); };
    audio.onerror = () => URL.revokeObjectURL(url);
    audio.src = url;
  } catch {}
});

/* ---------- models ---------- */
async function loadModels() {
  try {
    const r = await fetch('/api/transcribe/models');
    const { models } = await r.json();
    const groups = {};
    for (const m of models) {
      const provider = (m.id.split('/')[0]) || 'other';
      (groups[provider] = groups[provider] || []).push(m);
    }
    const html = Object.keys(groups).sort().map(p =>
      '<optgroup label="' + p + '">' +
      groups[p].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id))
        .map(m => '<option value="' + m.id + '">' + (m.name || m.id) + '</option>').join('') +
      '</optgroup>'
    ).join('');
    $('model').innerHTML = html || '<option value="openai/whisper-1">openai/whisper-1</option>';
  } catch {
    $('model').innerHTML = '<option value="openai/whisper-1">openai/whisper-1</option>';
  }
  // Apply the locally-remembered model immediately (DB settings may override later).
  applyModel(localStorage.getItem('tr_model'));
}

// Select a model value only if it exists among the current options.
function applyModel(value) {
  if (value && [...$('model').options].some(o => o.value === value)) {
    $('model').value = value;
    return true;
  }
  return false;
}

/* ---------- submit (XHR so we can show upload progress) ---------- */
// The bar tracks the browser → server leg; the server then streams the file on to
// the storage bucket, so the bar reaches 100% as the server begins that hand-off.
$('f').addEventListener('submit', (e) => {
  e.preventDefault();
  const file = $('file').files[0];
  if (!file) return;
  const qs = new URLSearchParams({
    filename: file.name,
    unit: $('unit').value,
    size: $('size').value,
    model: $('model').value,
  });
  const sysPrompt = $('prompt').value.trim();
  if (sysPrompt) qs.set('prompt', sysPrompt);

  const wrap = $('uploadWrap'), bar = $('uploadBar'), pct = $('uploadPct');
  $('btn').disabled = true;
  statusEl.className = 'status';
  statusEl.textContent = 'Uploading ' + file.name + '…';
  wrap.classList.add('show');
  bar.style.width = '0%'; pct.textContent = '0%';

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/transcribe?' + qs.toString());
  xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');
  xhr.upload.onprogress = (ev) => {
    if (!ev.lengthComputable) return;
    const p = Math.round(100 * ev.loaded / ev.total);
    bar.style.width = p + '%'; pct.textContent = p + '%';
    if (p >= 100) statusEl.textContent = 'Finishing upload…';
  };
  xhr.onload = () => {
    $('btn').disabled = false;
    wrap.classList.remove('show');
    let data = {};
    try { data = JSON.parse(xhr.responseText); } catch {}
    if (xhr.status >= 200 && xhr.status < 300) {
      $('f').reset();
      $('fileInfo').style.display = 'none';
      statusEl.textContent = '';
      closeModal('createModal');
      refresh();
    } else {
      statusEl.className = 'status err';
      statusEl.textContent = 'Error: ' + (data.error || ('HTTP ' + xhr.status));
    }
  };
  xhr.onerror = () => {
    $('btn').disabled = false;
    wrap.classList.remove('show');
    statusEl.className = 'status err';
    statusEl.textContent = 'Upload failed (network error)';
  };
  xhr.send(file);
});

/* ---------- jobs table ---------- */
function badge(s) { return '<span class="badge b-' + s + '">' + s + '</span>'; }

async function refresh() {
  try {
    const { jobs } = await (await fetch('/api/transcribe/jobs')).json();
    const tb = $('jobs');
    if (!jobs.length) { tb.innerHTML = '<tr><td colspan="8" style="color:var(--muted)">No jobs yet.</td></tr>'; return; }
    tb.innerHTML = jobs.map(j => {
      const pct = j.total_chunks ? Math.round(100 * j.completed_chunks / j.total_chunks) : 0;
      // Time-to-process: created→updated for finished jobs (updated_at is the
      // completion time); for active jobs, the live elapsed so far.
      const terminal = ['completed','failed','stopped'].indexOf(j.status) !== -1;
      const taken = terminal
        ? (fmtElapsed(j.created_at, j.updated_at) || '—')
        : (fmtElapsed(j.created_at, new Date().toISOString()) + ' …');
      let act = '';
      if (j.status === 'completed') {
        act = '<button class="act" onclick="openPreview(\\'' + j.id + '\\', \\'' + encodeURIComponent(j.filename || '') + '\\')">Preview</button>' +
              '<a class="act" href="/api/transcribe/jobs/' + j.id + '/result">Download</a>';
      } else if (j.status === 'failed' || j.status === 'stopped') {
        act = '<button class="act" onclick="resumeJob(\\'' + j.id + '\\')">Resume</button>';
      } else if (['pending','chunking','processing'].indexOf(j.status) !== -1) {
        act = '<button class="act" onclick="stopJob(\\'' + j.id + '\\')">Stop</button>';
      }
      // Delete is available on every job; it stops the job (if active) and wipes its files.
      act += '<button class="act danger" onclick="deleteJob(\\'' + j.id + '\\')">Delete</button>';
      // Sync = whether this transcript carries real word-level timestamps (word-synced
      // playback highlight). Absent for chat-model jobs and jobs not yet transcribed.
      const sync = j.has_words
        ? '<span class="badge b-sync">✓ sync</span>'
        : '<span style="color:var(--muted)">—</span>';
      return '<tr><td>' + j.filename + '</td><td style="color:var(--muted)">' + j.model + '</td><td>' + badge(j.status) +
        (j.error ? '<div style="color:var(--danger);font-size:.72rem;margin-top:.2rem">' + j.error + '</div>' : '') +
        '</td><td><div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<span style="font-size:.72rem;color:var(--muted)">' + j.completed_chunks + '/' + j.total_chunks + '</span></td>' +
        '<td style="color:var(--muted);font-size:.8rem;white-space:nowrap">' + fmtWhen(j.created_at) + '</td>' +
        '<td style="color:var(--muted);font-size:.8rem;white-space:nowrap">' + taken + '</td>' +
        '<td>' + sync + '</td>' +
        '<td>' + act + '</td></tr>';
    }).join('');
  } catch {}
}

async function resumeJob(id) {
  await fetch('/api/transcribe/jobs/' + id + '/resume', { method: 'POST' });
  refresh();
}
async function stopJob(id) {
  await fetch('/api/transcribe/jobs/' + id + '/stop', { method: 'POST' });
  refresh();
}
async function deleteJob(id) {
  if (!confirm('Delete this job and all of its files? This cannot be undone.')) return;
  await fetch('/api/transcribe/jobs/' + id, { method: 'DELETE' });
  refresh();
}

/* ---------- preview: per-segment audio + synced highlight ---------- */
// Loads the job's chunks (text + timing) and renders each as a segment with an
// audio player. As a segment plays, the current word is highlighted — but only
// when the chunk carries real word-level timestamps (STT/verbose_json). Chunks
// without them (e.g. chat-model transcripts) play with no highlight.
let previewChunks = []; // chunks of the open preview — used by the Copy action

async function openPreview(id, encName) {
  const name = decodeURIComponent(encName || '');
  $('previewTitle').textContent = name ? 'Preview — ' + name : 'Preview';
  $('previewBody').innerHTML = '<p style="color:var(--muted)">Loading…</p>';
  $('previewToolbar').style.display = 'none';
  previewChunks = [];
  openModal('previewModal');
  try {
    const res = await fetch('/api/transcribe/jobs/' + id);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const { chunks } = await res.json();
    previewChunks = chunks || [];
    $('downloadBtn').href = '/api/transcribe/jobs/' + id + '/result';
    renderSegments(id, previewChunks);
    $('previewToolbar').style.display = 'flex';
  } catch (err) {
    $('previewBody').innerHTML = '<p style="color:var(--danger)">Could not load result: ' + err.message + '</p>';
  }
}

// Apply the chosen playback speed to every segment player currently rendered.
function applyPlaybackSpeed() {
  const rate = Number($('speedSel').value) || 1;
  $('previewBody').querySelectorAll('.seg-audio').forEach((a) => { a.playbackRate = rate; });
}

// Toolbar wiring (elements are static, so wire once at load).
$('copyBtn').addEventListener('click', async () => {
  const text = previewChunks.map((c) => (c.transcript || '').trim()).filter(Boolean).join('\\n\\n');
  const btn = $('copyBtn'), orig = btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Copied ✓';
  } catch {
    btn.textContent = 'Copy failed';
  }
  setTimeout(() => { btn.textContent = orig; }, 1500);
});
$('speedSel').addEventListener('change', () => {
  localStorage.setItem('tr_speed', $('speedSel').value);
  applyPlaybackSpeed();
});
// Restore the remembered playback speed.
(() => {
  const saved = localStorage.getItem('tr_speed');
  if (saved && [...$('speedSel').options].some((o) => o.value === saved)) $('speedSel').value = saved;
})();

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// mm:ss (or h:mm:ss) clock that renders 0 as "0:00" (unlike fmtDuration).
function fmtClock(sec) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
}

// Escape, then apply bold/italic. Code spans and links are protected upstream,
// so this only sees plain text plus emphasis markers.
function inlineFmt(s) {
  return escapeHtml(s)
    .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
    .replace(/\\*([^*\\n]+)\\*/g, '<em>$1</em>');
}

// Apply inline markdown (bold/italic) to a text run. Code spans and links are
// pulled out behind placeholders first so emphasis markers inside them aren't
// re-processed, then restored. No highlight spans here — word wrapping for the
// playback highlight happens in a separate DOM pass (wrapWords) so it never
// breaks the rendered markup.
function inlineMd(text) {
  const store = [];
  const hide = (html) => { store.push(html); return '\\u0001' + (store.length - 1) + '\\u0001'; };
  const t = (text || '')
    .replace(/\`([^\`]+)\`/g, (_, c) => hide('<code>' + escapeHtml(c) + '</code>'))
    .replace(/\\[([^\\]]+)\\]\\(([^)\\s]+)\\)/g,
      (_, label, url) => hide('<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' + inlineFmt(label) + '</a>'));
  const restore = (s) => s.replace(/\\u0001(\\d+)\\u0001/g, (_, n) => store[n]);
  return restore(inlineFmt(t));
}

// Render a chunk transcript (Markdown) to HTML — headings, lists, blockquotes,
// fenced code, and paragraphs with soft line breaks. Inline text is formatted
// here; the per-word highlight spans are added afterwards by wrapWords.
function renderTranscript(text) {
  const lines = (text || '').replace(/\\r\\n?/g, '\\n').split('\\n');
  const isBlank = (l) => /^\\s*$/.test(l);
  const isHead = (l) => /^\\s*#{1,6}\\s+/.test(l);
  const isQuote = (l) => /^\\s*>/.test(l);
  const isFence = (l) => /^\\s*\`\`\`/.test(l);
  const isItem = (l) => /^\\s*([-*+]|\\d+[.)])\\s+/.test(l);
  let html = '', i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    if (isFence(line)) {
      i++;
      const buf = [];
      while (i < lines.length && !isFence(lines[i])) { buf.push(lines[i]); i++; }
      i++; // closing fence
      html += '<pre><code>' + escapeHtml(buf.join('\\n')) + '</code></pre>';
      continue;
    }
    const h = line.match(/^\\s*(#{1,6})\\s+(.*)$/);
    if (h) {
      const lvl = Math.min(6, h[1].length);
      html += '<h' + lvl + '>' + inlineMd(h[2].trim()) + '</h' + lvl + '>';
      i++;
      continue;
    }
    if (isQuote(line)) {
      const buf = [];
      while (i < lines.length && isQuote(lines[i])) { buf.push(lines[i].replace(/^\\s*>\\s?/, '')); i++; }
      html += '<blockquote>' + inlineMd(buf.join(' ')) + '</blockquote>';
      continue;
    }
    if (isItem(line)) {
      const ordered = /^\\s*\\d+[.)]\\s+/.test(line);
      const items = [];
      while (i < lines.length && isItem(lines[i])) {
        items.push(lines[i].replace(/^\\s*([-*+]|\\d+[.)])\\s+/, ''));
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      html += '<' + tag + '>' + items.map((it) => '<li>' + inlineMd(it.trim()) + '</li>').join('') + '</' + tag + '>';
      continue;
    }
    const buf = [];
    while (i < lines.length && !isBlank(lines[i]) && !isHead(lines[i]) &&
           !isQuote(lines[i]) && !isFence(lines[i]) && !isItem(lines[i])) {
      buf.push(lines[i].trim()); i++;
    }
    html += '<p>' + buf.map((l) => inlineMd(l)).join('<br>') + '</p>';
  }
  return html;
}

function renderSegments(jobId, chunks) {
  if (!chunks.length) {
    $('previewBody').innerHTML = '<p style="color:var(--muted)">No segments.</p>';
    return;
  }
  $('previewBody').innerHTML = chunks.map((c) => {
    const start = Number(c.start_sec) || 0;
    const end = start + (Number(c.dur_sec) || 0);
    const body = (c.transcript && c.transcript.trim())
      ? renderTranscript(c.transcript)
      : '<p><span style="color:var(--muted)">(no speech detected)</span></p>';
    return '<div class="seg">' +
        '<div class="seg-head">' +
          '<span class="seg-title">Segment ' + (c.idx + 1) +
            ' <span style="color:var(--muted);font-weight:400">(' + fmtClock(start) + '–' + fmtClock(end) + ')</span></span>' +
          '<audio class="seg-audio" controls preload="none" src="/api/transcribe/jobs/' + jobId + '/chunks/' + c.idx + '/audio"></audio>' +
        '</div>' +
        '<div class="seg-text">' + body + '</div>' +
      '</div>';
  }).join('');
  // Wrap words for highlighting (a DOM pass, so markup is never broken) and stash
  // each chunk's real word timestamps on its segment element for the sync logic.
  [...$('previewBody').querySelectorAll('.seg')].forEach((segEl, i) => {
    const textEl = segEl.querySelector('.seg-text');
    if (textEl) wrapWords(textEl);
    const w = chunks[i] && chunks[i].words;
    segEl._words = Array.isArray(w) && w.length ? w : null;
  });
  wireSegmentHighlighting();
  applyPlaybackSpeed();
}

// Wrap each visible word inside an element in a <span class="wd"> (skipping
// code/pre), preserving the surrounding markup. These spans are the highlight
// targets for word-synced playback when real word timestamps are available.
function wrapWords(container) {
  const SKIP = { CODE: 1, PRE: 1 };
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!/\\S/.test(node.nodeValue || '')) return NodeFilter.FILTER_REJECT;
      for (let p = node.parentNode; p && p !== container; p = p.parentNode) {
        if (SKIP[p.nodeName]) return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    for (const part of node.nodeValue.split(/(\\s+)/)) {
      if (!part) continue;
      if (/^\\s+$/.test(part)) {
        frag.appendChild(document.createTextNode(part));
      } else {
        const span = document.createElement('span');
        span.className = 'wd';
        span.textContent = part;
        frag.appendChild(span);
      }
    }
    node.parentNode.replaceChild(frag, node);
  }
}

function wireSegmentHighlighting() {
  const audios = [...$('previewBody').querySelectorAll('.seg-audio')];
  audios.forEach((audio) => {
    const seg = audio.closest('.seg');

    // Only one segment plays at a time; (re)apply the chosen speed on play. This is
    // wired for every segment, synced or not.
    audio.addEventListener('play', () => {
      audio.playbackRate = Number($('speedSel').value) || 1;
      audios.forEach((a) => { if (a !== audio) a.pause(); });
    });

    // Word-synced highlight requires real per-word timestamps (relative to this
    // chunk's audio) whose count matches the rendered words. When they aren't
    // present, the segment plays with no highlight at all — there is no estimate.
    const spans = [...seg.querySelectorAll('.wd')];
    const words = seg._words;
    if (!spans.length || !words || words.length !== spans.length) return;

    let last = -1;
    const setActive = (i) => {
      if (i === last) return;
      if (last >= 0 && spans[last]) spans[last].classList.remove('active');
      last = i;
      if (i < 0 || !spans[i]) return;
      spans[i].classList.add('active');
      if ($('autoScroll').checked) spans[i].scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    const clear = () => setActive(-1);

    audio.addEventListener('timeupdate', () => {
      const t = audio.currentTime;
      // Highlight the last word that has started (small lead so it tracks ahead).
      const lead = 0.12;
      let i = 0;
      for (let k = 0; k < words.length; k++) {
        if ((Number(words[k].start) || 0) <= t + lead) i = k; else break;
      }
      setActive(i);
    });
    audio.addEventListener('ended', clear);
  });
}

/* ---------- saved settings (DB) ---------- */
async function loadSettings() {
  try {
    const { settings } = await (await fetch('/api/transcribe/settings')).json();
    if (!settings) return;
    if (settings.chunk_unit) $('unit').value = settings.chunk_unit;
    if (settings.chunk_size != null) $('size').value = settings.chunk_size;
    if (settings.system_prompt) $('prompt').value = settings.system_prompt;
    if (settings.model && applyModel(settings.model)) {
      localStorage.setItem('tr_model', settings.model);
    }
  } catch {}
}

loadModels().then(loadSettings);
refresh();
setInterval(refresh, 3000);
</script>
</body>
</html>`;

module.exports = { PAGE };
