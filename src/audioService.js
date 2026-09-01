const KOKORO_URL = 'http://127.0.0.1:8880/v1/audio/speech';

function getFemaleVoice() {
    const voices = window.speechSynthesis.getVoices();
    // Prefer young female English voices
    const preferred = ['Google UK English Female', 'Google US English', 'Microsoft Zira', 'Microsoft Hazel',
        'Samantha', 'Victoria', 'Karen', 'Moira', 'Tessa', 'Fiona',
        'Female', 'Girl', 'Zira', 'Hazel', 'Susan', 'Anna'];
    for (const name of preferred) {
        const v = voices.find(v => v.name.includes(name));
        if (v) return v;
    }
    // Fallback: any English female voice
    const female = voices.find(v => v.lang.startsWith('en') && (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman')));
    if (female) return female;
    // Fallback: first English voice
    return voices.find(v => v.lang.startsWith('en')) || voices[0];
}

export function setupSpeechRecognition(onResult, onState) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { console.error('[Audio] Speech API not supported'); return null; }
    const r = new SR();
    r.continuous = true;
    r.interimResults = false;
    r.lang = 'en-US';
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
    // Pre-load voices
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    return r;
}

export async function fetchTTS(text, volCallback) {
    console.log('[Audio] TTS:', text.substring(0, 40));
    try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(KOKORO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, model: 'kokoro-82m', voice: 'af_heart' }),
            signal: ctrl.signal
        });
        clearTimeout(tid);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const blob = await res.blob();
        return playBlob(blob, volCallback);
    } catch (e) {
        console.warn('[Audio] Kokoro failed:', e.message, '- using female browser voice');
        return browserTTS(text, volCallback);
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

function browserTTS(text, volCallback) {
    return new Promise(resolve => {
        const u = new SpeechSynthesisUtterance(text);
        const voice = getFemaleVoice();
        if (voice) {
            u.voice = voice;
            console.log('[Audio] Using voice:', voice.name);
        }
        u.rate = 1.05;
        u.pitch = 1.3;
        u.volume = 1.0;
        const iv = setInterval(() => volCallback(0.15 + Math.random() * 0.35), 80);
        u.onend = () => { clearInterval(iv); volCallback(0); resolve(); };
        u.onerror = () => { clearInterval(iv); volCallback(0); resolve(); };
        window.speechSynthesis.speak(u);
    });
}

export function stopSpeaking() { window.speechSynthesis?.cancel(); }
