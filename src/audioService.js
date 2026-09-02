const KOKORO_URL = 'http://127.0.0.1:8880/v1/audio/speech';

let currentVoiceProfile = 'edge-neerja-expressive';
let kokoroAvailable = true;
let edgeTTSAvailable = true;

// === EDGE-TTS VOICES - Indian Female Voices + Best Teen Options ===
const EDGE_VOICES = {
    // === INDIAN ENGLISH (en-IN) ===
    'edge-neerja': { name: 'Neerja (Indian English, Warm)', voice: 'en-IN-NeerjaNeural', lang: 'en-IN', gender: 'Female', desc: 'Natural Indian English, warm & friendly' },
    'edge-neerja-expressive': { name: 'Neerja Expressive (Indian English, Emotional)', voice: 'en-IN-NeerjaExpressiveNeural', lang: 'en-IN', gender: 'Female', desc: 'Expressive Indian English, great for emotions' },
    'edge-prabhat': { name: 'Prabhat (Indian English, Male)', voice: 'en-IN-PrabhatNeural', lang: 'en-IN', gender: 'Male', desc: 'Indian English male voice' },
    
    // === HINDI (hi-IN) ===
    'edge-swara': { name: 'Swara (Hindi, Female, Natural)', voice: 'hi-IN-SwaraNeural', lang: 'hi-IN', gender: 'Female', desc: 'Natural Hindi female, perfect for pure Hindi' },
    'edge-madhur': { name: 'Madhur (Hindi, Male)', voice: 'hi-IN-MadhurNeural', lang: 'hi-IN', gender: 'Male', desc: 'Hindi male voice' },
    
    // === OTHER INDIAN LANGUAGES (Female) ===
    'edge-tanishaa': { name: 'Tanishaa (Bengali, Female)', voice: 'bn-IN-TanishaaNeural', lang: 'bn-IN', gender: 'Female', desc: 'Bengali female voice' },
    'edge-dhwani': { name: 'Dhwani (Gujarati, Female)', voice: 'gu-IN-DhwaniNeural', lang: 'gu-IN', gender: 'Female', desc: 'Gujarati female voice' },
    'edge-sapna': { name: 'Sapna (Kannada, Female)', voice: 'kn-IN-SapnaNeural', lang: 'kn-IN', gender: 'Female', desc: 'Kannada female voice' },
    'edge-sobhana': { name: 'Sobhana (Malayalam, Female)', voice: 'ml-IN-SobhanaNeural', lang: 'ml-IN', gender: 'Female', desc: 'Malayalam female voice' },
    'edge-aarohi': { name: 'Aarohi (Marathi, Female)', voice: 'mr-IN-AarohiNeural', lang: 'mr-IN', gender: 'Female', desc: 'Marathi female voice' },
    'edge-pallavi': { name: 'Pallavi (Tamil, Female)', voice: 'ta-IN-PallaviNeural', lang: 'ta-IN', gender: 'Female', desc: 'Tamil female voice' },
    'edge-shruti': { name: 'Shruti (Telugu, Female)', voice: 'te-IN-ShrutiNeural', lang: 'te-IN', gender: 'Female', desc: 'Telugu female voice' },
    'edge-gul': { name: 'Gul (Urdu, Female)', voice: 'ur-IN-GulNeural', lang: 'ur-IN', gender: 'Female', desc: 'Urdu female voice' },
    
    // === OTHER HIGH-QUALITY FEMALE VOICES (Great for Teen Persona) ===
    'edge-jenny': { name: 'Jenny (US English, Friendly Teen)', voice: 'en-US-JennyNeural', lang: 'en-US', gender: 'Female', desc: 'Friendly US English, great teen vibe' },
    'edge-aria': { name: 'Aria (US English, Warm)', voice: 'en-US-AriaNeural', lang: 'en-US', gender: 'Female', desc: 'Warm US English' },
    'edge-emma': { name: 'Emma (US English, Bright)', voice: 'en-US-EmmaNeural', lang: 'en-US', gender: 'Female', desc: 'Bright US English' },
    'edge-ana': { name: 'Ana (US English, Soft)', voice: 'en-US-AnaNeural', lang: 'en-US', gender: 'Female', desc: 'Soft US English' },
    'edge-michelle': { name: 'Michelle (US English, Professional)', voice: 'en-US-MichelleNeural', lang: 'en-US', gender: 'Female', desc: 'Professional US English' },
    'edge-libby': { name: 'Libby (UK English, Cheerful)', voice: 'en-GB-LibbyNeural', lang: 'en-GB', gender: 'Female', desc: 'Cheerful UK English' },
    'edge-maisie': { name: 'Maisie (UK English, Youthful)', voice: 'en-GB-MaisieNeural', lang: 'en-GB', gender: 'Female', desc: 'Youthful UK English' },
    'edge-sonia': { name: 'Sonia (UK English, Warm)', voice: 'en-GB-SoniaNeural', lang: 'en-GB', gender: 'Female', desc: 'Warm UK English' },
    'edge-natasha': { name: 'Natasha (AU English, Friendly)', voice: 'en-AU-NatashaNeural', lang: 'en-AU', gender: 'Female', desc: 'Friendly Australian English' },
    'edge-clara': { name: 'Clara (CA English, Soft)', voice: 'en-CA-ClaraNeural', lang: 'en-CA', gender: 'Female', desc: 'Soft Canadian English' },
    'edge-xiaoxiao': { name: 'Xiaoxiao (Chinese, Female)', voice: 'zh-CN-XiaoxiaoNeural', lang: 'zh-CN', gender: 'Female', desc: 'Chinese female' },
};

