// audioService.js — Kokoro (Local) + Browser SpeechSynthesis
// Minimal, no duplicates, no Edge TTS

const KOKORO_URL = 'http://127.0.0.1:8880/v1/audio/speech';
let currentVoiceProfile = 'browser-neerja';
let kokoroAvailable = true;

const KOKORO_PROFILES = {
    'kokoro-bella':  { name: 'Bella (Kokoro, Teen)',      voice: 'af_bella',  speed: 1.15, lang: 'en-US',  engine: 'kokoro' },
    'kokoro-heart':  { name: 'Heart (Kokoro, Warm)',       voice: 'af_heart',  speed: 1.1,  lang: 'en-US',  engine: 'kokoro' },
    'kokoro-sky':    { name: 'Sky (Kokoro, Cute/High)',    voice: 'af_sky',    speed: 1.2,  lang: 'en-US',  engine: 'kokoro' },
    'kokoro-nova':   { name: 'Nova (Kokoro, Bright)',      voice: 'af_nova',   speed: 1.1,  lang: 'en-US',  engine: 'kokoro' },
};

const BROWSER_VOICES = {
    'browser-neerja':  { name: 'Neerja (Indian English)',    lang: 'en-IN', rate: 1.15, pitch: 1.4,  desc: 'Natural Indian English',      engine: 'browser' },
    'browser-swara':   { name: 'Swara (Hindi)',              lang: 'hi-IN', rate: 1.0,  pitch: 1.35, desc: 'Pure Hindi female',           engine: 'browser' },
    'browser-jenny':   { name: 'Jenny (US English, Friendly)', lang: 'en-US', rate: 1.15, pitch: 1.4,  desc: 'Friendly US teen',           engine: 'browser' },
    'browser-aria':    { name: 'Aria (US English, Warm)',     lang: 'en-US', rate: 1.1,  pitch: 1.35, desc: 'Warm US English',             engine: 'browser' },
    'browser-libby':   { name: 'Libby (UK English)',          lang: 'en-GB', rate: 1.1,  pitch: 1.35, desc: 'Cheerful UK English',         engine: 'browser' },
};

const ALL_PROFILES = { ...KOKORO_PROFILES, ...BROWSER_VOICES };
const SAMPLE_TEXT = "Hello, am Sia! Main aapke liye kya karu?";

function filterTextForSpeech(text) {
    let f = text.replace(/:[a-zA-Z0-9_+-]+:/g, '');
    f = f.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}]/gu, '');
    return f.replace(/\s+/g, ' ').trim();
}

function getBrowserVoice(lang) {
    const voices = window.speechSynthesis.getVoices();
    const find = (fn) => voices.find(fn);
    return find(v => v.lang === lang && v.name.toLowerCase().includes('female'))
        || find(v => v.lang === lang && v.name.toLowerCase().includes('google'))
        || find(v => v.lang === lang && v.name.toLowerCase().includes('microsoft'))
        || find(v => v.lang === lang)
        || find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female'))
        || find(v => v.lang.startsWith('en'))
        || voices[0];
}

function playBlob(blob, volCallback) {
    return new Promise(async (resolve) => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (ctx.state === 'suspended') await ctx.resume();
            const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            src.connect(analyser);
            analyser.connect(ctx.destination);
            const data = new Uint8Array(analyser.frequencyBinCount);
            let raf;
            src.onended = () => { cancelAnimationFrame(raf); if (volCallback) volCallback(0); resolve(); };
            src.start(0);
            (function tick() {
                analyser.getByteFrequencyData(data);
                let sum = 0;
                for (let i = 0; i < data.length; i++) sum += data[i];
                if (volCallback) volCallback(sum / data.length / 255);
                raf = requestAnimationFrame(tick);
            })();
        } catch (e) {
            console.warn('[Audio] playBlob error:', e);
            if (volCallback) volCallback(0);
            resolve();
        }
    });
}

async function fetchTTS(text, volCallback, profileOverride) {
    const clean = filterTextForSpeech(text);
    if (!clean) { if (volCallback) volCallback(0); return; }

    if (!kokoroAvailable) return browserTTS(clean, volCallback);

    const profile = (profileOverride && KOKORO_PROFILES[profileOverride])
        ? KOKORO_PROFILES[profileOverride]
        : KOKORO_PROFILES['kokoro-bella'];

    try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 10000);
        const res = await fetch(KOKORO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: clean, model: 'kokoro-82m', voice: profile.voice, speed: profile.speed }),
            signal: ctrl.signal,
        });
        clearTimeout(tid);
        if (res.ok) {
            const blob = await res.blob();
            return playBlob(blob, volCallback);
        }
        throw new Error('HTTP ' + res.status);
    } catch (e) {
        console.warn('[Audio] Kokoro unavailable, using browser fallback:', e.message);
        kokoroAvailable = false;
        return browserTTS(clean, volCallback);
    }
}

function browserTTS(text, volCallback) {
    return new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        const prof = BROWSER_VOICES[currentVoiceProfile];
        const lang = prof ? prof.lang : 'en-IN';
        const rate = prof ? prof.rate : 1.15;
        const pitch = prof ? prof.pitch : 1.4;

        const voice = getBrowserVoice(lang);
        if (voice) u.voice = voice;
        u.lang = lang;
        u.rate = rate;
        u.pitch = pitch;
        u.volume = 1.0;

        if (/[\u0900-\u097F]/.test(text)) { u.lang = 'hi-IN'; u.rate = 1.0; u.pitch = 1.35; }

        const iv = setInterval(() => { if (volCallback) volCallback(0.1 + Math.random() * 0.4); }, 60);
        u.onend = () => { clearInterval(iv); if (volCallback) volCallback(0); resolve(); };
        u.onerror = () => { clearInterval(iv); if (volCallback) volCallback(0); resolve(); };
        window.speechSynthesis.speak(u);
    });
}

function stopSpeaking() {
    window.speechSynthesis?.cancel();
}

function setVoiceProfile(profile) {
    currentVoiceProfile = profile;
    console.log('[Audio] Voice set to:', profile);
    return true;
}

function getVoiceProfile() {
    return ALL_PROFILES[currentVoiceProfile] || { name: currentVoiceProfile, engine: 'browser' };
}

function getAllVoiceProfiles() {
    return { ...ALL_PROFILES };
}

async function testVoice(profile, customText) {
    const text = customText || SAMPLE_TEXT;
    if (KOKORO_PROFILES[profile]) return fetchTTS(text, () => {}, profile);
    if (BROWSER_VOICES[profile]) return browserTTS(text, () => {}, profile);
    return browserTTS(text, () => {});
}

function setupSpeechRecognition(onResult, onStatus) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { console.warn('[Audio] Speech Recognition not supported'); return null; }
    const r = new SR();
    r.continuous = true;
    r.interimResults = false;
    r.lang = 'hi-IN';
    r.onresult = (e) => {
        const last = e.results[e.results.length - 1];
        if (last.isFinal) onResult(last[0].transcript);
    };
    r.onstart = () => onStatus('listening');
    r.onend = () => onStatus('idle');
    r.onerror = (e) => { console.warn('[Audio] SpeechRecog error:', e.error); onStatus('idle'); };
    return r;
}

export {
    fetchTTS,
    stopSpeaking,
    setVoiceProfile,
    getVoiceProfile,
    getAllVoiceProfiles,
    testVoice,
    setupSpeechRecognition,
};
