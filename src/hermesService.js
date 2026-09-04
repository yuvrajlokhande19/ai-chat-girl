// hermesService.js — Arohi <-> Hermes (Laptop Copilot) integration.
//
// The browser can't spawn processes, so there is a tiny Node bridge on the
// laptop (bridge/hermes-bridge.cjs, run with `npm run bridge`) that receives a
// prompt and executes it with the real Hermes agent CLI:
//
//     hermes -z "<prompt>"          (Hermes runs gemma4 via ollama-launch)
//
// Arohi's normal chat uses the local gemma4 model directly (fast), and only
// messages that look like computer/task work are routed through Hermes so it
// can create files, manage folders, run commands, etc. On GitHub Pages (or any
// machine without the bridge) the health check fails and Arohi explains.

const BRIDGE_URL = 'http://127.0.0.1:9123';
const OLLAMA_URL = 'http://127.0.0.1:11434/api/chat';
const OLLAMA_MODEL = 'gemma4:latest';

// ---- Bridge connection -----------------------------------------------------

let healthCache = null;
let healthCacheAt = 0;

export async function health(force) {
    const now = Date.now();
    if (!force && healthCache && now - healthCacheAt < 8000) return healthCache;
    try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 2000);
        const res = await fetch(BRIDGE_URL + '/health', { signal: ctrl.signal });
        clearTimeout(tid);
        const ok = res.ok;
        healthCache = { ok, ms: 0, model: ok ? 'gemma4' : null };
        healthCacheAt = now;
        return healthCache;
    } catch (e) {
        healthCache = { ok: false, ms: 0, model: null };
        healthCacheAt = now;
        return healthCache;
    }
}

export async function runTask(prompt) {
    const started = Date.now();
    try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 15 * 60 * 1000);
        const res = await fetch(BRIDGE_URL + '/api/hermes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: String(prompt || '') }),
            signal: ctrl.signal,
        });
        clearTimeout(tid);
        let body = {};
        try { body = await res.json(); } catch (e) {}
        return {
            ok: res.ok && !!(body && body.ok) && !!(body && body.output),
            output: (body && body.output) || '',
            error: (body && body.error) || 'HTTP ' + res.status,
            ms: Date.now() - started,
        };
    } catch (e) {
        return { ok: false, output: '', error: 'Bridge unreachable: ' + e.message, ms: Date.now() - started };
    }
}

// ---- Task intent -----------------------------------------------------------

const TASK_PREFIXES = ['hermes:', '!task', '/task', 'task:'];

const TASK_VERBS = [
    'create', 'make', 'save', 'write', 'edit', 'rename', 'delete', 'remove',
    'move', 'copy', 'download', 'install', 'uninstall', 'open', 'run', 'close',
    'start', 'stop', 'search', 'find', 'list', 'sort', 'organize', 'organise',
    'backup', 'clean', 'cleanup', 'scan', 'extract', 'zip', 'unzip', 'convert',
    'bana', 'karo', 'karke', 'rakho', 'daalo', 'kholo', 'band', 'chalao',
];

const TASK_TOKENS = [
    'file', 'files', 'folder', 'folders', 'directory', 'directories',
    'downloads', 'desktop', 'documents', 'document', '.txt', 'script',
    'command', 'terminal', 'powershell', 'cmd', 'hermes', 'download karo',
    'folder bana', 'file bana', 'save karo',
];

export function isTask(text) {
    if (!text) return null;
    const t = String(text).trim();
    if (!t) return null;
    const mark = t.match(/^(hermes\s*:\s*|!task\s+|task\s*:\s*)/i);
    if (mark) return t.slice(mark[0].length).trim() || t;
    const lower = t.toLowerCase();
    if (/\bhermes\b/.test(lower)) return t;
    const hasVerb = TASK_VERBS.some((v) => new RegExp('\\b' + v + '\\b', 'i').test(lower));
    const hasToken = TASK_TOKENS.some((tok) => lower.includes(tok));
    if (hasVerb && hasToken) return t;
    return null;
}

// ---- Summary (spoken by Arohi after a Hermes run) --------------------------

export async function summarize(taskText, outputText) {
    const clipped = String(outputText || '').slice(0, 1500);
    try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 60000);
        const res = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                keep_alive: '25m',
                stream: false,
                messages: [
                    {
                        role: 'system',
                        content:
                            'You turn the raw result of a computer task into a short, friendly,' +
                            ' 1-2 sentence Hindi-English (Hinglish) summary that a teenage girl assistant' +
                            ' named Arohi will speak out loud. Mention clearly WHERE anything was saved' +
                            ' (for example "the file is saved in your Downloads folder", or the exact path).' +
                            ' Keep it natural, no emojis, no markdown, no bullet points.',
                    },
                    {
                        role: 'user',
                        content:
                            'Task I asked for: "' + String(taskText).slice(0, 300) + '"\n' +
                            'Result from the tool:\n' + clipped,
                    },
                ],
            }),
            signal: ctrl.signal,
        });
        clearTimeout(tid);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const text = (data && data.message && data.message.content) || '';
        const clean = text
            .replace(/```/g, '')
            .replace(/\*+/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (clean) return clean;
        throw new Error('empty summary');
    } catch (e) {
        // Fallback: mention paths found in the raw output.
        const paths = [];
        const pRe = /([A-Za-z]:\\[^\s"']+|~(?:\\|\/)[^\s"']+)/g;
        let m;
        while ((m = pRe.exec(outputText || ''))) paths.push(m[1].replace(/[)>;:,]/g, ''));
        const unique = [...new Set(paths)].slice(0, 3);
        if (/download/i.test(outputText || '')) {
            return 'Kaam ho gaya! Iska result tumhare Download folder mein mil jayega.';
        }
        if (unique.length) {
            return 'Kaam ho gaya! Maine " ' + unique[0] + ' " mein save kar diya.';
        }
        return 'Kaam ho gaya yaar! Hermes ne task complete kar diya.';
    }
}

// Human-readable bridge URL (for status text in the options menu).
export function bridgeUrl() { return BRIDGE_URL; }