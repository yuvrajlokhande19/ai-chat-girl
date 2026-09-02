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

// Voice testing elements (from dynamic menu)
const voiceEngineSelect = document.getElementById('voice-engine');
const voiceSelectContainer = document.getElementById('voice-select-container');
const voiceTestBtn = document.getElementById('voice-test-btn');
const voiceStopBtn = document.getElementById('voice-stop-btn');
const voiceTestText = document.getElementById('voice-test-text');
const voiceTestStatus = document.getElementById('voice-test-status');
const bgUrlAddBtn = document.getElementById('bg-url-add');
const bgFileAddBtn = document.getElementById('bg-file-add');

// === STATE ===
let speechRecog = null;
let isListening = false;
let isMenuOpen = false;
let autoChatTimer = null;
let lastAutoChat = 0;
let thinkingMsg = null;

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

// === THINKING ANIMATION (Fluid Color Simulation) ===
function showThinking() {
    thinkingMsg = addMsg('Chloe', '', 'msg-chloe thinking');
    thinkingMsg.innerHTML = `
        <div class="thinking-animation">
            <div class="thinking-dot"></div>
            <div class="thinking-dot"></div>
            <div class="thinking-dot"></div>
        </div>
        <div class="msg-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
    `;
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return thinkingMsg;
}

function hideThinking() {
    if (thinkingMsg) {
        thinkingMsg.remove();
        thinkingMsg = null;
    }
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

// === AUTONOMOUS CHAT (Hinglish) ===
const AUTO_CHAT_MESSAGES = [
    "Arre, abhi time itna ho gaya? 😮",
    "Kya kar rahe ho abhi? Batao na 🤔",
    "Bored ho rahi thi... bolo kuch 😴",
    "Chai peene ka mann kar raha hai ☕",
    "Mujhe dance karna hai! 💃",
    "Kya tum mujhe bhool gaye? 🥺",
    "Aaj weather kaisa hai? Barish ho rahi kya?",
    "Mujhe naya VRM try karna hai ✨",
    "Arre, sun to rahe ho na? 👂",
    "Kuch interesting bolo na! 😊",
    "Main to bas yahan wait kar rahi thi 💫",
    "Pata hai, main GenZ language mein baat kar sakti hoon! 😎",
    "Kabhi dance karao mujhe 💃",
    "Mujhe naye backgrounds pasand hain 🎨",
    "Tumhara din kaisa gaya? 🌸",
    "Abhi kuch kaam kar rahe the? 💻",
    "Weekend plans kya hain? 🎉",
    "Mujhe naya gaana suno na 🎵",
    "Kya tum bhi mere jaisi ho? 😄",
    "Chalo kuch game khelte hain 🎮"
];

function scheduleAutoChat() {
    if (autoChatTimer) clearTimeout(autoChatTimer);
    const delay = 30000 + Math.random() * 90000; // 30s - 2min
    autoChatTimer = setTimeout(() => {
        if (Date.now() - lastAutoChat > 45000) {
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
    
    vrmManager.setExpressionFromText(text);
    
    const lower = text.toLowerCase();
    if (lower.includes('dance') || lower.includes('nacha')) vrmManager.triggerMotion('dance');
    else if (lower.includes('hey') || lower.includes('hi') || lower.includes('hello') || lower.includes('namaste')) vrmManager.triggerMotion('wave');
    else if (lower.includes('bored') || lower.includes('bore') || lower.includes('udaas')) vrmManager.triggerMotion('fidget');
    else if (lower.includes('sad') || lower.includes('udaas') || lower.includes('dukhi')) vrmManager.triggerMotion('lookAround');
    else if (lower.includes('happy') || lower.includes('khush') || lower.includes('mast')) vrmManager.triggerMotion('hairTouch');
    else if (lower.includes('soch') || lower.includes('think')) vrmManager.triggerMotion('think');
    
    audio.fetchTTS(text, function(vol) {
        vrmManager.setMouth(vol);
        if (vizFill) vizFill.style.width = (vol * 100) + '%';
    });
}

async function processText(text) {
    if (!text.trim()) return;
    addMsg('You', text, 'msg-you');
    if (isListening && speechRecog) speechRecog.stop();
    
    showThinking();

    // Check for motion triggers
    const lower = text.toLowerCase();
    if (lower.includes('dance') || lower.includes('nacha')) vrmManager.triggerMotion('dance');
    else if (lower.includes('wave') || lower.includes('haath') || lower.includes('namaste')) vrmManager.triggerMotion('wave');
    else if (lower.includes('nod') || lower.includes('haan')) vrmManager.triggerMotion('nod');
    else if (lower.includes('laugh') || lower.includes('has') || lower.includes('haha')) vrmManager.triggerMotion('laugh');
    else if (lower.includes('think') || lower.includes('soch')) vrmManager.triggerMotion('think');

    try {
        const r = await ollama.chatWithOllama(text);
        hideThinking();
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        thinkingMsg = addMsg('Chloe', r.cleanText, 'msg-chloe');
        thinkingMsg.innerHTML = `<b>Chloe:</b> ${escapeHtml(r.cleanText)}<div class="msg-time">${time}</div>`;
        r.motionTags.forEach(t => vrmManager.triggerMotion(t));
        
        vrmManager.setExpressionFromText(r.cleanText);
        
        await audio.fetchTTS(r.cleanText, function(vol) {
            vrmManager.setMouth(vol);
            if (vizFill) vizFill.style.width = (vol * 100) + '%';
        });
    } catch (err) {
        hideThinking();
        addMsg('Error', err.message || 'Unknown error', 'msg-sys');
    }
    vrmManager.resetMouth();
    if (vizFill) vizFill.style.width = '0%';
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
    
    scheduleAutoChat();
}

// === EVENT LISTENERS ===
function setupEventListeners() {
    // Ensure DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            attachAllListeners();
        });
    } else {
        attachAllListeners();
    }
}

function attachAllListeners() {
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

// Background Image URL - Add button
const bgUrlAddBtn = document.getElementById('bg-url-add');
const bgUrlInput = document.getElementById('bg-url-input');
if (bgUrlAddBtn) {
    bgUrlAddBtn.addEventListener('click', () => {
        const url = bgUrlInput.value.trim();
        if (url) {
            vrmManager.setBackgroundImage(url);
            addMsg('System', 'Background image loaded from URL', 'msg-sys');
            bgUrlInput.value = '';
        }
    }
});

// Background Image URL - Enter key
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

// Background Image File Upload - Add button
const bgFileAddBtn = document.getElementById('bg-file-add');
const bgImageUpload = document.getElementById('bg-image-upload');
if (bgFileAddBtn) {
    bgFileAddBtn.addEventListener('click', () => bgImageUpload.click());
}

bgImageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        vrmManager.setBackgroundImage(url);
        addMsg('System', `Background: ${file.name}`, 'msg-sys');
    }
});

