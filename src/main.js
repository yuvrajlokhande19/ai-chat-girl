import * as vrmManager from './vrmManager.js';
import * as ollama from './ollamaService.js';
import * as audio from './audioService.js';

const canvasEl = document.getElementById('canvas-container');
const statusBadge = document.getElementById('status-badge');
const wakeModal = document.getElementById('wake-modal');
const startBtn = document.getElementById('start-btn');
const micBtn = document.getElementById('mic-btn');
const sendBtn = document.getElementById('send-btn');
const inputEl = document.getElementById('user-input');
const chatDrawer = document.getElementById('chat-drawer');
const vizFill = document.getElementById('viz-fill');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const bgPicker = document.getElementById('bg-picker');
const danceBtn = document.getElementById('dance-btn');

let speechRecog = null;
let isListening = false;

function addMsg(who, text, cls) {
    const d = document.createElement('div');
    d.className = 'msg ' + cls;
    d.innerHTML = '<b>' + who + ':</b> ' + text;
    chatDrawer.appendChild(d);
    chatDrawer.scrollTop = chatDrawer.scrollHeight;
    chatDrawer.classList.add('open');
    return d;
}

async function processText(text) {
    if (!text.trim()) return;
    addMsg('You', text, 'msg-you');
    if (isListening && speechRecog) speechRecog.stop();
    const think = addMsg('Chloe', 'Thinking...', 'msg-sys');

    // Check for dance command locally
    if (text.toLowerCase().includes('dance')) {
        vrmManager.triggerMotion('dance');
    }

    try {
        const r = await ollama.chatWithOllama(text);
        think.innerHTML = '<b>Chloe:</b> ' + r.cleanText;
        think.className = 'msg msg-chloe';
        r.motionTags.forEach(t => vrmManager.triggerMotion(t));
        await audio.fetchTTS(r.cleanText, function(vol) {
            vrmManager.setMouth(vol);
            vizFill.style.width = (vol * 100) + '%';
        });
    } catch (err) {
        think.innerHTML = '<b>Error:</b> ' + (err.message || 'Unknown');
        think.className = 'msg msg-sys';
    }
    vrmManager.resetMouth();
    vizFill.style.width = '0%';
}

async function initApp() {
    wakeModal.style.display = 'none';
    try { vrmManager.init(canvasEl, '/GIRL1.vrm'); } catch (e) { addMsg('Error', e.message, 'msg-sys'); }
    try { await ollama.checkOllamaStatus(statusBadge); } catch (e) {}
    speechRecog = audio.setupSpeechRecognition(
        function(t) { processText(t); },
        function(s) { isListening = (s === 'listening'); micBtn.classList.toggle('active', isListening); }
    );
    addMsg('System', 'Chloe ready! Say "dance" or click the Dance button!', 'msg-sys');
}

startBtn.addEventListener('click', initApp);

micBtn.addEventListener('click', function() {
    if (!speechRecog) { addMsg('Error', 'Use Chrome for voice', 'msg-sys'); return; }
    isListening ? speechRecog.stop() : speechRecog.start();
});

sendBtn.addEventListener('click', function() {
    const t = inputEl.value.trim();
    if (t) { inputEl.value = ''; processText(t); }
});

inputEl.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') { const t = inputEl.value.trim(); if (t) { inputEl.value = ''; processText(t); } }
});

// Zoom buttons
zoomInBtn.addEventListener('click', function() { vrmManager.zoomIn(); });
zoomOutBtn.addEventListener('click', function() { vrmManager.zoomOut(); });

// Background color
bgPicker.addEventListener('input', function(e) {
    vrmManager.setBackground(e.target.value);
});

// Dance button
danceBtn.addEventListener('click', function() {
    vrmManager.triggerMotion('dance');
    addMsg('System', 'Dance time!', 'msg-sys');
});

// Drag & drop VRM
canvasEl.addEventListener('dragover', function(e) { e.preventDefault(); });
canvasEl.addEventListener('drop', function(e) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith('.vrm')) { vrmManager.init(canvasEl, URL.createObjectURL(f)); addMsg('System', 'Avatar: ' + f.name, 'msg-sys'); }
});
