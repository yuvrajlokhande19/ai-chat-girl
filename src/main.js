import * as vrmManager from './vrmManager.js';
import * as model from './modelService.js';
import * as audio from './audioService.js';
import * as persona from './persona.js';
import * as hermes from './hermesService.js';

// === DOM ELEMENTS ===
const canvasEl = document.getElementById('canvas-container');
const statusBadge = document.getElementById('status-badge');
const wakeModal = document.getElementById('wake-modal');
const startBtn = document.getElementById('start-btn');
const micBtn = document.getElementById('mic-btn');
const sendBtn = document.getElementById('send-btn');
const inputEl = document.getElementById('user-input');
const chatWindow = document.getElementById('chat-window');
const chatWidget = document.getElementById('chat-widget');
const chatHeader = document.getElementById('chat-header');
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
let lastUserMessage = 0;
let thinkingMsg = null;
// Idle autopilot: random pose ~every minute when you're quiet, plus an
// occasional persona message she actually speaks (pose held for the line).
let idleTimer = null;
let idleCycle = 0;
let lastAutoMsg = 0;
let speechBusy = false;
// Sarvam AI is the default voice engine (free Indian girl voice, requires no
// local server). Edge/Kokoro/browser remain as offline fallbacks.
let currentVoiceEngine = 'sarvam';
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

    const dur = Math.max(2000, text.length * 95);
    const l = text.toLowerCase();
    let pose = null;
    if (l.includes('wave') || l.includes('hii') || l.includes('hello')) pose = 'wave_hi';
    else if (l.includes('namaste') || l.includes('swagat') || l.includes('good to meet') || l.includes('thank')) pose = 'greeting';
    else if (l.includes('blush') || l.includes('shy') || l.includes('kiss')) pose = 'blush';
    else if (l.includes('laugh') || l.includes('haha') || l.includes('giggle') || l.includes('clap') || l.includes('cheer')) pose = 'clap';
    else if (l.includes('think') || l.includes('soch') || l.includes('muse') || l.includes('hmm')) pose = 'think';
    else if (l.includes('sad') || l.includes('worried') || l.includes('dukhi')) pose = 'sad';
    else if (l.includes('dance') || l.includes('nach') || l.includes('party')) pose = 'dance';
    else if (l.includes('peace')) pose = 'peace';
    else if (l.includes('surprise') || l.includes('shocked') || l.includes('arre')) pose = 'surprised';
    if (pose) vrmManager.triggerMotion(pose, dur);
    return { emotion, pose };
}

// === IDLE AUTOPILOT: RANDOM GESTURES + PERSONA MESSAGES ===
// When you've gone quiet, Arohi keeps the world alive: she plays a random
// real-mocap pose roughly every minute, and every few cycles she also drops a
// persona line and SPEAKS it (the pose is held for the whole line). She never
// interrupts herself mid-speech.
const IDLE_POSES = [
    'greeting', 'wave_hi', 'peace', 'clap', 'blush', 'think', 'look_around',
    'jump', 'walk', 'dance', 'spin', 'squat', 'shoot', 'surprised', 'relax',
    'sleepy', 'idle_listen', 'observe',
];

function scheduleIdleGestures() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(runIdleCycle, 60000);
}

function runIdleCycle() {
    idleCycle++;
    const quietMs = Date.now() - lastUserMessage;
    const sinceAuto = Date.now() - lastAutoMsg;
    scheduleIdleGestures();

    // Don't act until the app is live and she isn't mid-sentence.
    if (!appStarted || speechBusy || vrmManager.isSpeaking()) return;
    // Only start once the user has been quiet for ~45s (so we never talk over
    // them or right after they sent a message).
    if (quietMs < 45000) return;

    if (idleCycle % 3 === 0 && sinceAuto >= 150000) {
        // Persona auto-message — she says it out loud with the pose held.
        lastAutoMsg = Date.now();
        lastUserMessage = Date.now();
        const msg = persona.randomProactiveMessage();
        addMsg('Arohi', msg, 'msg-chloe');
        speakWithExpression(msg, false);
    } else {
        // Random silent pose for a few seconds, then back to idle.
        const pose = IDLE_POSES[Math.floor(Math.random() * IDLE_POSES.length)];
        vrmManager.triggerMotion(pose, 4200);
    }
}

