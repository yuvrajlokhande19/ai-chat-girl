// audioService.js — Voice for Arohi.
// Primary: ElevenLabs (natural, expressive). Fallback: Edge TTS (Aarohi) ->
// Kokoro -> browser speechSynthesis. Auto-falls back when the ElevenLabs
// token runs out.

import CONFIG from './config.js';

const ELEVEN_URL = 'https://api.elevenlabs.io/v1/text-to-speech/' + CONFIG.ELEVENLABS_VOICE_ID;
// 2026 ElevenLabs models. eleven_multilingual_v2 is the quality "girl" voice;
// eleven_flash_v2_5 is the low-latency chat option. Both map to
// TextToSpeech.convert(voiceId, { text, modelId, outputFormat }).
const ELEVEN_MODELS = ['eleven_multilingual_v2', 'eleven_flash_v2_5'];
const ELEVEN_OUTPUT_FORMAT = 'mp3_44100_128';
let elevenAvailable = true;
let elevenBlockedReason = '';

const EDGE_TTS_URL = 'http://127.0.0.1:8881/v1/audio/speech';
const KOKORO_URL = 'http://127.0.0.1:8880/v1/audio/speech';
// Sarvam AI free Indian girl voices (Bulbul v3). Direct cloud REST API.
// Bulbul v3 does NOT support pitch/loudness — use temperature for expressiveness.
// Best female speakers (tier 1): priya, ishita. Younger: neha, suhani, tanya.
const SARVAM_URL = 'https://api.sarvam.ai/text-to-speech';
const SARVAM_PROFILES = {
  'sarvam-priya':   { name: 'Sarvam Priya (Hindi, Best)',      lang: 'hi-IN', speaker: 'priya',   rate: 1.0, pitch: 0,   engine: 'sarvam', desc: 'Best quality Hindi girl voice' },
  'sarvam-ishita':  { name: 'Sarvam Ishita (Hindi)',            lang: 'hi-IN', speaker: 'ishita',  rate: 1.0, pitch: 0,   engine: 'sarvam', desc: 'High quality Hindi girl voice' },
  'sarvam-neha':    { name: 'Sarvam Neha (Hindi, Young)',       lang: 'hi-IN', speaker: 'neha',    rate: 1.0, pitch: 0,   engine: 'sarvam', desc: 'Young Hindi girl voice' },
  'sarvam-suhani':  { name: 'Sarvam Suhani (Hindi, Young)',     lang: 'hi-IN', speaker: 'suhani',  rate: 1.0, pitch: 0,   engine: 'sarvam', desc: 'Young Hindi girl voice' },
  'sarvam-tanya':   { name: 'Sarvam Tanya (Hindi)',             lang: 'hi-IN', speaker: 'tanya',   rate: 1.0, pitch: 0,   engine: 'sarvam', desc: 'Hindi girl voice' },
  'sarvam-shreya':  { name: 'Sarvam Shreya (Hindi)',            lang: 'hi-IN', speaker: 'shreya',  rate: 1.0, pitch: 0,   engine: 'sarvam', desc: 'Hindi girl voice' },
  'sarvam-kavya':   { name: 'Sarvam Kavya (Marathi)',           lang: 'mr-IN', speaker: 'kavya',   rate: 1.0, pitch: 0,   engine: 'sarvam', desc: 'Marathi girl voice' },
  'sarvam-kavitha': { name: 'Sarvam Kavitha (Marathi)',         lang: 'mr-IN', speaker: 'kavitha', rate: 1.0, pitch: 0,   engine: 'sarvam', desc: 'Marathi girl voice' },
  'sarvam-swara':   { name: 'Sarvam Swara (Hindi)',             lang: 'hi-IN', speaker: 'swara',   rate: 1.0, pitch: 0,   engine: 'sarvam', desc: 'Hindi girl voice' },
  'sarvam-roopa':   { name: 'Sarvam Roopa (Hindi)',             lang: 'hi-IN', speaker: 'roopa',   rate: 1.0, pitch: 0,   engine: 'sarvam', desc: 'Hindi girl voice' },
  'sarvam-pooja':   { name: 'Sarvam Pooja (Hindi)',             lang: 'hi-IN', speaker: 'pooja',   rate: 1.0, pitch: 0,   engine: 'sarvam', desc: 'Hindi girl voice' },
};

