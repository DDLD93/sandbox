// Inline HTML for the transcriber page. Light, professional theme shared with the
// fetch/download page. Advanced controls live in a settings modal; results can be
// previewed (rendered Markdown) in a modal or downloaded.

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
      <thead><tr><th>File</th><th>Model</th><th>Status</th><th>Progress</th><th></th></tr></thead>
      <tbody id="jobs"><tr><td colspan="5" style="color:var(--muted)">No jobs yet.</td></tr></tbody>
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

/* ---------- modal plumbing ---------- */
function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }
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
    if (!jobs.length) { tb.innerHTML = '<tr><td colspan="5" style="color:var(--muted)">No jobs yet.</td></tr>'; return; }
    tb.innerHTML = jobs.map(j => {
      const pct = j.total_chunks ? Math.round(100 * j.completed_chunks / j.total_chunks) : 0;
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
      return '<tr><td>' + j.filename + '</td><td style="color:var(--muted)">' + j.model + '</td><td>' + badge(j.status) +
        (j.error ? '<div style="color:var(--danger);font-size:.72rem;margin-top:.2rem">' + j.error + '</div>' : '') +
        '</td><td><div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<span style="font-size:.72rem;color:var(--muted)">' + j.completed_chunks + '/' + j.total_chunks + '</span></td>' +
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

/* ---------- markdown preview ---------- */
async function openPreview(id, encName) {
  const name = decodeURIComponent(encName || '');
  $('previewTitle').textContent = name ? 'Preview — ' + name : 'Preview';
  $('previewBody').innerHTML = '<p style="color:var(--muted)">Loading…</p>';
  openModal('previewModal');
  try {
    const res = await fetch('/api/transcribe/jobs/' + id + '/result?inline=1');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    $('previewBody').innerHTML = renderMarkdown(text);
  } catch (err) {
    $('previewBody').innerHTML = '<p style="color:var(--danger)">Could not load result: ' + err.message + '</p>';
  }
}

// Minimal, XSS-safe Markdown renderer. Escapes HTML first, then applies block and
// inline rules sufficient for transcription output (headings, lists, code, quotes…).
function renderMarkdown(src) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Links resolved via a callback (avoids fragile $-ref handling), then emphasis/code.
  const linkify = (s) => s.replace(/\\[([^\\]]+)\\]\\((https?:[^)\\s]+)\\)/g,
    (_, txt, href) => '<a href="' + href + '" target="_blank" rel="noopener">' + txt + '</a>');
  const inline = (s) => esc(s)
    .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
    .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\\*([^*\\n]+)\\*/g, '$1<em>$2</em>');

  const lines = src.replace(/\\r\\n?/g, '\\n').split('\\n');
  let out = '';
  let i = 0;
  let listType = null; // 'ul' | 'ol'
  const closeList = () => { if (listType) { out += '</' + listType + '>'; listType = null; } };

  while (i < lines.length) {
    let line = lines[i];

    // fenced code block
    if (/^\`\`\`/.test(line)) {
      closeList();
      i++;
      let code = '';
      while (i < lines.length && !/^\`\`\`/.test(lines[i])) { code += lines[i] + '\\n'; i++; }
      i++; // skip closing fence
      out += '<pre><code>' + esc(code.replace(/\\n$/, '')) + '</code></pre>';
      continue;
    }

    const fmt = (s) => linkify(inline(s));

    let m;
    if ((m = line.match(/^(#{1,6})\\s+(.*)$/))) {
      closeList();
      const lvl = m[1].length;
      out += '<h' + lvl + '>' + fmt(m[2]) + '</h' + lvl + '>';
    } else if (/^\\s*[-*+]\\s+/.test(line)) {
      if (listType !== 'ul') { closeList(); out += '<ul>'; listType = 'ul'; }
      out += '<li>' + fmt(line.replace(/^\\s*[-*+]\\s+/, '')) + '</li>';
    } else if (/^\\s*\\d+\\.\\s+/.test(line)) {
      if (listType !== 'ol') { closeList(); out += '<ol>'; listType = 'ol'; }
      out += '<li>' + fmt(line.replace(/^\\s*\\d+\\.\\s+/, '')) + '</li>';
    } else if (/^\\s*>\\s?/.test(line)) {
      closeList();
      out += '<blockquote>' + fmt(line.replace(/^\\s*>\\s?/, '')) + '</blockquote>';
    } else if (line.trim() === '') {
      closeList();
    } else {
      closeList();
      // gather consecutive non-blank lines into one paragraph (soft breaks)
      let para = line;
      while (i + 1 < lines.length && lines[i + 1].trim() !== '' &&
             !/^(#{1,6}\\s|\\s*[-*+]\\s|\\s*\\d+\\.\\s|\\s*>|\`\`\`)/.test(lines[i + 1])) {
        i++; para += '<br>' + lines[i];
      }
      out += '<p>' + fmt(para) + '</p>';
    }
    i++;
  }
  closeList();
  return out || '<p style="color:var(--muted)">Empty result.</p>';
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