let elevenNoticeShown = false;
function speakWithExpression(text, isReply) {
    const vrm = vrmManager.getVRM();
    if (!vrm) return;
    // Apply face + pick a matching real-mocap pose for the spoken line.
    const r = applyExpressionAction(text);
    const emotion = r.emotion;
    const pose = r.pose || vrmManager.poseForEmotion(emotion);
    vrmManager.setEmotionExpression(emotion, 0.8);

    // Body only moves the moment the VOICE starts, and the pose is HELD until
    // the last syllable — fixes the delay and the early "dropped to idle".
    let started = false;
    speechBusy = true;
    audio.fetchTTS(text, function(vol) {
        vrmManager.setMouth(vol);
        if (vizFill) vizFill.style.width = (vol * 100) + '%';
        if (!started) {
            started = true;
            vrmManager.setTalking(true);
            vrmManager.holdPose(pose);
        }
    }).then(function() {
        if (started) vrmManager.clearHeldPose();
        vrmManager.setTalking(false);
        speechBusy = false;
        if (!elevenNoticeShown) {
            const reason = audio.getElevenBlockedReason && audio.getElevenBlockedReason();
            if (reason) {
                elevenNoticeShown = true;
                addMsg('Voice', reason, 'msg-sys');
            }
        }
    }).catch(function() {
        if (started) vrmManager.clearHeldPose();
        vrmManager.setTalking(false);
        speechBusy = false;
    });
}

// Speaks a plain line (no AI motion tags) with the matching pose held for the
// whole sentence — used for Hermes progress narration + task summaries.
function speakReplyLine(text) {
    return new Promise(function(resolve) {
        const exRes = applyExpressionAction(text);
        const emotion = exRes.emotion;
        vrmManager.setEmotionExpression(emotion, 0.8);
        const pose = exRes.pose || vrmManager.poseForEmotion(emotion);
        let started = false;
        speechBusy = true;
        audio.fetchTTS(text, function(vol) {
            vrmManager.setMouth(vol);
            if (vizFill) vizFill.style.width = (vol * 100) + '%';
            if (!started) {
                started = true;
                vrmManager.setTalking(true);
                vrmManager.holdPose(pose);
            }
        }).then(function() {
            if (started) vrmManager.clearHeldPose();
            vrmManager.setTalking(false);
            speechBusy = false;
            resolve();
        }).catch(function() {
            if (started) vrmManager.clearHeldPose();
            vrmManager.setTalking(false);
            speechBusy = false;
            resolve();
        });
    });
}

async function processText(text) {
    if (!text.trim() || !appStarted) return;

    // ---- Hermes task routing -------------------------------------------------
    const taskText = hermes.isTask(text);
    if (taskText) {
        addMsg('You', text, 'msg-you');
        lastUserMessage = Date.now();
        if (isListening && speechRecog) speechRecog.stop();
        hideThinking();
        const bridge = await hermes.health(true);
        if (!bridge.ok) {
            const msg = 'Yaar, Hermes abhi laptop pe connected nahi hai. Terminal mein `npm run bridge` chala kar dekho, phir main task karke dungi!';
            addMsg('System', 'Hermes bridge offline (start it with: npm run bridge)', 'msg-sys');
            addMsg('Arohi', msg, 'msg-chloe');
            changeHermesStatus(false);
            await speakReplyLine(msg);
            vrmManager.resetMouth();
            if (vizFill) vizFill.style.width = '0%';
            return;
        }
        changeHermesStatus(true);
        const msg = 'Theek hai, main yeh task Hermes ko de rahi hoon and laptop pe karke degi. Thoda wait karo na!';
        addMsg('Arohi', msg, 'msg-chloe');
        speakReplyLine(msg); // narrate while Hermes works (not awaited)
        const res = await hermes.runTask(taskText);
        hideThinking();
        if (!res.ok) {
            const errMsg = 'Arre yaar, Hermes task mein atak gaya — ' + String(res.error || 'error').slice(0, 200);
            addMsg('Hermes', String(res.error || 'no output'), 'msg-sys');
            addMsg('Arohi', errMsg, 'msg-chloe');
            await speakReplyLine(errMsg);
        } else {
            const detail = res.output.split('\n').filter(function(l) { return l.trim(); }).slice(0, 4).join('\n');
            addMsg('Hermes', detail.slice(0, 900) || 'done', 'msg-sys');
            const summary = await hermes.summarize(taskText, res.output);
            const finalLine = summary || 'Kaam ho gaya yaar! Hermes ne task complete kar diya.';
            addMsg('Arohi', finalLine, 'msg-chloe');
            await speakReplyLine(finalLine);
        }
        vrmManager.resetMouth();
        if (vizFill) vizFill.style.width = '0%';
        return;
    }

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
            if (modelSelect) modelSelect.value = 'local';
            addMsg('System', 'Online AI unavailable, switched to Local model.', 'msg-sys');
            r = await model.chatWithAI(text);
        }

        hideThinking();
        const replyText = r.cleanText || r.expression || '';
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        thinkingMsg = addMsg('Arohi', replyText, 'msg-chloe');
        thinkingMsg.innerHTML = '<b>Arohi:</b> ' + escapeHtml(replyText) + '<div class="msg-time">' + time + '</div>';

        // Detect the emotion from the reply, set her face, and pick a pose so
        // body + expression line up WITH the words as she speaks them.
        const exRes = applyExpressionAction(r.expression || replyText);
        const emotion = exRes.emotion;
        vrmManager.setEmotionExpression(emotion, 0.8);

        // Choose the pose that will HOLD for the whole spoken line: explicit
        // motion tag > expression match > emotion pose.
        const poseList = vrmManager.getPoseList();
        let pose = exRes.pose || vrmManager.poseForEmotion(emotion);
        const tag = (r.motionTags || []).find(function(t) { return t && t !== 'idle' && poseList[t]; });
        if (tag) pose = tag;

        // She only MOVES when the audio actually starts, and the pose is HELD
        // until the voice ends — no delay, no early drop back to idle.
        let started = false;
        speechBusy = true;
        try {
            // AI "body brain" refines the pose best-effort; if it lands before
            // audio playback it simply upgrades the held pose.
            model.chooseAIPose(replyText, vrmManager.matchPose(replyText)).then(function(ap) {
                if (ap && ap.pose && poseList[ap.pose]) pose = ap.pose;
                if (ap && ap.emotion) vrmManager.setEmotionExpression(ap.emotion, 0.8);
            }).catch(function() {});
            await audio.fetchTTS(r.cleanText, function(vol) {
                vrmManager.setMouth(vol);
                if (vizFill) vizFill.style.width = (vol * 100) + '%';
                if (!started) {
                    started = true;
                    vrmManager.setTalking(true);
                    vrmManager.holdPose(pose);
                }
            });
            if (started) vrmManager.clearHeldPose();
            vrmManager.setTalking(false);
        } catch (err) {
            vrmManager.setTalking(false);
            hideThinking();
            addMsg('Error', err.message || 'Unknown error', 'msg-sys');
        }
        speechBusy = false;
    } catch (err) {
        vrmManager.setTalking(false);
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
    var profileDefault = engine === 'elevenlabs' ? 'eleven-arohi' : engine === 'sarvam' ? 'sarvam-priya' : engine === 'edge' ? 'edge-arohi' : engine === 'kokoro' ? 'kokoro-bella' : 'browser-neerja';
    if (audio.getAllVoiceProfiles()[profileDefault]) audio.setVoiceProfile(profileDefault);
    select.addEventListener('change', function(e) {
        audio.setVoiceProfile(e.target.value);
        addMsg('System', 'Voice: ' + e.target.selectedOptions[0].text, 'msg-sys');
    });
}

