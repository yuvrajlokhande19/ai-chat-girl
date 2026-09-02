const KOKORO_URL = 'http://127.0.0.1:8880/v1/audio/speech';

let currentVoiceProfile = 'indian-teen';
let kokoroAvailable = true;

// === VOICE PROFILES ===
const VOICE_PROFILES = {
    'indian-teen': {
        kokoro: { voice: 'af_heart', speed: 1.1 }, // af_heart is warm female
        browser: { lang: 'en-IN', rate: 1.1, pitch: 1.4, volume: 1.0 },
        fallback: 'en-IN'
    },
    'indian-teen-en': {
        kokoro: { voice: 'af_bella', speed: 1.15 }, // af_bella is younger sounding
        browser: { lang: 'en-IN', rate: 1.15, pitch: 1.45, volume: 1.0 },
        fallback: 'en-IN'
    },
    'indian-teen-hindi': {
        kokoro: { voice: 'af_heart', speed: 1.05 },
        browser: { lang: 'hi-IN', rate: 1.0, pitch: 1.35, volume: 1.0 },
        fallback: 'hi-IN'
    },
    'browser-female': {
        kokoro: null,
        browser: { lang: 'en-US', rate: 1.1, pitch: 1.3, volume: 1.0 },
        fallback: 'en-US'
    }
};

function getFemaleVoice(lang = 'en-IN') {
    const voices = window.speechSynthesis.getVoices();
    
    // Priority order for Indian teenage girl voice
    const priorities = [
        // Indian English female voices
        v => v.lang === 'en-IN' && (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman') || v.name.toLowerCase().includes('girl')),
        v => v.lang === 'en-IN' && v.name.toLowerCase().includes('google'),
        v => v.lang === 'en-IN' && v.name.toLowerCase().includes('microsoft'),
        // Hindi voices
        v => v.lang === 'hi-IN' && (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman')),
        v => v.lang === 'hi-IN',
        // General English female
        v => v.lang.startsWith('en') && (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman') || v.name.toLowerCase().includes('girl')),
        v => v.lang.startsWith('en') && v.name.toLowerCase().includes('google'),
        v => v.lang.startsWith('en') && v.name.toLowerCase().includes('microsoft'),
        v => v.lang.startsWith('en') && v.name.toLowerCase().includes('zira'),
        v => v.lang.startsWith('en') && v.name.toLowerCase().includes('hazel'),
        // Any female
        v => v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman'),
        // Fallback
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
    return VOICE_PROFILES[currentVoiceProfile] || VOICE_PROFILES['indian-teen'];
}

function getFemaleVoiceForProfile(profile) {
    const profileConfig = VOICE_PROFILES[profile] || VOICE_PROFILES['indian-teen'];
    const voices = window.speechSynthesis.getVoices();
    const lang = profileConfig.browser.lang;
    
    // Try to find voice matching profile language
    const exact = voices.find(v => v.lang === lang && (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman')));
    if (exact) return exact;
    
    const langMatch = voices.find(v => v.lang === lang);
    if (langMatch) return langMatch;
    
    // Fallback to general female
    return getFemaleVoice(lang);
}

export function setupSpeechRecognition(onResult, onState) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { console.error('[Audio] Speech API not supported'); return null; }
    const r = new SR();
    r.continuous = true;
    r.interimResults = false;
    // Support Hindi + English
    r.lang = 'en-IN';
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

export async function fetchTTS(text, volCallback, profileOverride = null) {
    const profile = VOICE_PROFILES[profileOverride || currentVoiceProfile] || VOICE_PROFILES['indian-teen'];
    
    console.log('[Audio] TTS:', text.substring(0, 50), '| Profile:', currentVoiceProfile);
    
    // Try Kokoro first
    if (kokoroAvailable && profile.kokoro) {
        try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 10000);
            const res = await fetch(KOKORO_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    text, 
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
    
    // Fallback to browser TTS with profile
    return browserTTS(text, volCallback, profileOverride || currentVoiceProfile);
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

function browserTTS(text, volCallback, profile = 'indian-teen') {
    return new Promise(resolve => {
        const u = new SpeechSynthesisUtterance(text);
        const voice = getFemaleVoiceForProfile(profile);
        const profileConfig = VOICE_PROFILES[profile] || VOICE_PROFILES['indian-teen'];
        
        if (voice) {
            u.voice = voice;
            console.log('[Audio] Using browser voice:', voice.name, '| lang:', voice.lang);
        }
        
        u.lang = profileConfig.browser.lang;
        u.rate = profileConfig.browser.rate;
        u.pitch = profileConfig.browser.pitch;
        u.volume = profileConfig.browser.volume;
        
        // For Hindi text, adjust if needed
        const hasHindi = /[\u0900-\u097F]/.test(text);
        if (hasHindi && profile !== 'indian-teen-hindi') {
            u.lang = 'hi-IN';
            u.rate = 1.0;
            u.pitch = 1.35;
        }
        
        // For GenZ/mixed text
        const hasGenZ = /(yaar|bro|bhai|chalo|arre|ya|omg|wow|lol|lmao|tbh|idk|fyi|imo|btw|brb|ttyl|rn|fr|ngl|smh|tbh)/i.test(text);
        if (hasGenZ && profile !== 'indian-teen-hindi') {
            u.rate = Math.min(u.rate + 0.05, 1.2);
            u.pitch = Math.min(u.pitch + 0.05, 1.5);
        }
        
        const iv = setInterval(() => volCallback(0.1 + Math.random() * 0.4), 60);
        u.onend = () => { clearInterval(iv); volCallback(0); resolve(); };
        u.onerror = (e) => { console.error('[Audio] Browser TTS error:', e); clearInterval(iv); volCallback(0); resolve(); };
        window.speechSynthesis.speak(u);
    });
}

export function stopSpeaking() { window.speechSynthesis?.cancel(); }
export function isKokoroAvailable() { return kokoroAvailable; }