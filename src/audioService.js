// audioService.js — Voice for Arohi.
// Primary: ElevenLabs (natural, expressive). Fallback: Edge TTS (Aarohi) ->
// Kokoro -> browser speechSynthesis. Auto-falls back when the ElevenLabs
// token runs out.

import CONFIG from './config.js';

const ELEVEN_URL = 'https://api.elevenlabs.io/v1/text-to-speech/' + CONFIG.ELEVENLABS_VOICE_ID;
const ELEVEN_MODEL = 'eleven_multilingual_v2';
let elevenAvailable = true;

const EDGE_TTS_URL = 'http://127.0.0.1:8881/v1/audio/speech';
const KOKORO_URL = 'http://127.0.0.1:8880/v1/audio/speech';
let currentVoiceProfile = 'eleven-arohi';
let edgeTTSAvailable = true;
let kokoroAvailable = true;

const ELEVEN_PROFILES = {
    'eleven-arohi': { name: 'Arohi (ElevenLabs, Premium)', voice: CONFIG.ELEVENLABS_VOICE_ID, speed: 1.0, lang: 'hi-IN', engine: 'eleven', desc: 'Arohi\'s own premium voice' },
};

const EDGE_TTS_PROFILES = {
    'edge-neerja':          { name: 'Neerja (Hinglish, Expressive)', voice: 'neerja', speed: 1.0, lang: 'en-IN', engine: 'edge', desc: 'Best for Hinglish teen girl' },
    'edge-neerja-classic':  { name: 'Neerja Clear (Indian English)', voice: 'neerja-classic', speed: 1.0, lang: 'en-IN', engine: 'edge', desc: 'Clear, calm Indian girl' },
    'edge-neerja-teen':     { name: 'Neerja Teen (Cute, Delighted)', voice: 'neerja-teen', speed: 1.0, lang: 'en-IN', engine: 'edge', desc: 'Younger cuter excited teen' },
    'edge-arohi':           { name: 'Aarohi (Marathi, Natural Girl)', voice: 'arohi', speed: 1.0, lang: 'mr-IN', engine: 'edge', desc: 'Warm natural Marathi girl' },
    'edge-arohi-teen':      { name: 'Aarohi Teen (Calm, Sweet)', voice: 'aarohi-teen', speed: 1.0, lang: 'mr-IN', engine: 'edge', desc: 'Softer sweeter teen girl' },
    'edge-pallavi':         { name: 'Pallavi (Tamil, Teen Girl)', voice: 'pallavi', speed: 1.0, lang: 'ta-IN', engine: 'edge', desc: 'Tamil teenage girl' },
    'edge-sapna':           { name: 'Sapna (Kannada, Teen Girl)', voice: 'sapna', speed: 1.0, lang: 'kn-IN', engine: 'edge', desc: 'Kannada teenage girl' },
    'edge-sobhana':         { name: 'Sobhana (Malayalam, Teen Girl)', voice: 'sobhana', speed: 1.0, lang: 'ml-IN', engine: 'edge', desc: 'Malayalam teenage girl' },
};

const KOKORO_PROFILES = {
    'kokoro-bella':  { name: 'Bella (Kokoro, Teen)',  voice: 'af_bella', speed: 1.15, lang: 'en-US', engine: 'kokoro', desc: 'English teen voice' },
    'kokoro-heart':  { name: 'Heart (Kokoro, Warm)',   voice: 'af_heart', speed: 1.1,  lang: 'en-US', engine: 'kokoro', desc: 'English warm voice' },
    'kokoro-sky':    { name: 'Sky (Kokoro, High)',     voice: 'af_sky',   speed: 1.2,  lang: 'en-US', engine: 'kokoro', desc: 'English high-pitch voice' },
};

