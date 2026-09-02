const KOKORO_URL = 'http://127.0.0.1:8880/v1/audio/speech';

let currentVoiceProfile = 'indian-teen-hinglish';
let kokoroAvailable = true;
let availableKokoroVoices = [];

// === VOICE PROFILES - Optimized for Indian Teen Girl ===
const VOICE_PROFILES = {
    'indian-teen-hinglish': {
        kokoro: { voice: 'af_bella', speed: 1.15 }, // Young female, warm
        browser: { lang: 'en-IN', rate: 1.15, pitch: 1.4, volume: 1.0 },
        fallback: 'en-IN'
    },
    'indian-teen-hindi': {
        kokoro: { voice: 'af_heart', speed: 1.05 }, // Warm female for Hindi
        browser: { lang: 'hi-IN', rate: 1.0, pitch: 1.35, volume: 1.0 },
        fallback: 'hi-IN'
    },
    'indian-teen-english': {
        kokoro: { voice: 'af_bella', speed: 1.1 },
        browser: { lang: 'en-IN', rate: 1.1, pitch: 1.35, volume: 1.0 },
        fallback: 'en-IN'
    },
    'indian-teen-cute': {
        kokoro: { voice: 'af_sky', speed: 1.2 }, // Higher, cuter
        browser: { lang: 'en-IN', rate: 1.2, pitch: 1.5, volume: 1.0 },
        fallback: 'en-IN'
    },
    'browser-female': {
        kokoro: null,
        browser: { lang: 'en-US', rate: 1.1, pitch: 1.3, volume: 1.0 },
        fallback: 'en-US'
    }
};

function getFemaleVoice(lang = 'en-IN') {
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
    if (VOICE_PROFILES[profile]) {
        currentVoiceProfile = profile;
        console.log('[Audio] Voice profile set to:', profile);
        return true;
    }
    return false;
}

export function getVoiceProfile() {
    return VOICE_PROFILES[currentVoiceProfile] || VOICE_PROFILES['indian-teen-hinglish'];
}

function getFemaleVoiceForProfile(profile) {
    const profileConfig = VOICE_PROFILES[profile] || VOICE_PROFILES['indian-teen-hinglish'];
    const voices = window.speechSynthesis.getVoices();
    const lang = profileConfig.browser.lang;
    
    const exact = voices.find(v => v.lang === lang && (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman')));
    if (exact) return exact;
    
    const langMatch = voices.find(v => v.lang === lang);
    if (langMatch) return langMatch;
    
    return getFemaleVoice(lang);
}

export function setupSpeechRecognition(onResult, onState) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { console.error('[Audio] Speech API not supported'); return null; }
    const r = new SR();
    r.continuous = true;
    r.interimResults = false;
    r.lang = 'en-IN'; // Hinglish support
    r.onresult = (e) => {
        const last = e.results.length - 1;
        if (e.results[last].isFinal) {
            const t = e.results[last][0].transcript.trim();
            if (t) onResult(t);
        }
    };
    r.onstart = () => onState('listening');
    r.onend = () => onState('stopped');
    r.onerror = (e) => { console.warn('[Audio] Recog error:', e.error); onState('stopped'); };
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    return r;
}

// === FILTER EMOTICONS/EMOJIS FROM SPEECH ===
function filterTextForSpeech(text) {
    // Remove emoji shortcodes like :smile:, :heart:, etc.
    let filtered = text.replace(/:[a-zA-Z0-9_+-]+:/g, '');
    // Remove actual emoji characters
    filtered = filtered.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}]/gu, '');
    // Clean up multiple spaces
    filtered = filtered.replace(/\s+/g, ' ').trim();
    return filtered;
}