function base64ToWavBlob(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'audio/wav' });
}

function sarvamProfileOrDefault(profileKey) {
  return SARVAM_PROFILES[profileKey] || SARVAM_PROFILES['sarvam-priya'];
}

// Bulbul v3 supports a small set of params. pitch/loudness are NOT allowed
// (they 400). We gently modulate `pace` and `temperature` to nudge the tone.
function sarvamEmotionParams(emotion) {
  const base = { pace: 1.0, temperature: 0.6 };
  const e = String(emotion || '').toLowerCase();
  if (e.includes('excited') || e.includes('happy') || e.includes('joy')) return { pace: 1.08, temperature: 0.85 };
  if (e.includes('sad'))  return { pace: 0.92, temperature: 0.45 };
  if (e.includes('angry')) return { pace: 1.02, temperature: 0.7 };
  if (e.includes('surprised')) return { pace: 1.05, temperature: 0.8 };
  if (e.includes('calm') || e.includes('sleep')) return { pace: 0.95, temperature: 0.5 };
  return base;
}

// Sarvam Bulbul v3 request body. target_language_code (NOT language_code).
// output_audio_codec 'wav' is returned inside `audios` as base64.
function buildSarvamBody(text, profile, emotion) {
  const p = Object.assign({ pace: 1.0, temperature: 0.6 }, sarvamEmotionParams(emotion));
  return JSON.stringify({
    text: String(text),
    target_language_code: (profile && profile.lang) || 'hi-IN',
    model: 'bulbul:v3',
    speaker: (profile && profile.speaker) || 'priya',
    pace: p.pace,
    temperature: p.temperature,
    speech_sample_rate: 24000,
    output_audio_codec: 'wav',
  });
}

let currentVoiceProfile = 'eleven-arohi';
let edgeTTSAvailable = true;
let kokoroAvailable = true;
let sarvamAvailable = true;

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

