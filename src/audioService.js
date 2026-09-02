const KOKORO_URL = 'http://127.0.0.1:8880/v1/audio/speech';

let currentVoiceProfile = 'kokoro-bella';
let kokoroAvailable = true;

// === KOKORO VOICE PROFILES (Local Server) ===
const KOKORO_PROFILES = {
    'kokoro-bella': { name: 'Bella (Kokoro, Teen)', voice: 'af_bella', speed: 1.15, lang: 'en-US' },
    'kokoro-heart': { name: 'Heart (Kokoro, Warm)', voice: 'af_heart', speed: 1.1, lang: 'en-US' },
    'kokoro-sky': { name: 'Sky (Kokoro, Cute/High)', voice: 'af_sky', speed: 1.2, lang: 'en-US' },
    'kokoro-nova': { name: 'Nova (Kokoro, Bright)', voice: 'af_nova', speed: 1.1, lang: 'en-US' },
};

// BROWSER SPEECH SYNTHESIS VOICES - All Indian/International Female Voices
const BROWSER_VOICES = {
    'browser-neerja': { name: 'Neerja (Indian English, Browser)', lang: 'en-IN', rate: 1.15, pitch: 1.4, gender: 'Female', desc: 'Natural Indian English' },
    'browser-swara': { name: 'Swara (Hindi, Browser)', lang: 'hi-IN', rate: 1.0, pitch: 1.35, gender: 'Female', desc: 'Pure Hindi female' },
    'browser-tanishaa': { name: 'Tanishaa (Bengali, Browser)', lang: 'bn-IN', rate: 1.1, pitch: 1.35, gender: 'Female', desc: 'Bengali female' },
    'browser-dhwani': { name: 'Dhwani (Gujarati, Browser)', lang: 'gu-IN', rate: 1.1, pitch: 1.35, gender: 'Female', desc: 'Gujarati female' },
    'browser-sapna': { name: 'Sapna (Kannada, Browser)', lang: 'kn-IN', rate: 1.1, pitch: 1.35, gender: 'Female', desc: 'Kannada female' },
    'browser-sobhana': { name: 'Sobhana (Malayalam, Browser)', lang: 'ml-IN', rate: 1.1, pitch: 1.35, gender: 'Female', desc: 'Malayalam female' },
    'browser-aarohi': { name: 'Aarohi (Marathi, Browser)', lang: 'mr-IN', rate: 1.1, pitch: 1.35, gender: 'Female', desc: 'Marathi female' },
    'browser-pallavi': { name: 'Pallavi (Tamil, Browser)', lang: 'ta-IN', rate: 1.1, pitch: 1.35, gender: 'Female', desc: 'Tamil female' },
    'browser-shruti': { name: 'Shruti (Telugu, Browser)', lang: 'te-IN', rate: 1.1, pitch: 1.35, gender: 'Female', desc: 'Telugu female' },
    'browser-gul': { name: 'Gul (Urdu, Browser)', lang: 'ur-IN', rate: 1.1, pitch: 1.35, gender: 'Female', desc: 'Urdu female' },
    'browser-jenny': { name: 'Jenny (US English, Friendly)', lang: 'en-US', rate: 1.15, pitch: 1.4, gender: 'Female', desc: 'Friendly US teen' },
    'browser-aria': { name: 'Aria (US English, Warm)', lang: 'en-US', rate: 1.1, pitch: 1.35, gender: 'Female', desc: 'Warm US English' },
    'browser-emma': { name: 'Emma (US English, Bright)', lang: 'en-US', rate: 1.1, pitch: 1.35, gender: 'Female', desc: 'Bright US English' },
    'browser-libby': { name: 'Libby (UK English, Cheerful)', lang: 'en-GB', rate: 1.1, pitch: 1.35, gender: 'Female', desc: 'Cheerful UK English' },
    'browser-maisie': { name: 'Maisie (UK English, Youthful)', lang: 'en-GB', rate: 1.1, pitch: 1.35, gender: 'Female', desc: 'Youthful UK English' },
    'browser-sonia': { name: 'Sonia (UK English, Warm)', lang: 'en-GB', rate: 1.1, pitch: 1.35, gender: 'Female', desc: 'Warm UK English' },
    'browser-natasha': { name: 'Natasha (AU English, Friendly)', lang: 'en-AU', rate: 1.1, pitch: 1.35, gender: 'Female', desc: 'Friendly Australian' },
};

// SAMPLE TEXT FOR VOICE TESTING
const VOICE_SAMPLE_TEXT = "Hello, am Sia! Main aapke liye kya karu?";

let currentVoiceProfile = 'kokoro-bella';
let kokoroAvailable = true;

function filterTextForSpeech(text) {
    let filtered = text.replace(/:[a-zA-Z0-9_+-]+:/g, '');
    filtered = filtered.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}]/gu, '');
    filtered = filtered.replace(/\s+/g, ' ').trim();
    return filtered;
}