export async function fetchTTS(text, volCallback, profileOverride = null) {
    const profile = VOICE_PROFILES[profileOverride || currentVoiceProfile] || VOICE_PROFILES['indian-teen-hinglish'];
    
    // Filter emojis from speech text
    const speechText = filterTextForSpeech(text);
    
    console.log('[Audio] TTS:', speechText.substring(0, 50), '| Profile:', currentVoiceProfile);
    
    // Try Kokoro first
    if (kokoroAvailable && profile.kokoro) {
        try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 10000);
            const res = await fetch(KOKORO_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    text: speechText, 
                    model: 'kokoro-82m', 
                    voice: profile.kokoro.voice,
                    speed: profile.kokoro.speed
                }),
                signal: ctrl.signal
            });
            clearTimeout(tid);
            if (res.ok) {
                const blob = await res.blob();
                return await playBlob(blob, volCallback);
            }
            throw new Error('HTTP ' + res.status);
        } catch (e) {
            console.warn('[Audio] Kokoro failed:', e.message);
            kokoroAvailable = false;
        }
    }
    
    // Fallback to browser TTS
    return browserTTS(speechText, volCallback, profileOverride || currentVoiceProfile);
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
        src.onended = () => { cancelAnimationFrame(raf); volCallback(0); resolve(); };
        src.start(0);
        (function tick() {
            an.getByteFrequencyData(data);
            let s = 0;
            for (let i = 0; i < data.length; i++) s += data[i];
            volCallback(s / data.length / 255);
            raf = requestAnimationFrame(tick);
        })();
    });
}

function browserTTS(text, volCallback, profile = 'indian-teen-hinglish') {
    return new Promise(resolve => {
        const u = new SpeechSynthesisUtterance(text);
        const voice = getFemaleVoiceForProfile(profile);
        const profileConfig = VOICE_PROFILES[profile] || VOICE_PROFILES['indian-teen-hinglish'];
        
        if (voice) {
            u.voice = voice;
            console.log('[Audio] Using browser voice:', voice.name, '| lang:', voice.lang);
        }
        
        u.lang = profileConfig.browser.lang;
        u.rate = profileConfig.browser.rate;
        u.pitch = profileConfig.browser.pitch;
        u.volume = profileConfig.browser.volume;
        
        // Auto-detect Hindi (Devanagari)
        const hasHindi = /[\u0900-\u097F]/.test(text);
        if (hasHindi && profile !== 'indian-teen-hindi') {
            u.lang = 'hi-IN';
            u.rate = 1.0;
            u.pitch = 1.35;
        }
        
        // GenZ/Hinglish detection
        const hasGenZ = /(yaar|bro|bhai|chalo|arre|ya|omg|wow|lol|lmao|tbh|idk|fyi|imo|btw|brb|ttyl|rn|fr|ngl|smh|tbh|abhi|time|hua|hai|kya|kar|rahe|ho|main|tum|mujhe|pasand|nahi|haan|theek|achha|badhiya|mast|jhakaas|bakwas|bakwaas)/i.test(text);
        if (hasGenZ && profile !== 'indian-teen-hindi') {
            u.rate = Math.min(u.rate + 0.05, 1.25);
            u.pitch = Math.min(u.pitch + 0.05, 1.55);
        }
        
        const iv = setInterval(() => volCallback(0.1 + Math.random() * 0.4), 60);
        u.onend = () => { clearInterval(iv); volCallback(0); resolve(); };
        u.onerror = (e) => { console.error('[Audio] Browser TTS error:', e); clearInterval(iv); volCallback(0); resolve(); };
        window.speechSynthesis.speak(u);
    });
}

export function setVoiceProfile(profile) {
    if (VOICE_PROFILES[profile]) {
        currentVoiceProfile = profile;
        console.log('[Audio] Voice profile set to:', profile);
        return true;
    }
    return false;
}

export function getVoiceProfile() {
    return VOICE_PROFILES[currentVoiceProfile] || VOICE_PROFILES['indian-teen-hinglish'];
}

export function stopSpeaking() { window.speechSynthesis?.cancel(); }
export function isKokoroAvailable() { return kokoroAvailable; }