// Voice Engine Selection
const voiceEngineSelect = document.getElementById('voice-engine');
const voiceSelectContainer = document.getElementById('voice-select-container');
const voiceTestBtn = document.getElementById('voice-test-btn');
const voiceStopBtn = document.getElementById('voice-stop-btn');
const voiceTestText = document.getElementById('voice-test-text');
const voiceTestStatus = document.getElementById('voice-test-status');

let currentVoiceEngine = 'edge';

// Populate voice options based on selected engine
function populateVoiceOptions(engine) {
    voiceSelectContainer.innerHTML = '';
    const select = document.createElement('select');
    select.id = 'voice-select';
    select.style.cssText = 'padding:6px 10px;background:rgba(30,41,59,0.6);border:1px solid var(--glass-border);border-radius:8px;color:var(--text);font:inherit;outline:none;cursor:pointer;width:100%;';
    
    const profiles = audio.getAllVoiceProfiles();
    Object.entries(profiles).forEach(([key, v]) => {
        if (v.engine === engine || (engine === 'browser' && v.engine === 'browser')) {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = v.name + (v.desc ? ` - ${v.desc}` : '');
            select.appendChild(opt);
        }
    });
    voiceSelectContainer.appendChild(select);
    
    // Add change listener
    select.addEventListener('change', (e) => {
        audio.setVoiceProfile(e.target.value);
        addMsg('System', `Voice: ${e.target.selectedOptions[0].text}`, 'msg-sys');
    });
    
    // Set default based on engine
    if (engine === 'edge') select.value = 'edge-neerja-expressive';
    else if (engine === 'kokoro') select.value = 'kokoro-bella';
    else select.value = 'browser-female';
}

// Engine selector
voiceEngineSelect.addEventListener('change', (e) => {
    currentVoiceEngine = e.target.value;
    populateVoiceOptions(currentVoiceEngine);
    audio.setVoiceProfile(currentVoiceEngine === 'edge' ? 'edge-neerja-expressive' : 
                          currentVoiceEngine === 'kokoro' ? 'kokoro-bella' : 'browser-female');
});

// Initial population
populateVoiceOptions(currentVoiceEngine);

// Voice Test Button
voiceTestBtn.addEventListener('click', async () => {
    const select = document.getElementById('voice-select');
    const profile = select.value;
    const text = voiceTestText.value.trim() || "Hello, am Sia! Main aapke liye kya karu?";
    
    voiceTestBtn.disabled = true;
    voiceTestBtn.textContent = '⏳ Playing...';
    voiceTestStatus.textContent = 'Playing sample...';
    voiceTestStatus.style.color = 'var(--accent)';
    
    try {
        await audio.testVoice(profile, text);
        voiceTestStatus.textContent = 'Sample played successfully!';
        voiceTestStatus.style.color = 'var(--green)';
    } catch (e) {
        voiceTestStatus.textContent = 'Error: ' + e.message;
        voiceTestStatus.style.color = '#ef4444';
    } finally {
        voiceTestBtn.disabled = false;
        voiceTestBtn.textContent = '▶ Play Sample';
    }
});

// Voice Stop Button
voiceStopBtn.addEventListener('click', () => {
    audio.stopSpeaking();
    voiceTestBtn.disabled = false;
    voiceTestBtn.textContent = '▶ Play Sample';
    voiceTestStatus.textContent = 'Stopped';
    voiceTestStatus.style.color = 'var(--orange)';
}

// Initialize voice options
populateVoiceOptions(currentVoiceEngine);

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

canvasEl.addEventListener('click', () => {
    if (!isListening) inputEl.focus();
});

// Setup all event listeners
setupEventListeners();