function getBrowserVoice(lang = 'en-IN') {
    const voices = window.speechSynthesis.getVoices();
    const priorities = [
        v => v.lang === lang && (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman') || v.name.toLowerCase().includes('girl')),
        v => v.lang === lang && v.name.toLowerCase().includes('google'),
        v => v.lang === lang && v.name.toLowerCase().includes('microsoft'),
        v => v.lang === 'hi-IN' && (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman')),
        v => v.lang === 'hi-IN',
        v => v.lang.startsWith('en') && (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman') || v.name.toLowerCase().includes('girl')),
        v => v.lang.startsWith('en') && v.name.toLowerCase().includes('google'),
        v => v.lang.startsWith('en') && v.name.toLowerCase().includes('microsoft'),
        v => v.lang.startsWith('en') && v.name.toLowerCase().includes('zira'),
        v => v.lang.startsWith('en') && v.name.toLowerCase().includes('hazel'),
        v => v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman'),
        v => v.lang.startsWith('en'),
    ];
    for (const check of priorities) {
        const v = voices.find(check);
        if (v) return v;
    }
    return voices[0];
}

export function setVoiceProfile(profile) {
    currentVoiceProfile = profile;
    console.log('[Audio] Voice profile set to:', profile);
    return true;
}

export function getVoiceProfile() {
    if (KOKORO_PROFILES[currentVoiceProfile]) return { ...KOKORO_PROFILES[currentVoiceProfile], engine: 'kokoro' };
    if (BROWSER_VOICES[currentVoiceProfile]) return { ...BROWSER_VOICES[currentVoiceProfile], engine: 'browser' };
    return { name: currentVoiceProfile, engine: 'browser' };
}

export function getAllVoiceProfiles() {
    const profiles = {};
    Object.entries(KOKORO_PROFILES).forEach(([key, v]) => { profiles[key] = { ...v, engine: 'kokoro' }; });
    Object.entries(BROWSER_VOICES).forEach(([key, v]) => { profiles[key] = { ...v, engine: 'browser' }; });
    return profiles;
}

export async function testVoice(profile, customText = null) {
    const text = customText || VOICE_SAMPLE_TEXT;
    if (KOKORO_PROFILES[profile]) {
        return fetchTTS(text, () => {}, profile);
    }
    if (BROWSER_VOICES[profile]) {
        return browserTTS(text, () => {}, profile);
    }
    return browserTTS(text, () => {}, 'browser-neerja');
}

// === KOKORO TTS (Local Server) ===
const KOKORO_URL = 'http://127.0.0.1:8880/v1/audio/speech';
let kokoroAvailable = true;

async function fetchTTS(text, volCallback, profileOverride = null) {
    const profile = KOKORO_PROFILES[profileOverride] || KOKORO_PROFILES['kokoro-bella'];
    
    if (!kokoroAvailable) return browserTTS(text, volCallback, 'browser-neerja');
    
    try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 10000);
        const res = await fetch(KOKORO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text: filterTextForSpeech(text), 
                model: 'kokoro-82m', 
                voice: profile.voice,
                speed: profile.speed
            }),
            signal: ctrl.signal
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
        return browserTTS(text, volCallback, 'browser-neerja');
    }
}

async function playBlob(blob, volCallback) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const an = ctx.createAnalyser();
    an.fftSize = 256;
    src.connect(an);
    an.connect(ctx.destination);
    const data = new Uint8Array(an.frequencyBinCount);
    let raf;
    return new Promise(resolve => {
        src.onended = () => { cancelAnimationFrame(raf); if (volCallback) volCallback(0); resolve(); };
        src.start(0);
        (function tick() {
            an.getByteFrequencyData(data);
            let s = 0;
            for (let i = 0; i < data.length; i++) s += data[i];
            if (volCallback) volCallback(s / data.length / 255);
            raf = requestAnimationFrame(tick);
        })();
    });
}

function filterTextForSpeech(text) {
    let filtered = text.replace(/:[a-zA-Z0-9_+-]+:/g, '');
    filtered = filtered.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}]/gu, '');
    filtered = filtered.replace(/\s+/g, ' ').trim();
    return filtered;
}

