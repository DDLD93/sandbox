// Inline HTML for the transcriber page. Mirrors the dark-card styling of the
// fetch/download page for visual consistency.

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Audio Transcriber</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; padding: 3rem 1rem;
    font: 16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: radial-gradient(circle at 30% 10%, #1e293b, #0f172a 60%);
    color: #e2e8f0; display: flex; flex-direction: column; align-items: center; gap: 1.6rem;
  }
  a { color: #38bdf8; }
  .nav { width: min(820px, 94vw); font-size: .85rem; color: #64748b; }
  .card {
    width: min(820px, 94vw); padding: 2rem;
    background: rgba(30, 41, 59, .7); border: 1px solid #334155;
    border-radius: 18px; box-shadow: 0 20px 60px rgba(0,0,0,.45); backdrop-filter: blur(6px);
  }
  h1 { margin: 0 0 .3rem; font-size: 1.5rem; }
  p.sub { margin: 0 0 1.5rem; color: #94a3b8; font-size: .92rem; }
  label { display: block; font-size: .8rem; color: #94a3b8; margin: 1rem 0 .35rem; }
  input, select {
    width: 100%; padding: .7rem .9rem; font-size: 1rem;
    background: #0f172a; color: #e2e8f0; border: 1px solid #334155; border-radius: 10px; outline: none;
  }
  input:focus, select:focus { border-color: #38bdf8; box-shadow: 0 0 0 3px rgba(56,189,248,.2); }
  .row { display: flex; gap: 1rem; }
  .row > div { flex: 1; }
  button {
    margin-top: 1.4rem; width: 100%; padding: .85rem; font-size: 1rem; font-weight: 600;
    color: #04121f; background: linear-gradient(135deg, #38bdf8, #22d3ee);
    border: 0; border-radius: 10px; cursor: pointer; transition: opacity .15s;
  }
  button:disabled { opacity: .55; cursor: progress; }
  .status { margin-top: 1rem; min-height: 1.4rem; font-size: .9rem; }
  .status.err { color: #f87171; } .status.ok { color: #4ade80; }
  table { width: 100%; border-collapse: collapse; font-size: .85rem; margin-top: .5rem; }
  th, td { text-align: left; padding: .55rem .5rem; border-bottom: 1px solid #1e293b; }
  th { color: #64748b; font-weight: 600; }
  .badge { padding: .15rem .5rem; border-radius: 999px; font-size: .72rem; font-weight: 600; }
  .b-completed { background: #064e3b; color: #6ee7b7; }
  .b-failed { background: #4c0519; color: #fda4af; }
  .b-processing, .b-chunking, .b-pending { background: #1e3a8a; color: #93c5fd; }
  .bar { height: 6px; background: #1e293b; border-radius: 999px; overflow: hidden; min-width: 70px; }
  .bar > i { display: block; height: 100%; background: #22d3ee; }
  .act { background: none; border: 1px solid #334155; color: #e2e8f0; width: auto; margin: 0;
         padding: .3rem .6rem; border-radius: 8px; font-size: .75rem; cursor: pointer; }
</style>
</head>
<body>
  <div class="nav">&larr; <a href="/">Fetch &amp; Download</a></div>

  <div class="card">
    <h1>Audio Transcriber</h1>
    <p class="sub">Upload audio — we split it into chunks, transcribe each via OpenRouter, and compile one Markdown document. Jobs are tracked and resumable.</p>
    <form id="f">
      <label for="file">Audio file</label>
      <input id="file" type="file" accept="audio/*" required />
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
      <button id="btn" type="submit">Start transcription</button>
    </form>
    <div id="status" class="status"></div>
  </div>

  <div class="card">
    <h1 style="font-size:1.2rem">Jobs</h1>
    <table>
      <thead><tr><th>File</th><th>Model</th><th>Status</th><th>Progress</th><th></th></tr></thead>
      <tbody id="jobs"><tr><td colspan="5" style="color:#64748b">No jobs yet.</td></tr></tbody>
    </table>
  </div>

<script>
const $ = (id) => document.getElementById(id);
const statusEl = $('status');

async function loadModels() {
  try {
    const r = await fetch('/api/transcribe/models');
    const { models } = await r.json();
    $('model').innerHTML = models.map(m => '<option value="' + m.id + '">' + (m.name || m.id) + '</option>').join('');
  } catch {
    $('model').innerHTML = '<option value="openai/whisper-1">openai/whisper-1</option>';
  }
}

$('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = $('file').files[0];
  if (!file) return;
  const qs = new URLSearchParams({
    filename: file.name,
    unit: $('unit').value,
    size: $('size').value,
    model: $('model').value,
  });
  $('btn').disabled = true;
  statusEl.className = 'status';
  statusEl.textContent = 'Uploading ' + file.name + '…';
  try {
    const res = await fetch('/api/transcribe?' + qs.toString(), {
      method: 'POST',
      headers: { 'content-type': file.type || 'application/octet-stream' },
      body: file,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    statusEl.className = 'status ok';
    statusEl.textContent = 'Started job ' + data.jobId;
    $('f').reset();
    refresh();
  } catch (err) {
    statusEl.className = 'status err';
    statusEl.textContent = 'Error: ' + err.message;
  } finally {
    $('btn').disabled = false;
  }
});

function badge(s) { return '<span class="badge b-' + s + '">' + s + '</span>'; }

async function refresh() {
  try {
    const { jobs } = await (await fetch('/api/transcribe/jobs')).json();
    const tb = $('jobs');
    if (!jobs.length) { tb.innerHTML = '<tr><td colspan="5" style="color:#64748b">No jobs yet.</td></tr>'; return; }
    tb.innerHTML = jobs.map(j => {
      const pct = j.total_chunks ? Math.round(100 * j.completed_chunks / j.total_chunks) : 0;
      let act = '';
      if (j.status === 'completed') act = '<a class="act" href="/api/transcribe/jobs/' + j.id + '/result">View Markdown</a>';
      else if (j.status === 'failed') act = '<button class="act" onclick="resumeJob(\\'' + j.id + '\\')">Resume</button>';
      return '<tr><td>' + j.filename + '</td><td style="color:#94a3b8">' + j.model + '</td><td>' + badge(j.status) +
        (j.error ? '<div style="color:#f87171;font-size:.7rem">' + j.error + '</div>' : '') +
        '</td><td><div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<span style="font-size:.7rem;color:#64748b">' + j.completed_chunks + '/' + j.total_chunks + '</span></td>' +
        '<td>' + act + '</td></tr>';
    }).join('');
  } catch {}
}

async function resumeJob(id) {
  await fetch('/api/transcribe/jobs/' + id + '/resume', { method: 'POST' });
  refresh();
}

loadModels();
refresh();
setInterval(refresh, 3000);
</script>
</body>
</html>`;

module.exports = { PAGE };