const BROWSER_VOICES = {
    'browser-swara':   { name: 'Swara (Hindi, Browser)',     lang: 'hi-IN', rate: 1.0,  pitch: 1.35, engine: 'browser', desc: 'Browser fallback - Hindi' },
    'browser-neerja':  { name: 'Neerja (Indian English)',    lang: 'en-IN', rate: 1.15, pitch: 1.4, engine: 'browser', desc: 'Browser fallback - Indian English' },
    'browser-jenny':   { name: 'Jenny (US English)',         lang: 'en-US', rate: 1.15, pitch: 1.4, engine: 'browser', desc: 'Browser fallback - US English' },
};

const ALL_PROFILES = { ...ELEVEN_PROFILES, ...EDGE_TTS_PROFILES, ...KOKORO_PROFILES, ...BROWSER_VOICES };
const SAMPLE_TEXT = "Hello! Main Arohi hoon, aur aaj bahut mast din hai. Kya kar rahe ho?";

function filterTextForSpeech(text) {
    let f = String(text || '');
    // strip *expression* markers the persona writes (not meant for speech)
    f = f.replace(/\*[^*]*\*/g, '');
    // strip [motion: ...] tags
    f = f.replace(/\[motion:\s*\w+\]/gi, '');
    // strip shortcodes and emojis
    f = f.replace(/:[a-zA-Z0-9_+-]+:/g, '');
    f = f.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}]/gu, '');
    return f.replace(/\s+/g, ' ').trim();
}

// Detect the emotional tone of text so Chloe sounds right AND expressions match
function detectEmotion(text) {
    const t = text.toLowerCase();
    const count = (words) => words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);

    const excited = count(['wow', 'omg', 'yay', 'so excited', 'amazing', 'awesome', 'mast', 'badhiya', 'jhakaas', 'kya baat', '😍', '😃', '🤩']);
    const happy = count(['happy', 'great', 'nice', 'cool', 'love', 'fun', 'khush', 'accha', 'achha', 'theek', '😊', '😄', '🙂']);
    const sad = count(['sad', 'sorry', 'unhappy', 'cry', 'dukh', 'udaas', '😢', '😭', '🥺', 'hurt', 'alone', 'miss']);
    const angry = count(['angry', 'mad', 'gussa', 'annoyed', 'frustrated', 'irritated', 'stupid', 'hate', '😠', '😡', 'nonsense', 'bakwas']);
    const surprised = count(['shocked', 'wow', 'really', 'arre', 'sach', 'seriously', 'unbelievable', '😲', '😮', 'surprise']);
    const funny = count(['haha', 'lol', 'joke', 'funny', 'mazaak', 'hasna', '😂', '🤣', 'lmao', 'rofl']);

    const scores = [
        { e: 'excited', s: excited * 2 },
        { e: 'sad', s: sad * 2 },
        { e: 'angry', s: angry * 2 },
        { e: 'surprised', s: surprised * 1.5 },
        { e: 'funny', s: funny },
        { e: 'happy', s: happy },
    ];
    scores.sort((a, b) => b.s - a.s);
    return scores[0].s > 0 ? scores[0].e : 'neutral';
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

    const profileKey = profileOverride || currentVoiceProfile;
    const isEleven = profileKey.startsWith('eleven-');
    const isEdge = profileKey.startsWith('edge-');
    const isKokoro = profileKey.startsWith('kokoro-');
    const emotion = detectEmotion(text);

    // PRIMARY: ElevenLabs premium voice (Arohi's own voice).
    // If the token runs out / quota hits, we fall back to Edge "Aarohi" below.
    if (elevenAvailable && CONFIG.ELEVENLABS_API_KEY && CONFIG.ELEVENLABS_API_KEY.indexOf('YOUR_') !== 0) {
        try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 20000);
            const res = await fetch(ELEVEN_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'xi-api-key': CONFIG.ELEVENLABS_API_KEY,
                },
                body: JSON.stringify({
                    text: clean,
                    model_id: ELEVEN_MODEL,
                    voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.5, use_speaker_boost: true },
                }),
                signal: ctrl.signal,
            });
            clearTimeout(tid);
            if (res.ok) {
                const blob = await res.blob();
                return playBlob(blob, volCallback);
            }
            // 401 invalid key, 402 quota exceeded, 429 rate limited -> give up on Eleven
            if (res.status === 401 || res.status === 402 || res.status === 429) {
                console.warn('[Audio] ElevenLabs token exhausted (' + res.status + '). Falling back to Aarohi.');
                elevenAvailable = false;
            } else {
                throw new Error('HTTP ' + res.status);
            }
        } catch (e) {
            console.warn('[Audio] ElevenLabs failed:', e.message);
            elevenAvailable = false;
        }
    }

    // Try Edge TTS (natural Indian voices)
    if (isEdge && edgeTTSAvailable) {
        const profile = EDGE_TTS_PROFILES[profileKey] || EDGE_TTS_PROFILES['edge-arohi'];
        try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 15000);
            const res = await fetch(EDGE_TTS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: clean, voice: profile.voice, speed: profile.speed, emotion }),
                signal: ctrl.signal,
            });
            clearTimeout(tid);
            if (res.ok) {
                const blob = await res.blob();
                return playBlob(blob, volCallback);
            }
            throw new Error('HTTP ' + res.status);
        } catch (e) {
            console.warn('[Audio] Edge TTS failed:', e.message);
            edgeTTSAvailable = false;
        }
    }

    // Try Kokoro
    if (isKokoro && kokoroAvailable) {
        const profile = KOKORO_PROFILES[profileKey] || KOKORO_PROFILES['kokoro-bella'];
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
            console.warn('[Audio] Kokoro failed:', e.message);
            kokoroAvailable = false;
        }
    }

    // Auto Edge fallback for non-edge profiles -> uses Aarohi (natural girl)
    if (edgeTTSAvailable && !isEdge) {
        try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 15000);
            const res = await fetch(EDGE_TTS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: clean, voice: 'neerja', speed: 1.0, emotion }),
                signal: ctrl.signal,
            });
            clearTimeout(tid);
            if (res.ok) {
                const blob = await res.blob();
                return playBlob(blob, volCallback);
            }
        } catch (e) {
            edgeTTSAvailable = false;
        }
    }

    return browserTTS(clean, volCallback, emotion);
}

