"""
Chloe AI - Edge TTS Server
Natural Indian girl voices + emotion-based voice modulation.
Port: 8881
"""
import asyncio
import io
import json
import edge_tts
from http.server import HTTPServer, BaseHTTPRequestHandler

# Indian female / teen voices (all free via edge-tts)
VOICES = {
    "swara": {
        "id": "hi-IN-SwaraNeural",
        "name": "Swara (Hindi, Natural Girl)",
        "lang": "hi-IN",
        "gender": "Female",
        "base_pitch": "+0Hz",
        "base_rate": "+0%",
    },
    "neerja": {
        "id": "en-IN-NeerjaExpressiveNeural",
        "name": "Neerja (Indian English, Expressive)",
        "lang": "en-IN",
        "gender": "Female",
        "base_pitch": "+0Hz",
        "base_rate": "+0%",
    },
    "neerja-classic": {
        "id": "en-IN-NeerjaNeural",
        "name": "Neerja (Indian English, Clear)",
        "lang": "en-IN",
        "gender": "Female",
        "base_pitch": "+0Hz",
        "base_rate": "+0%",
    },
    "madhur": {
        "id": "hi-IN-MadhurNeural",
        "name": "Madhur (Hindi, Male)",
        "lang": "hi-IN",
        "gender": "Male",
        "base_pitch": "+0Hz",
        "base_rate": "+0%",
    },
    "arohi": {
        "id": "mr-IN-AarohiNeural",
        "name": "Aarohi (Marathi, Female)",
        "lang": "mr-IN",
        "gender": "Female",
        "base_pitch": "+0Hz",
        "base_rate": "+0%",
    },
    "dhwani": {
        "id": "gu-IN-DhwaniNeural",
        "name": "Dhwani (Gujarati, Female)",
        "lang": "gu-IN",
        "gender": "Female",
        "base_pitch": "+0Hz",
        "base_rate": "+0%",
    },
    "shruti": {
        "id": "te-IN-ShrutiNeural",
        "name": "Shruti (Telugu, Female)",
        "lang": "te-IN",
        "gender": "Female",
        "base_pitch": "+0Hz",
        "base_rate": "+0%",
    },
    "tanishaa": {
        "id": "bn-IN-TanishaaNeural",
        "name": "Tanishaa (Bengali, Female)",
        "lang": "bn-IN",
        "gender": "Female",
        "base_pitch": "+0Hz",
        "base_rate": "+0%",
    },
}

# Emotional modulation presets - change pitch/rate so she SOUNDS emotional
EMOTIONS = {
    "happy":     {"pitch": "+25Hz", "rate": "+15%"},
    "excited":   {"pitch": "+40Hz", "rate": "+22%"},
    "sad":       {"pitch": "-20Hz", "rate": "-10%"},
    "angry":     {"pitch": "+10Hz", "rate": "+8%"},
    "surprised": {"pitch": "+35Hz", "rate": "+12%"},
    "calm":      {"pitch": "+0Hz",  "rate": "-5%"},
    "funny":     {"pitch": "+20Hz", "rate": "+10%"},
    "neutral":   {"pitch": "+0Hz",  "rate": "+0%"},
}

DEFAULT_VOICE = "swara"


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

                # Start from the voice's base pitch/rate, then apply emotion
                pitch = voice_info.get("base_pitch", "+0Hz")
                rate = voice_info.get("base_rate", "+0%")

                emo = EMOTIONS.get(emotion, EMOTIONS["neutral"])
                pitch = clamp(emo["pitch"])
                rate = clamp(emo["rate"])

                # Apply additional user speed on top of emotion rate
                if speed > 1:
                    rate = f"+{int((speed - 1) * 100)}%"
                elif speed < 1:
                    rate = f"{int((speed - 1) * 100)}%"

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
