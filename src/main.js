import * as vrmManager from './vrmManager.js';
import * as ollama from './ollamaService.js';
import * as audio from './audioService.js';

// === DOM ELEMENTS ===
const canvasEl = document.getElementById('canvas-container');
const statusBadge = document.getElementById('status-badge');
const wakeModal = document.getElementById('wake-modal');
const startBtn = document.getElementById('start-btn');
const micBtn = document.getElementById('mic-btn');
const sendBtn = document.getElementById('send-btn');
const inputEl = document.getElementById('user-input');
const chatWindow = document.getElementById('chat-window');
const vizFill = document.getElementById('viz-fill');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const danceBtn = document.getElementById('dance-btn');
const vrmUpload = document.getElementById('vrm-upload');
const menuBtn = document.getElementById('menu-btn');
const menuDropdown = document.getElementById('menu-dropdown');
const bgColorPicker = document.getElementById('bg-color-picker');
const bgUrlInput = document.getElementById('bg-url-input');
const bgImageUpload = document.getElementById('bg-image-upload');
const voiceSelect = document.getElementById('voice-select');
const avatarStatusText = document.querySelector('#avatar-status .status-text');

// === STATE ===
let speechRecog = null;
let isListening = false;
let isMenuOpen = false;
let autoChatTimer = null;
let lastAutoChat = 0;

// === CHAT HELPERS ===
function addMsg(who, text, cls) {
    const d = document.createElement('div');
    d.className = 'msg ' + cls;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    d.innerHTML = `<b>${who}:</b> ${escapeHtml(text)}<div class="msg-time">${time}</div>`;
    chatWindow.appendChild(d);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return d;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setStatus(text, type = '') {
    statusBadge.querySelector('span:last-child').textContent = text;
    statusBadge.className = type ? type : '';
}

// === AUTONOMOUS CHAT ===
const AUTO_CHAT_MESSAGES = [
    "Hey, you there? 👀",
    "Kya kar rahe ho? 🤔",
    "Bored... bolo na kuch 😴",
    "Mujhe dance karna hai! 💃",
    "Chai peene ka mann kar raha hai ☕",
    "Kya tum mujhe bhool gaye? 🥺",
    "Aaj weather kaisa hai?",
    "Mujhe naya VRM try karna hai ✨",
    "Arre, sun to rahe ho na? 👂",
    "Kuch interesting bolo na! 😊",
    "Main to bas yahan wait kar rahi thi 💫",
    "Pata hai, main GenZ language mein baat kar sakti hoon! 😎",
    "Kabhi dance karao mujhe 💃",
    "Mujhe naye backgrounds pasand hain 🎨",
    "Tumhara din kaisa gaya? 🌸"
];

function scheduleAutoChat() {
    if (autoChatTimer) clearTimeout(autoChatTimer);
    const delay = 30000 + Math.random() * 90000; // 30s - 2min
    autoChatTimer = setTimeout(() => {
        if (Date.now() - lastAutoChat > 45000) { // Don't spam
            const msg = AUTO_CHAT_MESSAGES[Math.floor(Math.random() * AUTO_CHAT_MESSAGES.length)];
            addMsg('Chloe', msg, 'msg-chloe');
            lastAutoChat = Date.now();
            speakWithExpression(msg);
        }
        scheduleAutoChat();
    }, delay);
}

function speakWithExpression(text) {
    const vrm = vrmManager.getVRM();
    if (!vrm) return;
    
    // Set expression from text
    vrmManager.setExpressionFromText(text);
    
    // Trigger appropriate motion
    const lower = text.toLowerCase();
    if (lower.includes('dance') || lower.includes('nacha')) vrmManager.triggerMotion('dance');
    else if (lower.includes('hey') || lower.includes('hi') || lower.includes('hello')) vrmManager.triggerMotion('wave');
    else if (lower.includes('bored') || lower.includes('bore')) vrmManager.triggerMotion('fidget');
    else if (lower.includes('sad') || lower.includes('udaas')) vrmManager.triggerMotion('lookAround');
    else if (lower.includes('happy') || lower.includes('khush')) vrmManager.triggerMotion('hairTouch');
    
    // Speak
    audio.fetchTTS(text, function(vol) {
        vrmManager.setMouth(vol);
        vizFill.style.width = (vol * 100) + '%';
    }, vrmManager.getVoiceProfile ? vrmManager.getVoiceProfile() : null);
}

async function processText(text) {
    if (!text.trim()) return;
    addMsg('You', text, 'msg-you');
    if (isListening && speechRecog) speechRecog.stop();
    const think = addMsg('Chloe', 'Socho... 🤔', 'msg-sys');

    // Check for motion triggers
    if (text.toLowerCase().includes('dance')) vrmManager.triggerMotion('dance');
    else if (text.toLowerCase().includes('wave') || text.toLowerCase().includes('haath')) vrmManager.triggerMotion('wave');
    else if (text.toLowerCase().includes('nod') || text.toLowerCase().includes('haan')) vrmManager.triggerMotion('nod');
    else if (text.toLowerCase().includes('laugh') || text.toLowerCase().includes('has')) vrmManager.triggerMotion('laugh');
    else if (text.toLowerCase().includes('think') || text.toLowerCase().includes('soch')) vrmManager.triggerMotion('think');

    try {
        const r = await ollama.chatWithOllama(text);
        think.innerHTML = `<b>Chloe:</b> ${escapeHtml(r.cleanText)}<div class="msg-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>`;
        think.className = 'msg msg-chloe';
        r.motionTags.forEach(t => vrmManager.triggerMotion(t));
        
        // Set expression from AI response
        vrmManager.setExpressionFromText(r.cleanText);
        
        await audio.fetchTTS(r.cleanText, function(vol) {
            vrmManager.setMouth(vol);
            vizFill.style.width = (vol * 100) + '%';
        });
    } catch (err) {
        think.innerHTML = `<b>Error:</b> ${err.message || 'Unknown'}<div class="msg-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>`;
        think.className = 'msg msg-sys';
    }
    vrmManager.resetMouth();
    vizFill.style.width = '0%';
}

async function initApp() {
    // Animate wake modal out
    wakeModal.classList.add('fade-out');
    setTimeout(() => { wakeModal.style.display = 'none'; }, 800);

    try { 
        vrmManager.init(canvasEl, '/GIRL1.vrm'); 
        setStatus('Initializing...', '');
    } catch (e) { addMsg('Error', e.message, 'msg-sys'); }
    
    try { await ollama.checkOllamaStatus(statusBadge); } catch (e) {}
    
    speechRecog = audio.setupSpeechRecognition(
        function(t) { processText(t); },
        function(s) { isListening = (s === 'listening'); micBtn.classList.toggle('active', isListening); }
    );
    
    addMsg('Chloe', 'Arre! Aa gaye tum? 😊 Kya haal hai? Kya baat karni hai?', 'msg-chloe');
    setStatus('Ready', 'connected');
    avatarStatusText.textContent = 'Chloe Ready';
    
    // Start autonomous chat
    scheduleAutoChat();
}

// === EVENT LISTENERS ===
startBtn.addEventListener('click', initApp);

micBtn.addEventListener('click', function() {
    if (!speechRecog) { addMsg('System', 'Voice needs Chrome/Edge', 'msg-sys'); return; }
    isListening ? speechRecog.stop() : speechRecog.start();
});

sendBtn.addEventListener('click', function() {
    const t = inputEl.value.trim();
    if (t) { inputEl.value = ''; processText(t); }
});

inputEl.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') { const t = inputEl.value.trim(); if (t) { inputEl.value = ''; processText(t); } }
});