const ALL_PROFILES = { ...ELEVEN_PROFILES, ...SARVAM_PROFILES, ...EDGE_TTS_PROFILES, ...KOKORO_PROFILES, ...BROWSER_VOICES };
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
    const isSarvam = profileKey.startsWith('sarvam-');
    const isEdge = profileKey.startsWith('edge-');
    const isKokoro = profileKey.startsWith('kokoro-');
    const emotion = detectEmotion(text);

    // PRIMARY: ElevenLabs premium voice (Arohi's own girl voice) — only when
    // the ElevenLabs profile is the active selection. Uses the modern 2026
    // request shape: POST /v1/text-to-speech/{voice_id} with model_id + output_format
    // (what TextToSpeech.convert() calls under the hood). If the token is out /
    // the plan blocks the voice, we fall back to a natural Edge voice.
    if (isEleven && elevenAvailable && CONFIG.ELEVENLABS_API_KEY && CONFIG.ELEVENLABS_API_KEY.indexOf('YOUR_') !== 0) {
        let elevenErr = '';
        for (const modelId of ELEVEN_MODELS) {
            try {
                const ctrl = new AbortController();
                const tid = setTimeout(() => ctrl.abort(), 12000);
                const res = await fetch(ELEVEN_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'xi-api-key': CONFIG.ELEVENLABS_API_KEY,
                    },
                    body: JSON.stringify({
                        text: clean,
                        model_id: modelId,
                        output_format: ELEVEN_OUTPUT_FORMAT,
                        voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.5 },
                    }),
                    signal: ctrl.signal,
                });
                clearTimeout(tid);
                if (res.ok) {
                    const blob = await res.blob();
                    return playBlob(blob, volCallback);
                }
                // Try to read the detail so we can tell the user the real reason.
                let detail = '';
                try {
                    const j = await res.json();
                    detail = (j && j.detail && (j.detail.status || j.detail.message)) || (j && j.error && j.error.status) || '';
                } catch (e) {}
                if (res.status === 402 && /paid_plan_required|free users|cannot use library/i.test(detail)) {
                    elevenBlockedReason = 'ElevenLabs free plan cannot use library voices via API (paid_plan_required). Upgrade to a paid plan to unlock the Arohi ElevenLabs voice.';
                } else if (res.status === 402 || res.status === 429) {
                    elevenBlockedReason = 'ElevenLabs quota/credits exhausted (HTTP ' + res.status + '). Recharge credits to use the Arohi ElevenLabs voice.';
                } else if (res.status === 401) {
                    elevenBlockedReason = 'ElevenLabs API key invalid (HTTP 401). Check the key in src/config.js.';
                }
                elevenErr = 'HTTP ' + res.status + (detail ? ' (' + detail + ')' : '');
                // 401/402/429 -> no point trying the other model; break out.
                if (res.status === 401 || res.status === 402 || res.status === 429) break;
            } catch (e) {
                elevenErr = e.message;
                break;
            }
        }
        console.warn('[Audio] ElevenLabs unavailable:', elevenErr, '-> falling back to natural Indian voice.');
        elevenAvailable = false;
    }

    // SARVAM AI free Indian girl voices (Bulbul v3).
    // Cloud REST API: POST text, get back { audios: [ base64WAV, ... ] }.
    // Also used as an automatic premium fallback when ElevenLabs is blocked.
    if (isSarvam && sarvamAvailable && CONFIG.SARVAM_API_KEY && CONFIG.SARVAM_API_KEY.indexOf('YOUR_') !== 0) {
        const profile = sarvamProfileOrDefault(profileKey);
        try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 20000);
            const res = await fetch(SARVAM_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-subscription-key': CONFIG.SARVAM_API_KEY,
                },
                body: buildSarvamBody(clean, profile, emotion),
                signal: ctrl.signal,
            });
            clearTimeout(tid);
            if (res.ok) {
                const j = await res.json();
                const b64 = Array.isArray(j.audios) ? j.audios.join('') : '';
                if (b64) return playBlob(base64ToWavBlob(b64), volCallback);
                throw new Error('Sarvam returned no audio');
            }
            throw new Error('HTTP ' + res.status);
        } catch (e) {
            console.warn('[Audio] Sarvam failed:', e.message);
            sarvamAvailable = false;
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

    // Auto Sarvam fallback for the ElevenLabs profile (premium Indian girl
    // voice) when the ElevenLabs key/plan blocks it.
    if (isEleven && sarvamAvailable && CONFIG.SARVAM_API_KEY && CONFIG.SARVAM_API_KEY.indexOf('YOUR_') !== 0) {
        try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 20000);
            const res = await fetch(SARVAM_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-subscription-key': CONFIG.SARVAM_API_KEY,
                },
                body: buildSarvamBody(clean, { lang: 'hi-IN', speaker: 'priya' }, emotion),
                signal: ctrl.signal,
            });
            clearTimeout(tid);
            if (res.ok) {
                const j = await res.json();
                const b64 = Array.isArray(j.audios) ? j.audios.join('') : '';
                if (b64) return playBlob(base64ToWavBlob(b64), volCallback);
            }
        } catch (e) {
            console.warn('[Audio] Sarvam fallback failed:', e.message);
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
    if (SARVAM_PROFILES[profile]) return fetchTTS(text, () => {}, profile);
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

function getElevenBlockedReason() {
    return elevenBlockedReason;
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
    getElevenBlockedReason,
};
