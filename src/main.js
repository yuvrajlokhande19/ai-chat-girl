import * as vrmManager from './vrmManager.js';
import * as model from './modelService.js';
import * as audio from './audioService.js';
import * as persona from './persona.js';

// === DOM ELEMENTS ===
const canvasEl = document.getElementById('canvas-container');
const statusBadge = document.getElementById('status-badge');
const wakeModal = document.getElementById('wake-modal');
const startBtn = document.getElementById('start-btn');
const micBtn = document.getElementById('mic-btn');
const sendBtn = document.getElementById('send-btn');
const inputEl = document.getElementById('user-input');
const chatWindow = document.getElementById('chat-window');
const chatClearBtn = document.getElementById('chat-clear-btn');
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
const avatarStatusText = document.querySelector('#avatar-status .status-text');

// Voice / model testing elements
const voiceEngineSelect = document.getElementById('voice-engine');
const voiceSelectContainer = document.getElementById('voice-select-container');
const voiceTestBtn = document.getElementById('voice-test-btn');
const voiceStopBtn = document.getElementById('voice-stop-btn');
const voiceTestText = document.getElementById('voice-test-text');
const voiceTestStatus = document.getElementById('voice-test-status');
const bgUrlAddBtn = document.getElementById('bg-url-add');
const bgFileAddBtn = document.getElementById('bg-file-add');
const modelSelect = document.getElementById('model-select');

// === STATE ===
let speechRecog = null;
let isListening = false;
let isMenuOpen = false;
let autoChatTimer = null;
let lastAutoChat = 0;
let lastUserMessage = 0;
let thinkingMsg = null;
let currentVoiceEngine = 'elevenlabs';
let appStarted = false;

