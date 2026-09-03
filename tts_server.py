"""
Chloe AI - Edge TTS Server
Indian teenage girl voices + smooth emotional delivery.
Port: 8881

Fluency-first design:
  - Rate is NEVER modified from the neural baseline (rate modulation is what
    makes neural voices chop / get stuck between words on mixed Hinglish text).
  - Emotion is conveyed via PITCH only, so she sounds expressive but stays
    perfectly fluent and natural.
"""
import asyncio
import io
import json
import edge_tts
from http.server import HTTPServer, BaseHTTPRequestHandler

# Indian teen girl voices (all free via edge-tts, verified available)
VOICES = {
    "neerja": {
        "id": "en-IN-NeerjaExpressiveNeural",
        "name": "Neerja (Indian English, Expressive)",
        "lang": "en-IN",
        "gender": "Female",
        "base_pitch": "+0Hz",
        "desc": "Best for Hinglish - natural teen girl",
    },
    "neerja-classic": {
        "id": "en-IN-NeerjaNeural",
        "name": "Neerja Clear (Indian English)",
        "lang": "en-IN",
        "gender": "Female",
        "base_pitch": "+0Hz",
        "desc": "Clear, calm Indian girl",
    },
    "neerja-teen": {
        "id": "en-IN-NeerjaExpressiveNeural",
        "name": "Neerja Teen (Cute, Delighted)",
        "lang": "en-IN",
        "gender": "Female",
        "base_pitch": "+18Hz",
        "desc": "Younger, brighter - cute excited girl",
    },
    "aarohi": {
        "id": "mr-IN-AarohiNeural",
        "name": "Aarohi (Marathi, Natural Girl)",
        "lang": "mr-IN",
        "gender": "Female",
        "base_pitch": "+0Hz",
        "desc": "Warm, natural Marathi girl",
    },
    "aarohi-teen": {
        "id": "mr-IN-AarohiNeural",
        "name": "Aarohi Teen (Calm, Sweet)",
        "lang": "mr-IN",
        "gender": "Female",
        "base_pitch": "+14Hz",
        "desc": "Softer, sweeter teen girl",
    },
    "pallavi": {
        "id": "ta-IN-PallaviNeural",
        "name": "Pallavi (Tamil, Teen Girl)",
        "lang": "ta-IN",
        "gender": "Female",
        "base_pitch": "+0Hz",
        "desc": "Tamil teenage girl",
    },
    "sapna": {
        "id": "kn-IN-SapnaNeural",
        "name": "Sapna (Kannada, Teen Girl)",
        "lang": "kn-IN",
        "gender": "Female",
        "base_pitch": "+0Hz",
        "desc": "Kannada teenage girl",
    },
    "sobhana": {
        "id": "ml-IN-SobhanaNeural",
        "name": "Sobhana (Malayalam, Teen Girl)",
        "lang": "ml-IN",
        "gender": "Female",
        "base_pitch": "+0Hz",
        "desc": "Malayalam teenage girl",
    },
}

# Emotional modulation - PITCH ONLY (rate stays neutral to keep her fluent).
# Pitching up/down gives her feeling without neural-voice choppiness.
EMOTIONS = {
    "happy":     {"pitch": "+18Hz", "rate": "+0%"},
    "excited":   {"pitch": "+30Hz", "rate": "+0%"},
    "sad":       {"pitch": "-22Hz", "rate": "+0%"},
    "angry":     {"pitch": "+8Hz",  "rate": "+0%"},
    "surprised": {"pitch": "+28Hz", "rate": "+0%"},
    "calm":      {"pitch": "+4Hz",  "rate": "+0%"},
    "funny":     {"pitch": "+16Hz", "rate": "+0%"},
    "neutral":   {"pitch": "+0Hz",  "rate": "+0%"},
}

DEFAULT_VOICE = "neerja"


def clamp(fn):
    # Basic safety for user-supplied strings
    return "".join(c for c in fn if c in "+-0123456789%Hz")


class TTSHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[Edge-TTS] {args[0]}")

    def do_GET(self):
        if self.path == "/v1/voices":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(VOICES).encode())
        elif self.path == "/v1/emotions":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(EMOTIONS).encode())
        elif self.path == "/health":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/v1/audio/speech":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length))
                text = body.get("text", "")
                voice_key = body.get("voice", DEFAULT_VOICE)
                emotion = body.get("emotion", "neutral")
                speed = float(body.get("speed", 1.0))

                voice_info = VOICES.get(voice_key, VOICES[DEFAULT_VOICE])
                voice_id = voice_info["id"]

                # Start from the voice's own base pitch (teen variants are
                # already pitched up for a cuter sound).
                pitch = voice_info.get("base_pitch", "+0Hz")
                rate = "+0%"

                # Merge emotion onto it. Rate stays +0% for smooth fluency.
                emo = EMOTIONS.get(emotion, EMOTIONS["neutral"])
                emo_pitch = clamp(emo["pitch"])
                base = int(pitch.replace("Hz", "").replace("+", "")) if "Hz" in pitch else 0
                bonus = int(emo_pitch.replace("Hz", "").replace("+", "")) if "Hz" in emo_pitch else 0
                merged = base + bonus
                pitch = f"{merged:+d}Hz"

                # speed is intentionally ignored for fluency - neural voices
                # chop when forced faster than their natural rate.

                audio_data = asyncio.get_event_loop().run_until_complete(
                    self.generate_speech(text, voice_id, rate, pitch)
                )

                self.send_response(200)
                self.send_header("Content-Type", "audio/mpeg")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(audio_data)

            except Exception as e:
                print(f"[Edge-TTS] Error: {e}")
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())

        elif self.path == "/v1/voices":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(VOICES).encode())

        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    async def generate_speech(self, text, voice_id, rate, pitch):
        communicate = edge_tts.Communicate(text, voice_id, rate=rate, pitch=pitch)
        buf = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buf.write(chunk["data"])
        return buf.getvalue()


if __name__ == "__main__":
    PORT = 8881
    server = HTTPServer(("127.0.0.1", PORT), TTSHandler)
    print(f"[Edge-TTS] Server running on http://127.0.0.1:{PORT}")
    print(f"[Edge-TTS] Voices: {', '.join(VOICES.keys())}")
    print(f"[Edge-TTS] Emotional modulation: {', '.join(EMOTIONS.keys())}")
    server.serve_forever()