zoomInBtn.addEventListener('click', () => vrmManager.zoomIn());
zoomOutBtn.addEventListener('click', () => vrmManager.zoomOut());

danceBtn.addEventListener('click', function() {
    vrmManager.triggerMotion('dance');
    addMsg('Chloe', 'Chalo nachte hain! 💃✨', 'msg-chloe');
});

// === THREE DOT MENU ===
menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isMenuOpen = !isMenuOpen;
    menuDropdown.classList.toggle('open', isMenuOpen);
    menuBtn.style.transform = isMenuOpen ? 'rotate(90deg) scale(1.05)' : '';
});

document.addEventListener('click', (e) => {
    if (isMenuOpen && !menuDropdown.contains(e.target) && e.target !== menuBtn) {
        isMenuOpen = false;
        menuDropdown.classList.remove('open');
        menuBtn.style.transform = '';
    }
});

// Background Color
bgColorPicker.addEventListener('input', (e) => {
    vrmManager.setBackground(e.target.value);
    addMsg('System', `Background color: ${e.target.value}`, 'msg-sys');
});

// Background Image URL
bgUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const url = bgUrlInput.value.trim();
        if (url) {
            vrmManager.setBackgroundImage(url);
            addMsg('System', 'Background image loaded from URL', 'msg-sys');
            bgUrlInput.value = '';
        }
    }
});

// Background Image File Upload
bgImageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        vrmManager.setBackgroundImage(url);
        addMsg('System', `Background: ${file.name}`, 'msg-sys');
    }
});

// Voice Selection
voiceSelect.addEventListener('change', (e) => {
    audio.setVoiceProfile(e.target.value);
    addMsg('System', `Voice: ${e.target.selectedOptions[0].text}`, 'msg-sys');
});

// VRM Upload
vrmUpload.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f && f.name.endsWith('.vrm')) {
        vrmManager.init(canvasEl, URL.createObjectURL(f));
        addMsg('System', `Avatar: ${f.name}`, 'msg-sys');
    }
    vrmUpload.value = '';
});

// Drag & Drop VRM
canvasEl.addEventListener('dragover', (e) => e.preventDefault());
canvasEl.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith('.vrm')) {
        vrmManager.init(canvasEl, URL.createObjectURL(f));
        addMsg('System', `Avatar: ${f.name}`, 'msg-sys');
    }
});

// === INIT ===
// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (isMenuOpen) {
            isMenuOpen = false;
            menuDropdown.classList.remove('open');
            menuBtn.style.transform = '';
        }
        if (isListening && speechRecog) speechRecog.stop();
    }
    if (e.key === '/' && document.activeElement !== inputEl) {
        e.preventDefault();
        inputEl.focus();
    }
});

// Focus input on click anywhere (optional)
canvasEl.addEventListener('click', () => {
    if (!isListening) inputEl.focus();
});