// === CHAT HELPERS ===
function addMsg(who, text, cls) {
    const d = document.createElement('div');
    d.className = 'msg ' + cls;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    d.innerHTML = '<b>' + who + ':</b> ' + escapeHtml(text) + '<div class="msg-time">' + time + '</div>';
    chatWindow.appendChild(d);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return d;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setStatus(text, type) {
    statusBadge.querySelector('span:last-child').textContent = text;
    statusBadge.className = type ? type : '';
}

// === THINKING ANIMATION ===
function showThinking() {
    thinkingMsg = addMsg('Arohi', '', 'msg-chloe thinking');
    thinkingMsg.innerHTML = '<div class="thinking-animation"><div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div></div><div class="msg-time">' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</div>';
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return thinkingMsg;
}

function hideThinking() {
    if (thinkingMsg) { thinkingMsg.remove(); thinkingMsg = null; }
}

// === FACE + GESTURE SYNC ===
// Reads the *expression* marker the model writes at the start of a reply and
// maps it to the avatar's face + a hand motion.
function applyExpressionAction(text) {
    const m = text.match(/\*([^*]+)\*/);
    const expr = m ? m[1].toLowerCase() : '';
    let emotion = audio.detectEmotion(text);

    if (expr.includes('smile') || expr.includes('giggle') || expr.includes('grin') || expr.includes('bright')) emotion = 'happy';
    else if (expr.includes('laugh') || expr.includes('ha ha')) emotion = 'happy';
    else if (expr.includes('wink') || expr.includes('playful') || expr.includes('adjust')) emotion = 'excited';
    else if (expr.includes('pout') || expr.includes('scold') || expr.includes('frown') || expr.includes('worried') || expr.includes('upset')) emotion = 'sad';
    else if (expr.includes('angry') || expr.includes('gussa') || expr.includes('annoyed') || expr.includes('strict')) emotion = 'angry';
    else if (expr.includes('shy') || expr.includes('blush')) emotion = 'excited';
    else if (expr.includes('suprised') || expr.includes('shocked') || expr.includes('surprise')) emotion = 'surprised';
    else if (expr.includes('calm') || expr.includes('soft')) emotion = 'calm';

    vrmManager.setEmotionExpression(emotion);

    const l = text.toLowerCase();
    if (l.includes('wave') || l.includes('hii') || l.includes('namaste') || l.includes('swagat')) vrmManager.triggerMotion('wave');
    else if (l.includes('blush') || l.includes('shy') || l.includes('kiss')) vrmManager.triggerMotion('blow_kiss');
    else if (l.includes('laugh') || l.includes('haha') || l.includes('giggle')) vrmManager.triggerMotion('laugh');
    else if (l.includes('think') || l.includes('soch') || l.includes('muse')) vrmManager.triggerMotion('think');
    else if (l.includes('sad') || l.includes('worried') || l.includes('dukhi')) vrmManager.triggerMotion('tilt_head');
    else if (l.includes('dance') || l.includes('nach')) vrmManager.triggerMotion('dance');
    else if (l.includes('point')) vrmManager.triggerMotion('point');
    return emotion;
}

// === AUTONOMOUS / PROACTIVE CHAT ===
// Talks on her own if you've been quiet for ~1 minute: stories, shayari, quotes.
// Uses a randomized cooldown so she doesn't talk over and over non-stop.
let lastProactive = 0;
function scheduleAutoChat() {
    if (autoChatTimer) clearTimeout(autoChatTimer);
    const check = function() {
        const idleMs = Date.now() - lastUserMessage;
        const sinceLast = Date.now() - lastProactive;
        if (idleMs >= 60000 && sinceLast >= 45000 + Math.random() * 45000) {
            const msg = persona.randomProactiveMessage();
            addMsg('Arohi', msg, 'msg-chloe');
            lastProactive = Date.now();
            lastUserMessage = Date.now();
            speakWithExpression(msg, false);
        }
        scheduleAutoChat();
    };
    autoChatTimer = setTimeout(check, 30000);
}

function speakWithExpression(text, isReply) {
    const vrm = vrmManager.getVRM();
    if (!vrm) return;
    const emotion = applyExpressionAction(text);
    audio.fetchTTS(text, function(vol) {
        vrmManager.setMouth(vol);
        if (vizFill) vizFill.style.width = (vol * 100) + '%';
    });
}

async function processText(text) {
    if (!text.trim() || !appStarted) return;
    addMsg('You', text, 'msg-you');
    lastUserMessage = Date.now();
    if (isListening && speechRecog) speechRecog.stop();
    showThinking();

    try {
        let r;
        // Use Gemini by default; auto-fallback to local model on any error
        try {
            r = await model.chatWithAI(text);
        } catch (gemErr) {
            console.warn('[Main] Gemini down, using local model:', gemErr.message);
            model.setModel('local');
            r = await model.chatWithAI(text);
        }

        hideThinking();
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        thinkingMsg = addMsg('Arohi', r.cleanText, 'msg-chloe');
        thinkingMsg.innerHTML = '<b>Arohi:</b> ' + escapeHtml(r.cleanText) + '<div class="msg-time">' + time + '</div>';

        r.motionTags.forEach(function(t) { vrmManager.triggerMotion(t); });
        applyExpressionAction(r.cleanText);
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

// === VOICE POPULATION ===
function populateVoiceOptions(engine) {
    if (!voiceSelectContainer) return;
    voiceSelectContainer.innerHTML = '';
    var select = document.createElement('select');
    select.id = 'voice-select';
    select.style.cssText = 'padding:6px 10px;background:rgba(30,41,59,0.6);border:1px solid var(--glass-border);border-radius:8px;color:var(--text);font:inherit;outline:none;cursor:pointer;width:100%;';
    var profiles = audio.getAllVoiceProfiles();
    var found = false;
    Object.entries(profiles).forEach(function(entry) {
        var key = entry[0];
        var v = entry[1];
        if (v.engine === engine) {
            var opt = document.createElement('option');
            opt.value = key;
            opt.textContent = v.name + (v.desc ? ' - ' + v.desc : '');
            select.appendChild(opt);
            if (!found) { select.value = key; found = true; }
        }
    });
    voiceSelectContainer.appendChild(select);
    var profileDefault = engine === 'elevenlabs' ? 'eleven-arohi' : engine === 'edge' ? 'edge-arohi' : engine === 'kokoro' ? 'kokoro-bella' : 'browser-neerja';
    if (audio.getAllVoiceProfiles()[profileDefault]) audio.setVoiceProfile(profileDefault);
    select.addEventListener('change', function(e) {
        audio.setVoiceProfile(e.target.value);
        addMsg('System', 'Voice: ' + e.target.selectedOptions[0].text, 'msg-sys');
    });
}

// === INIT APP (fixed "Enter the World" open) ===
async function initApp() {
    wakeModal.classList.add('fade-out');
    setTimeout(function() { wakeModal.style.display = 'none'; }, 800);
    appStarted = true;

    try {
        vrmManager.init(canvasEl, '/GIRL1.vrm');
        setStatus('Initializing...', '');
    } catch (e) { addMsg('Error', e.message, 'msg-sys'); }

    try { await model.checkModelStatus(statusBadge); } catch (e) {}

    speechRecog = audio.setupSpeechRecognition(
        function(t) { processText(t); },
        function(s) { isListening = (s === 'listening'); micBtn.classList.toggle('active', isListening); }
    );

    const g = persona.greeting();
    addMsg('Arohi', g, 'msg-chloe');
    lastUserMessage = Date.now();
    setStatus('Ready', 'connected');
    avatarStatusText.textContent = 'Arohi Ready';
    speakWithExpression(g, false);
    scheduleAutoChat();
}

// === EVENT LISTENERS ===
function setupEventListeners() {
    startBtn.addEventListener('click', function() {
        // Double safety: even if an error happens, dismiss the modal
        initApp().catch(function(e) {
            console.error('[Main] init error:', e);
            wakeModal.classList.add('fade-out');
            setTimeout(function() { wakeModal.style.display = 'none'; }, 800);
            addMsg('Error', e.message + ' (modal auto-dismissed)', 'msg-sys');
        });
    });
    micBtn.addEventListener('click', function() {
        if (!speechRecog) { addMsg('System', 'Voice needs Chrome/Edge', 'msg-sys'); return; }
        isListening ? speechRecog.stop() : speechRecog.start();
    });
    sendBtn.addEventListener('click', function() {
        var t = inputEl.value.trim();
        if (t) { inputEl.value = ''; processText(t); }
    });
    inputEl.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') { var t = inputEl.value.trim(); if (t) { inputEl.value = ''; processText(t); } }
    });
    if (chatClearBtn) {
        chatClearBtn.addEventListener('click', function() {
            chatWindow.innerHTML = '';
            hideThinking();
            thinkingMsg = null;
            addMsg('Arohi', '*winks* Baatein saaf kar di! Naya din, nayi shuruaat ✨ Kya baat karenge?', 'msg-chloe');
        });
    }
    zoomInBtn.addEventListener('click', function() { return vrmManager.zoomIn(); });
    zoomOutBtn.addEventListener('click', function() { return vrmManager.zoomOut(); });
    danceBtn.addEventListener('click', function() {
        vrmManager.triggerMotion('dance');
        addMsg('Arohi', '*grins* Chalo nachte hain! 💃✨', 'msg-chloe');
    });
    menuBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        isMenuOpen = !isMenuOpen;
        menuDropdown.classList.toggle('open', isMenuOpen);
        menuBtn.style.transform = isMenuOpen ? 'rotate(90deg) scale(1.05)' : '';
    });
    document.addEventListener('click', function(e) {
        if (isMenuOpen && !menuDropdown.contains(e.target) && e.target !== menuBtn) {
            isMenuOpen = false;
            menuDropdown.classList.remove('open');
            menuBtn.style.transform = '';
        }
    });
    bgColorPicker.addEventListener('input', function(e) {
        vrmManager.setBackground(e.target.value);
        addMsg('System', 'Background color: ' + e.target.value, 'msg-sys');
    });
    if (bgUrlAddBtn) {
        bgUrlAddBtn.addEventListener('click', function() {
            var url = bgUrlInput.value.trim();
            if (url) {
                vrmManager.setBackgroundImage(url);
                addMsg('System', 'Background image loaded from URL', 'msg-sys');
                bgUrlInput.value = '';
            }
        });
    }
    bgUrlInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            var url = bgUrlInput.value.trim();
            if (url) {
                vrmManager.setBackgroundImage(url);
                addMsg('System', 'Background image loaded from URL', 'msg-sys');
                bgUrlInput.value = '';
            }
        }
    });
    if (bgFileAddBtn) {
        bgFileAddBtn.addEventListener('click', function() { bgImageUpload.click(); });
    }
    bgImageUpload.addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            var url = URL.createObjectURL(file);
            vrmManager.setBackgroundImage(url);
            addMsg('System', 'Background: ' + file.name, 'msg-sys');
        }
    });

    // Model switch (Gemini default / Local)
    if (modelSelect) {
        modelSelect.value = model.getModel();
        modelSelect.addEventListener('change', function(e) {
            model.setModel(e.target.value);
            addMsg('System', 'AI Model: ' + (e.target.value === 'gemini' ? 'Gemini (online)' : 'Local (Ollama)'), 'msg-sys');
            avatarStatusText.textContent = e.target.value === 'gemini' ? 'Arohi · Gemini' : 'Arohi · Local';
        });
    }

    // Voice engine switcher
    if (voiceEngineSelect) {
        voiceEngineSelect.addEventListener('change', function(e) {
            currentVoiceEngine = e.target.value;
            populateVoiceOptions(currentVoiceEngine);
        });
    }
    populateVoiceOptions(currentVoiceEngine);

    // "Use This Voice" button
    var voiceApplyBtn = document.getElementById('voice-apply-btn');
    if (voiceApplyBtn) {
        voiceApplyBtn.addEventListener('click', function() {
            var select = document.getElementById('voice-select');
            var profile = select ? select.value : 'browser-neerja';
            audio.setVoiceProfile(profile);
            avatarStatusText.textContent = 'Voice: ' + (select ? select.selectedOptions[0].text.split(' (')[0] : profile);
            var statusEl = document.getElementById('voice-test-status');
            if (statusEl) {
                statusEl.textContent = 'Voice applied: ' + (select ? select.selectedOptions[0].text : profile);
                statusEl.style.color = 'var(--green)';
            }
            addMsg('System', 'Voice applied: ' + (select ? select.selectedOptions[0].text : profile), 'msg-sys');
        });
    }

    // Voice test
    if (voiceTestBtn) {
        voiceTestBtn.addEventListener('click', async function() {
            var select = document.getElementById('voice-select');
            var profile = select ? select.value : 'browser-neerja';
            var text = voiceTestText.value.trim() || "Hello! Main Arohi hoon, kya haal hai?";
            voiceTestBtn.disabled = true;
            voiceTestBtn.textContent = '... Playing';
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
    }
    if (voiceStopBtn) {
        voiceStopBtn.addEventListener('click', function() {
            audio.stopSpeaking();
            voiceTestBtn.disabled = false;
            voiceTestBtn.textContent = '▶ Play Sample';
            voiceTestStatus.textContent = 'Stopped';
            voiceTestStatus.style.color = 'var(--orange)';
        });
    }

    // VRM upload
    vrmUpload.addEventListener('change', function(e) {
        var f = e.target.files[0];
        if (f && f.name.endsWith('.vrm')) {
            vrmManager.init(canvasEl, URL.createObjectURL(f));
            addMsg('System', 'Avatar: ' + f.name, 'msg-sys');
        }
        vrmUpload.value = '';
    });
    canvasEl.addEventListener('dragover', function(e) { e.preventDefault(); });
    canvasEl.addEventListener('drop', function(e) {
        e.preventDefault();
        var f = e.dataTransfer.files[0];
        if (f && f.name.endsWith('.vrm')) {
            vrmManager.init(canvasEl, URL.createObjectURL(f));
            addMsg('System', 'Avatar: ' + f.name, 'msg-sys');
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
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
    canvasEl.addEventListener('click', function() {
        if (!isListening) inputEl.focus();
    });
}

// === BOOT ===
setupEventListeners();
