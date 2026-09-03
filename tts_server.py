"""
Chloe AI - Edge TTS Server
Provides natural Hindi/English female voices via HTTP API.
Port: 8881
"""
import asyncio
import io
import json
import edge_tts
from http.server import HTTPServer, BaseHTTPRequestHandler

VOICES = {
    "swara": {"id": "hi-IN-SwaraNeural", "name": "Swara (Hindi, Natural)", "lang": "hi-IN", "gender": "Female"},
    "madhur": {"id": "hi-IN-MadhurNeural", "name": "Madhur (Hindi, Male)", "lang": "hi-IN", "gender": "Male"},
}

DEFAULT_VOICE = "swara"


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
                speed = body.get("speed", 1.0)

                voice_info = VOICES.get(voice_key, VOICES[DEFAULT_VOICE])
                voice_id = voice_info["id"]

                rate_str = f"+{int((speed - 1) * 100)}%" if speed >= 1 else f"{int((speed - 1) * 100)}%"

                audio_data = asyncio.get_event_loop().run_until_complete(
                    self.generate_speech(text, voice_id, rate_str)
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

    async def generate_speech(self, text, voice_id, rate):
        communicate = edge_tts.Communicate(text, voice_id, rate=rate)
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
    server.serve_forever()