// SAMPLE TEXT FOR VOICE TESTING
const VOICE_SAMPLE_TEXT = "Hello, am Sia! Main aapke liye kya karu?";

// === KOKORO FALLBACK PROFILES ===
const KOKORO_PROFILES = {
    'kokoro-bella': { name: 'Bella (Kokoro, Teen)', voice: 'af_bella', speed: 1.15, lang: 'en-US' },
    'kokoro-heart': { name: 'Heart (Kokoro, Warm)', voice: 'af_heart', speed: 1.1, lang: 'en-US' },
    'kokoro-sky': { name: 'Sky (Kokoro, Cute/High)', voice: 'af_sky', speed: 1.2, lang: 'en-US' },
    'kokoro-nova': { name: 'Nova (Kokoro, Bright)', voice: 'af_nova', speed: 1.1, lang: 'en-US' },
};

let currentVoiceProfile = 'edge-neerja-expressive';
let currentEngine = 'edge'; // 'edge', 'kokoro', 'browser'
let kokoroAvailable = true;
let edgeTTSAvailable = true;

function filterTextForSpeech(text) {
    let filtered = text.replace(/:[a-zA-Z0-9_+-]+:/g, '');
    filtered = filtered.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}]/gu, '');
    filtered = filtered.replace(/\s+/g, ' ').trim();
    return filtered;
}