// Builds the "Poses & Moves" buttons in the three-dot menu from the pose
// registry exported by vrmManager. Clicking a button triggers that pose.
function buildPoseButtons() {
    var container = document.getElementById('pose-buttons');
    if (!container || !vrmManager.getPoseList) return;
    var poses = vrmManager.getPoseList();
    // Group options by category so the three-dot menu is neatly arranged.
    var order = ['Happy', 'Greetings', 'Thinking', 'Reactions', 'Moves'];
    var groups = {};
    Object.entries(poses).forEach(function(e) {
        var key = e[0], p = e[1];
        var cat = (p.cat && order.indexOf(p.cat) !== -1) ? p.cat : 'Other';
        (groups[cat] = groups[cat] || []).push({ key: key, p: p });
    });
    order.forEach(function(cat) {
        if (!groups[cat]) return;
        var h = document.createElement('div');
        h.textContent = cat;
        h.style.cssText += 'width:100%;margin:10px 2px 4px;font-size:10px;font-weight:800;letter-spacing:1px;color:var(--accent);opacity:0.85;';
        container.appendChild(h);
        groups[cat].forEach(function(item) {
            var key = item.key, p = item.p;
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'menu-btn-small';
            btn.style.cssText += 'padding:6px 10px;background:rgba(30,41,59,0.4);color:var(--text);border:1px solid var(--glass-border);border-radius:8px;font-weight:600;font-size:11px;cursor:pointer;';
            btn.textContent = p.label;
            btn.title = p.desc;
            btn.addEventListener('click', function() {
                vrmManager.triggerMotion(key);
                if (p.emotion) vrmManager.setEmotionExpression(p.emotion, 0.8);
                addMsg('Arohi', 'Pose: ' + p.label, 'msg-sys');
            });
            container.appendChild(btn);
        });
    });
}

// === INIT APP (fixed "Enter the World" open) ===
// Reflects Hermes bridge availability on the menu status pill.
function changeHermesStatus(online) {
    const pill = document.getElementById('hermes-status');
    if (!pill) return;
    pill.textContent = online ? 'Hermes: Connected' : 'Hermes: Offline';
    pill.style.background = online ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.15)';
    pill.style.color = online ? '#4ade80' : '#f87171';
}