function browserTTS(text, volCallback, emotion) {
    return new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        const prof = BROWSER_VOICES[currentVoiceProfile] || BROWSER_VOICES['browser-neerja'];
        const lang = prof.lang;
        let rate = prof.rate;
        let pitch = prof.pitch;

        // Apply emotion via pitch/rate for browser voices too
        if (emotion === 'excited' || emotion === 'surprised') { pitch += 0.3; rate += 0.1; }
        else if (emotion === 'sad') { pitch -= 0.3; rate -= 0.1; }
        else if (emotion === 'angry') { rate += 0.1; }
        else if (emotion === 'funny') { pitch += 0.15; }

        const voice = getBrowserVoice(lang);
        if (voice) u.voice = voice;
        u.lang = lang;
        u.rate = Math.max(0.5, Math.min(2, rate));
        u.pitch = Math.max(0, Math.min(2, pitch));
        u.volume = 1.0;

        if (/[\u0900-\u097F]/.test(text)) { u.lang = 'hi-IN'; u.rate = Math.min(u.rate, 1.1); }

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
    if (ELEVEN_PROFILES[profile]) return fetchTTS(text, () => {}, profile);
    if (EDGE_TTS_PROFILES[profile]) return fetchTTS(text, () => {}, profile);
    if (KOKORO_PROFILES[profile]) return fetchTTS(text, () => {}, profile);
    if (BROWSER_VOICES[profile]) return fetchTTS(text, () => {}, profile);
    return fetchTTS(text, () => {});
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
    detectEmotion,
};
