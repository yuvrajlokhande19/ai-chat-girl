// hermes-bridge.cjs — local HTTP bridge between Arohi (browser) and the Hermes
// agent CLI. Run with: npm run bridge
//
//   GET  /health          -> { ok, model }
//   POST /api/hermes      -> body { prompt } -> { ok, output, error, ms }
//
// It executes the Hermes agent in one-shot mode: hermes -z "<prompt>".
// Hermes is already configured to run gemma4 via ollama-launch on this laptop.

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.HERMES_BRIDGE_PORT || 9123);
const HOST = process.env.HERMES_BRIDGE_HOST || '127.0.0.1';
const TASK_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_OUTPUT = 12000;

// ---- Locate hermes.exe -----------------------------------------------------
const DEFAULT_BIN = 'C:\\Users\\lokha\\AppData\\Local\\hermes\\hermes-agent\\venv\\Scripts\\hermes.exe';

function resolveHermesBin() {
  if (process.env.HERMES_BIN && fs.existsSync(process.env.HERMES_BIN)) return process.env.HERMES_BIN;
  if (fs.existsSync(DEFAULT_BIN)) return DEFAULT_BIN;
  try {
    const out = require('child_process').execSync('where hermes', { encoding: 'utf8', shell: 'cmd.exe' });
    const first = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
    if (first && fs.existsSync(first)) return first;
  } catch (e) { /* not on PATH */ }
  return null;
}

const HERMES_BIN = resolveHermesBin();

// ---- CORS helpers ----------------------------------------------------------
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) { req.destroy(); resolve(''); } });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}

// ---- Run Hermes one-shot ---------------------------------------------------
function runHermes(prompt) {
  return new Promise((resolve) => {
    const started = Date.now();
    if (!HERMES_BIN) {
      resolve({ ok: false, output: '', error: 'hermes.exe not found. Install Hermes Agent first.' });
      return;
    }
    const args = ['-z', String(prompt || ''), '--cli'];
    let child;
    try {
      child = spawn(HERMES_BIN, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      });
    } catch (e) {
      resolve({ ok: false, output: '', error: 'spawn failed: ' + e.message });
      return;
    }

    let stdout = '';
    let stderr = '';
    let finished = false;

    const killer = setTimeout(() => { finished = true; try { child.kill('SIGKILL'); } catch (e) {} }, TASK_TIMEOUT_MS);

    child.stdout.on('data', (d) => { stdout += d; if (stdout.length > MAX_OUTPUT) stdout = stdout.slice(0, MAX_OUTPUT); });
    child.stderr.on('data', (d) => { stderr += d; if (stderr.length > MAX_OUTPUT) stderr = stderr.slice(0, MAX_OUTPUT); });

    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(killer);
      const out = stdout.trim();
      resolve({
        ok: out.length > 0,
        output: out,
        error: out ? (stderr.trim() ? '' : '') : (stderr.trim() || 'Hermes returned no output'),
        ms: Date.now() - started,
      });
    };

    child.on('error', (e) => { if (finished) return; finished = true; clearTimeout(killer); resolve({ ok: false, output: '', error: 'error: ' + e.message, ms: Date.now() - started }); });
    child.on('close', done);
  });
}

// ---- HTTP server -----------------------------------------------------------
http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { send(res, 204, {}); return; }

  if (req.method === 'GET' && req.url.split('?')[0] === '/health') {
    send(res, 200, { ok: !!HERMES_BIN, model: 'gemma4', bin: HERMES_BIN ? '(detected)' : null });
    return;
  }

  if (req.method === 'POST' && req.url.split('?')[0] === '/api/hermes') {
    const raw = await readBody(req);
    let prompt = '';
    try { prompt = (JSON.parse(raw || '{}').prompt || '').toString().trim(); } catch (e) { prompt = ''; }
    if (!prompt) { send(res, 400, { ok: false, output: '', error: 'Missing prompt' }); return; }
    const r = await runHermes(prompt);
    send(res, r.ok ? 200 : 502, r);
    return;
  }

  send(res, 404, { ok: false, output: '', error: 'Not found' });
}).listen(PORT, HOST, () => {
  console.log('[hermes-bridge] listening on http://' + HOST + ':' + PORT);
  console.log('[hermes-bridge] hermes bin: ' + (HERMES_BIN || 'NOT FOUND'));
});