async function initApp() {
    wakeModal.classList.add('fade-out');
    setTimeout(function() { wakeModal.style.display = 'none'; }, 800);
    appStarted = true;

    try {
        vrmManager.init(canvasEl, 'GIRL1.vrm');
        setStatus('Initializing...', '');
    } catch (e) { addMsg('Error', e.message, 'msg-sys'); }

    try { await model.checkModelStatus(statusBadge); } catch (e) {}

    // Warm the local gemma4 model (fire-and-forget) so her first reply is fast.
    model.warmLocalModel();
    // With `npm run dev` the Hermes bridge starts together with the page, so a
    // single Enter boot turns on the girl AND the laptop copilot together.
    try {
        const h = await hermes.health(true);
        if (h && h.ok) {
            changeHermesStatus(true);
            addMsg('Hermes', 'Connected — Arohi can now manage your laptop. Just ask her!', 'msg-sys');
        } else {
            changeHermesStatus(false);
            addMsg('Hermes', 'Bridge not running. On this laptop start it with: npm run bridge', 'msg-sys');
        }
    } catch (e) {}

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
    scheduleIdleGestures();
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
    // Double-tap Enter = turn on Hermes (laptop copilot) ALONG WITH the girl.
    startBtn.addEventListener('dblclick', function(e) {
        e.preventDefault();
        e.stopPropagation();
        hermes.health(true).then(function(h) {
            if (h && h.ok) {
                changeHermesStatus(true);
                const okMsg = 'Hermes online hai! Main tumhare laptop ka kaam manage kar sakti hoon. Batao kya karna hai?';
                addMsg('Arohi', okMsg, 'msg-chloe');
                if (appStarted) speakReplyLine(okMsg);
            } else {
                changeHermesStatus(false);
                const noMsg = 'Hermes abhi off hai. Terminal mein `npm run bridge` chalao, phir double-tap karo!';
                addMsg('System', noMsg, 'msg-sys');
                if (appStarted) speakReplyLine(noMsg);
            }
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
        chatClearBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            chatWindow.innerHTML = '';
            hideThinking();
            thinkingMsg = null;
            addMsg('Arohi', '*winks* Baatein saaf kar di! Naya din, nayi shuruaat ✨ Kya baat karenge?', 'msg-chloe');
        });
    }
    // Mobile: tapping the chat header collapses/expands it so the avatar stays visible.
    if (chatHeader && chatWidget) {
        chatHeader.addEventListener('click', function(e) {
            if (e.target.closest('#chat-clear-btn')) return;
            if (window.matchMedia('(max-width: 768px)').matches) {
                const collapsed = chatWidget.classList.toggle('chat-collapsed');
                chatWidget.classList.toggle('chat-expanded', !collapsed);
            }
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
    if (voiceEngineSelect) voiceEngineSelect.value = currentVoiceEngine;
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

    // VRM built-in model picker (default vs upload)
    var vrmModelSelect = document.getElementById('vrm-model-select');
    if (vrmModelSelect) {
        vrmModelSelect.addEventListener('change', function(e) {
            if (e.target.value === 'default') {
                vrmManager.init(canvasEl, 'GIRL1.vrm');
                addMsg('System', 'Avatar: Arohi (Default)', 'msg-sys');
            } else if (e.target.value === 'upload') {
                vrmUpload.click();
                e.target.value = 'default';
            }
        });
    }

    // Pose & move buttons in the three-dot menu (built from the pose registry).
    var poseContainer = document.getElementById('pose-buttons');
    if (poseContainer) {
        buildPoseButtons();
    }
    // Hermes quick-task buttons + status in the options menu.
    var hermesStatusPill = document.getElementById('hermes-status');
    if (hermesStatusPill) {
        hermesStatusPill.addEventListener('click', function() {
            hermes.health(true).then(function(h) {
                changeHermesStatus(h && h.ok);
                addMsg('System', h && h.ok ? 'Hermes bridge: connected' : 'Hermes bridge: offline (npm run bridge)', 'msg-sys');
            });
        });
    }
    document.querySelectorAll('[data-task]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            processText(btn.getAttribute('data-task'));
        });
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
// Mobile: collapse the chat to a pill on first load so the avatar is visible.
// The first tap on the header expands it into the bottom sheet.
(function applyMobileInitialState() {
    function onWidth() {
        if (!chatWidget || !chatHeader) return;
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        const alreadyTouched = sessionStorage.getItem('chat-touched');
        if (isMobile && !alreadyTouched) {
            chatWidget.classList.add('chat-collapsed');
            chatWidget.classList.remove('chat-expanded');
        } else {
            chatWidget.classList.remove('chat-collapsed');
            chatWidget.classList.add('chat-expanded');
        }
    }
    onWidth();
    window.addEventListener('resize', onWidth);
    if (chatHeader && chatWidget) {
        chatHeader.addEventListener('click', function() {
            sessionStorage.setItem('chat-touched', '1');
        });
    }
})();

setupEventListeners();