function getBrowserVoice(lang = 'en-IN') {
    const voices = window.speechSynthesis.getVoices();
    const priorities = [
        v => v.lang === 'en-IN' && (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman') || v.name.toLowerCase().includes('girl')),
        v => v.lang === 'en-IN' && v.name.toLowerCase().includes('google'),
        v => v.lang === 'en-IN' && v.name.toLowerCase().includes('microsoft'),
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
    // Check edge voices first
    if (EDGE_VOICES[profile]) {
        currentVoiceProfile = profile;
        currentEngine = 'edge';
        console.log('[Audio] Voice profile set to:', profile, '| Engine: edge');
        return true;
    }
    // Check kokoro profiles
    if (KOKORO_PROFILES[profile]) {
        currentVoiceProfile = profile;
        currentEngine = 'kokoro';
        console.log('[Audio] Voice profile set to:', profile, '| Engine: kokoro');
        return true;
    }
    // Browser fallback
    currentVoiceProfile = profile;
    currentEngine = 'browser';
    console.log('[Audio] Voice profile set to:', profile, '| Engine: browser');
    return true;
}

export function getVoiceProfile() {
    if (EDGE_VOICES[currentVoiceProfile]) return { ...EDGE_VOICES[currentVoiceProfile], engine: 'edge' };
    if (KOKORO_PROFILES[currentVoiceProfile]) return { ...KOKORO_PROFILES[currentVoiceProfile], engine: 'kokoro' };
    return { name: currentVoiceProfile, engine: 'browser' };
}

export function getAllVoiceProfiles() {
    const profiles = {};
    Object.entries(EDGE_VOICES).forEach(([key, v]) => { profiles[key] = { ...v, engine: 'edge' }; });
    Object.entries(KOKORO_PROFILES).forEach(([key, v]) => { profiles[key] = { ...v, engine: 'kokoro' }; });
    profiles['browser-female'] = { name: 'Browser Female (Fallback)', engine: 'browser', lang: 'en-IN' };
    return profiles;
}

export async function testVoice(profile, customText = null) {
    const text = customText || VOICE_SAMPLE_TEXT;
    if (EDGE_VOICES[profile]) {
        currentEngine = 'edge';
        return edgeTTS(text, profile);
    }
    if (KOKORO_PROFILES[profile]) {
        currentEngine = 'kokoro';
        return fetchTTS(VOICE_SAMPLE_TEXT, (v) => {}, profile);
    }
    // Browser fallback
    return browserTTS(VOICE_SAMPLE_TEXT, (v) => {}, profile);
}

// === EDGE TTS IMPLEMENTATION ===
async function edgeTTS(text, profile) {
    if (!edgeTTSAvailable) {
        console.warn('[Audio] Edge TTS not available, falling back');
        return browserTTS(text, () => {}, profile);
    }
    
    try {
        const voiceConfig = EDGE_VOICES[profile] || EDGE_VOICES['edge-neerja-expressive'];
        const module = await import('https://cdn.jsdelivr.net/npm/edge-tts@1.0.0/dist/edge-tts.min.js');
        const { Communicate } = module;
        
        const communicate = new Communicate(text, voiceConfig.voice);
        const chunks = [];
        
        for await (const event of communicate.stream()) {
            if (event.type === 'audio') {
                chunks.push(event.data);
            }
        }
        
        const blob = new Blob(chunks, { type: 'audio/mpeg' });
        return playBlob(blob, () => {});
    } catch (e) {
        console.warn('[Audio] Edge TTS failed:', e.message);
        edgeTTSAvailable = false;
        return browserTTS(text, () => {}, profile);
    }
}

// === KOKORO TTS ===
const KOKORO_URL = 'http://127.0.0.1:8880/v1/audio/speech';
let kokoroAvailable = true;

const KOKORO_PROFILES = {
    'kokoro-bella': { name: 'Bella (Kokoro, Teen)', voice: 'af_bella', speed: 1.15, lang: 'en-US' },
    'kokoro-heart': { name: 'Heart (Kokoro, Warm)', voice: 'af_heart', speed: 1.1, lang: 'en-US' },
    'kokoro-sky': { name: 'Sky (Kokoro, Cute/High)', voice: 'af_sky', speed: 1.2, lang: 'en-US' },
    'kokoro-nova': { name: 'Nova (Kokoro, Bright)', voice: 'af_nova', speed: 1.1, lang: 'en-US' },
};

let kokoroAvailable = true;

async function fetchTTS(text, volCallback, profileOverride = null) {
    const profile = KOKORO_PROFILES[profileOverride] || KOKORO_PROFILES['kokoro-bella'];
    
    if (!kokoroAvailable) return browserTTS(text, volCallback, 'browser-female');
    
    try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 10000);
        const res = await fetch(KOKORO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text, 
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
        return browserTTS(text, volCallback, 'browser-female');
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

// === BROWSER TTS FALLBACK ===
function browserTTS(text, volCallback, profile = 'edge-neerja-expressive') {
    return new Promise(resolve => {
        const u = new SpeechSynthesisUtterance(text);
        const voice = getBrowserVoice('en-IN');
        
        if (voice) {
            u.voice = voice;
            console.log('[Audio] Using browser voice:', voice.name, '| lang:', voice.lang);
        }
        
        // Determine language from profile
        let lang = 'en-IN';
        let rate = 1.15;
        let pitch = 1.4;
        
        if (EDGE_VOICES[profile]) {
            lang = EDGE_VOICES[profile].lang;
        } else if (KOKORO_PROFILES[profile]) {
            lang = KOKORO_PROFILES[profile].lang;
        }
        
        u.lang = lang;
        u.rate = rate;
        u.pitch = pitch;
        u.volume = 1.0;
        
        // Auto-detect Hindi
        const hasHindi = /[\u0900-\u097F]/.test(text);
        if (hasHindi) {
            u.lang = 'hi-IN';
            u.rate = 1.0;
            u.pitch = 1.35;
        }
        
        // GenZ detection
        const hasGenZ = /(yaar|bro|bhai|chalo|arre|ya|omg|wow|lol|lmao|tbh|idk|fyi|imo|btw|brb|ttyl|rn|fr|ngl|smh|tbh|abhi|time|hua|hai|kya|kar|rahe|ho|main|tum|mujhe|pasand|nahi|haan|theek|achha|badhiya|mast|jhakaas|bakwas|bakwaas)/i.test(text);
        if (hasGenZ) {
            u.rate = Math.min(u.rate + 0.05, 1.25);
            u.pitch = Math.min(u.pitch + 0.05, 1.55);
        }
        
        const iv = setInterval(() => {
            if (volCallback) volCallback(0.1 + Math.random() * 0.4);
        }, 60);
        
        u.onend = () => { clearInterval(iv); if (volCallback) volCallback(0); resolve(); };
        u.onerror = (e) => { console.error('[Audio] Browser TTS error:', e); clearInterval(iv); if (volCallback) volCallback(0); resolve(); };
        window.speechSynthesis.speak(u);
    });
}

export function setVoiceProfile(profile) {
    if (EDGE_VOICES[profile]) {
        currentVoiceProfile = profile;
        currentEngine = 'edge';
        console.log('[Audio] Voice profile set to:', profile, '| Engine: edge');
        return true;
    }
    if (KOKORO_PROFILES[profile]) {
        currentVoiceProfile = profile;
        currentEngine = 'kokoro';
        console.log('[Audio] Voice profile set to:', profile, '| Engine: kokoro');
        return true;
    }
    currentVoiceProfile = profile;
    currentEngine = 'browser';
    console.log('[Audio] Voice profile set to:', profile, '| Engine: browser');
    return true;
}

export function getVoiceProfile() {
    if (EDGE_VOICES[currentVoiceProfile]) return { ...EDGE_VOICES[currentVoiceProfile], engine: 'edge' };
    if (KOKORO_PROFILES[currentVoiceProfile]) return { ...KOKORO_PROFILES[currentVoiceProfile], engine: 'kokoro' };
    return { name: currentVoiceProfile, engine: 'browser' };
}

export function getAllVoiceProfiles() {
    const profiles = {};
    Object.entries(EDGE_VOICES).forEach(([key, v]) => { profiles[key] = { ...v, engine: 'edge' }; });
    Object.entries(KOKORO_PROFILES).forEach(([key, v]) => { profiles[key] = { ...v, engine: 'kokoro' }; });
    profiles['browser-female'] = { name: 'Browser Female (Fallback)', engine: 'browser', lang: 'en-IN' };
    return profiles;
}

export async function testVoice(profile, customText = null) {
    const text = customText || "Hello, am Sia! Main aapke liye kya karu?";
    if (EDGE_VOICES[profile]) {
        return edgeTTS(text, profile);
    }
    if (KOKORO_PROFILES[profile]) {
        return fetchTTS(VOICE_SAMPLE_TEXT, () => {}, profile);
    }
    return browserTTS(text, () => {}, profile);
}

// Need to define edgeTTS before it's used in testVoice
async function edgeTTS(text, profile) {
    try {
        // Dynamic import edge-tts from CDN
        const { Communicate } = await import('https://cdn.jsdelivr.net/npm/edge-tts@1.0.0/dist/edge-tts.min.js');
        const voiceConfig = EDGE_VOICES[profile] || EDGE_VOICES['edge-neerja-expressive'];
        const communicate = new Communicate(text, voiceConfig.voice);
        const chunks = [];
        
        for await (const event of communicate.stream()) {
            if (event.type === 'audio') {
                chunks.push(event.data);
            }
        }
        
        const blob = new Blob(chunks, { type: 'audio/mpeg' });
        return playBlob(blob, () => {});
    } catch (e) {
        console.warn('[Audio] Edge TTS failed:', e.message);
        return browserTTS(text, () => {}, profile);
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

export function setVoiceProfile(profile) {
    if (EDGE_VOICES[profile] || KOKORO_PROFILES[profile]) {
        currentVoiceProfile = profile;
        console.log('[Audio] Voice profile set to:', profile);
        return true;
    }
    return false;
}

export function getVoiceProfile() {
    if (EDGE_VOICES[currentVoiceProfile]) return { ...EDGE_VOICES[currentVoiceProfile], engine: 'edge' };
    if (KOKORO_PROFILES[currentVoiceProfile]) return { ...KOKORO_PROFILES[currentVoiceProfile], engine: 'kokoro' };
    return { name: currentVoiceProfile, engine: 'browser' };
}

export function getAllVoiceProfiles() {
    const profiles = {};
    Object.entries(EDGE_VOICES).forEach(([key, v]) => { profiles[key] = { ...v, engine: 'edge' }; });
    Object.entries(KOKORO_PROFILES).forEach(([key, v]) => { profiles[key] = { ...v, engine: 'kokoro' }; });
    profiles['browser-female'] = { name: 'Browser Female (Fallback)', engine: 'browser', lang: 'en-IN' };
    return profiles;
}

export async function testVoice(profile, customText = null) {
    const text = customText || "Hello, am Sia! Main aapke liye kya karu?";
    if (EDGE_VOICES[profile]) {
        return edgeTTS(text, profile);
    }
    if (KOKORO_PROFILES[profile]) {
        return fetchTTS(VOICE_SAMPLE_TEXT, () => {}, profile);
    }
    return browserTTS(text, () => {}, profile);
}

export function setVoiceProfile(profile) {
    if (EDGE_VOICES[profile] || KOKORO_PROFILES[profile]) {
        currentVoiceProfile = profile;
        console.log('[Audio] Voice profile set to:', profile);
        return true;
    }
    return false;
}

export function getVoiceProfile() {
    if (EDGE_VOICES[currentVoiceProfile]) return { ...EDGE_VOICES[currentVoiceProfile], engine: 'edge' };
    if (KOKORO_PROFILES[currentVoiceProfile]) return { ...KOKORO_PROFILES[currentVoiceProfile], engine: 'kokoro' };
    return { name: currentVoiceProfile, engine: 'browser' };
}

export function getAllVoiceProfiles() {
    const profiles = {};
    Object.entries(EDGE_VOICES).forEach(([key, v]) => { profiles[key] = { ...v, engine: 'edge' }; });
    Object.entries(KOKORO_PROFILES).forEach(([key, v]) => { profiles[key] = { ...v, engine: 'kokoro' }; });
    profiles['browser-female'] = { name: 'Browser Female (Fallback)', engine: 'browser', lang: 'en-IN' };
    return profiles;
}

export async function testVoice(profile, customText = null) {
    const text = customText || "Hello, am Sia! Main aapke liye kya karu?";
    if (EDGE_VOICES[profile]) {
        return edgeTTS(text, profile);
    }
    if (KOKORO_PROFILES[profile]) {
        return fetchTTS(VOICE_SAMPLE_TEXT, () => {}, profile);
    }
    return browserTTS(text, () => {}, profile);
}

export function setVoiceProfile(profile) {
    if (EDGE_VOICES[profile] || KOKORO_PROFILES[profile]) {
        currentVoiceProfile = profile;
        console.log('[Audio] Voice profile set to:', profile);
        return true;
    }
    return false;
}

export function getVoiceProfile() {
    if (EDGE_VOICES[currentVoiceProfile]) return { ...EDGE_VOICES[currentVoiceProfile], engine: 'edge' };
    if (KOKORO_PROFILES[currentVoiceProfile]) return { ...KOKORO_PROFILES[currentVoiceProfile], engine: 'kokoro' };
    return { name: currentVoiceProfile, engine: 'browser' };
}

export function getAllVoiceProfiles() {
    const profiles = {};
    Object.entries(EDGE_VOICES).forEach(([key, v]) => { profiles[key] = { ...v, engine: 'edge' }; });
    Object.entries(KOKORO_PROFILES).forEach(([key, v]) => { profiles[key] = { ...v, engine: 'kokoro' }; });
    profiles['browser-female'] = { name: 'Browser Female (Fallback)', engine: 'browser', lang: 'en-IN' };
    return profiles;
}

export async function testVoice(profile, customText = null) {
    const text = customText || "Hello, am Sia! Main aapke liye kya karu?";
    if (EDGE_VOICES[profile]) {
        return edgeTTS(text, profile);
    }
    if (KOKORO_PROFILES[profile]) {
        return fetchTTS(VOICE_SAMPLE_TEXT, () => {}, profile);
    }
    return browserTTS(text, () => {}, profile);
}

export function setVoiceProfile(profile) {
    if (EDGE_VOICES[profile] || KOKORO_PROFILES[profile]) {
        currentVoiceProfile = profile;
        console.log('[Audio] Voice profile set to:', profile);
        return true;
    }
    return false;
}

export function getVoiceProfile() {
    if (EDGE_VOICES[currentVoiceProfile]) return { ...EDGE_VOICES[currentVoiceProfile], engine: 'edge' };
    if (KOKORO_PROFILES[currentVoiceProfile]) return { ...KOKORO_PROFILES[currentVoiceProfile], engine: 'kokoro' };
    return { name: currentVoiceProfile, engine: 'browser' };
}

export function getAllVoiceProfiles() {
    const profiles = {};
    Object.entries(EDGE_VOICES).forEach(([key, v]) => { profiles[key] = { ...v, engine: 'edge' }; });
    Object.entries(KOKORO_PROFILES).forEach(([key, v]) => { profiles[key] = { ...v, engine: 'kokoro' }; });
    profiles['browser-female'] = { name: 'Browser Female (Fallback)', engine: 'browser', lang: 'en-IN' };
    return profiles;
}

export async function testVoice(profile, customText = null) {
    const text = customText || "Hello, am Sia! Main aapke liye kya karu?";
    if (EDGE_VOICES[profile]) {
        return edgeTTS(text, profile);
    }
    if (KOKORO_PROFILES[profile]) {
        return fetchTTS(VOICE_SAMPLE_TEXT, () => {}, profile);
    }
    return browserTTS(text, () => {}, profile);
}

export function stopSpeaking() { window.speechSynthesis?.cancel(); }