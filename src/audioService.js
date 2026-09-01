const KOKORO_URL = 'http://127.0.0.1:8880/v1/audio/speech';

export function setupSpeechRecognition(onResult, onState) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        console.error('[Audio] Speech API not supported');
        return null;
    }
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
    r.onerror = (e) => {
        console.warn('[Audio] Recog error:', e.error);
        onState('stopped');
    };
    return r;
}

export async function fetchTTS(text, volCallback) {
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
        console.warn('[Audio] Kokoro failed:', e.message, '- using browser TTS');
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
        const iv = setInterval(() => volCallback(0.2 + Math.random() * 0.4), 80);
        u.onend = () => { clearInterval(iv); volCallback(0); resolve(); };
        u.onerror = () => { clearInterval(iv); volCallback(0); resolve(); };
        window.speechSynthesis.speak(u);
    });
}

export function stopSpeaking() { window.speechSynthesis?.cancel(); }
