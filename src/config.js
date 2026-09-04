// config.js — real API keys (gitignored, repo is private).
// Regenerate/rotate these if they are ever exposed publicly.

const CONFIG = {
  // Google Gemini API key (default AI model).
  GEMINI_API_KEY: "AQ.Ab8RN6IB51ZhRn1eql7XnV50n8MoMmg3VTbwkuDHoBEkihQPwg",

  // Google Search grounding. DEFAULT OFF: on free tiers this returns HTTP 429
  // (quota exhausted) because grounding requires a paid tier. Turn on only if
  // your account allows it (then Arohi can search the internet).
  GEMINI_GOOGLE_SEARCH: false,

  // ElevenLabs text-to-speech.
  ELEVENLABS_API_KEY: "sk_b399e8b54a54ecbcc7556b0751f43043a50e6a28a5b62227",
  ELEVENLABS_VOICE_ID: "9SsFrOutdZkCkU5hIoQm",

  // Sarvam AI text-to-speech (free Indian girl voices, Bulbul v3).
  SARVAM_API_KEY: "sk_65ctj1k8_d5e06n8oIqmXUifIpXPRqNkL",
};

export default CONFIG;