function browserTTS(text, volCallback, profile = 'browser-neerja') {
    return new Promise(resolve => {
        const u = new SpeechSynthesisUtterance(filterTextForSpeech(text));
        const voice = getBrowserVoice('en-IN');
        
        if (voice) {
            u.voice = voice;
            console.log('[Audio] Using browser voice:', voice.name, '| lang:', voice.lang);
        }
        
        let lang = 'en-IN', rate = 1.15, pitch = 1.4;
        
        if (BROWSER_VOICES[currentVoiceProfile]) {
            lang = BROWSER_VOICES[currentVoiceProfile].lang;
            rate = BROWSER_VOICES[currentVoiceProfile].rate;
            pitch = BROWSER_VOICES[currentVoiceProfile].pitch;
        } else if (KOKORO_PROFILES[currentVoiceProfile]) {
            lang = KOKORO_PROFILES[currentVoiceProfile].lang;
        }
        
        u.lang = lang;
        u.rate = rate;
        u.pitch = pitch;
        u.volume = 1.0;
        
        // Auto-detect Hindi
        const hasHindi = /[\u0900-\u097F]/.test(text);
        if (hasHindi) { u.lang = 'hi-IN'; u.rate = 1.0; u.pitch = 1.35; }
        
        // GenZ detection
        const hasGenZ = /(yaar|bro|bhai|chalo|arre|ya|omg|wow|lol|lmao|tbh|idk|fyi|imo|btw|brb|ttyl|rn|fr|ngl|smh|tbh|abhi|time|hua|hai|kya|kar|rahe|ho|main|tum|mujhe|pasand|nahi|haan|theek|achha|badhiya|mast|jhakaas|bakwas|bakwaas)/i.test(text);
        if (hasGenZ) { u.rate = Math.min(u.rate + 0.05, 1.25); u.pitch = Math.min(u.pitch + 0.05, 1.55); }
        
        const iv = setInterval(() => { if (volCallback) volCallback(0.1 + Math.random() * 0.4); }, 60);
        u.onend = () => { clearInterval(iv); if (volCallback) volCallback(0); resolve(); };
        u.onerror = (e) => { console.error('[Audio] Browser TTS error:', e); clearInterval(iv); if (volCallback) volCallback(0); resolve(); };
        window.speechSynthesis.speak(u);
    });
}

function getBrowserVoice(lang = 'en-IN') {
    const voices = window.speechSynthesis.getVoices();
    const priorities = [
        v => v.lang === lang && (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman') || v.name.toLowerCase().includes('girl')),
        v => v.lang === lang && v.name.toLowerCase().includes('google'),
        v => v.lang === lang && v.name.toLowerCase().includes('microsoft'),
        v => v.lang === 'hi-IN' && (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman')),
        v => v.lang === 'hi-IN',
        v => v.lang.startsWith('en') && (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman') || v.name.toLowerCase().includes('girl')),
        v => v.lang.startsWith('en') && v.name.toLowerCase().includes('google'),
        v => v.lang.startsWith('en') && v.name.toLowerCase().includes('microsoft'),
        v => v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman'),
        v => v.lang.startsWith('en'),
    ];
    for (const check of priorities) {
        const v = voices.find(check);
        if (v) return v;
    }
    return voices[0];
}

export function setVoiceProfile(profile) {
    currentVoiceProfile = profile;
    console.log('[Audio] Voice profile set to:', profile);
    return true;
}

export function getVoiceProfile() {
    if (KOKORO_PROFILES[currentVoiceProfile]) return { ...KOKORO_PROFILES[currentVoiceProfile], engine: 'kokoro' };
    if (BROWSER_VOICES[currentVoiceProfile]) return { ...BROWSER_VOICES[currentVoiceProfile], engine: 'browser' };
    return { name: currentVoiceProfile, engine: 'browser' };
}

export function getAllVoiceProfiles() {
    const profiles = {};
    Object.entries(KOKORO_PROFILES).forEach(([key, v]) => { profiles[key] = { ...v, engine: 'kokoro' }; });
    Object.entries(BROWSER_VOICES).forEach(([key, v]) => { profiles[key] = { ...v, engine: 'browser' }; });
    return profiles;
}

export async function testVoice(profile, customText = null) {
    const text = customText || "Hello, am Sia! Main aapke liye kya karu?";
    if (KOKORO_PROFILES[profile]) return fetchTTS(text, () => {}, profile);
    if (BROWSER_VOICES[profile]) return browserTTS(text, () => {}, profile);
    return browserTTS(text, () => {}, 'browser-neerja');
}

export function setVoiceProfile(profile) {
    currentVoiceProfile = profile;
    console.log('[Audio] Voice profile set to:', profile);
    return true;
}

export function getVoiceProfile() {
    if (KOKORO_PROFILES[currentVoiceProfile]) return { ...KOKORO_PROFILES[currentVoiceProfile], engine: 'kokoro' };
    if (BROWSER_VOICES[currentVoiceProfile]) return { ...BROWSER_VOICES[currentVoiceProfile], engine: 'browser' };
    return { name: currentVoiceProfile, engine: 'browser' };
}

export function getAllVoiceProfiles() {
    const profiles = {};
    Object.entries(KOKORO_PROFILES).forEach(([key, v]) => { profiles[key] = { ...v, engine: 'kokoro' }; });
    Object.entries(BROWSER_VOICES).forEach(([key, v]) => { profiles[key] = { ...v, engine: 'browser' }; });
    return profiles;
}

export async function testVoice(profile, customText = null) {
    const text = customText || "Hello, am Sia! Main aapke liye kya karu?";
    if (KOKORO_PROFILES[profile]) return fetchTTS(text, () => {}, profile);
    if (BROWSER_VOICES[profile]) return browserTTS(text, () => {}, profile);
    return browserTTS(text, () => {}, 'browser-neerja');
}

export function stopSpeaking() { window.speechSynthesis?.cancel(); }