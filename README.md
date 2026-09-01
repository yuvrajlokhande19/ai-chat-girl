# Chloe - AI Chat Girl

A local, offline 3D VRM AI Avatar web app with voice interaction, lip sync, dance animations, and natural idle movements.

## Features

- **3D VRM Avatar** — Load any VRM model with Three.js + @pixiv/three-vrm
- **AI Chat** — Local Ollama integration (gemma4:latest) with streaming responses
- **Voice Interaction** — Web Speech API for speech-to-text
- **Text-to-Speech** — Kokoro-82M TTS with browser fallback
- **Lip Sync** — Web Audio AnalyserNode for viseme-based mouth animation
- **Idle Animations** — Breathing, blinking, head movements, arm sway
- **Dance Mode** — Full body dance animation
- **Motion Gestures** — Wave, nod, laugh, think, shrug, tilt head, surprise, blow kiss, bow, stretch, point
- **Background Customization** — Color picker and image URL support
- **VRM Hot-Swap** — Drag-and-drop or file upload to change avatar
- **Zoom Controls** — Mouse wheel and touch pinch zoom
- **Desktop Launcher** — Windows shortcut with terminal menu (Open/Restart/Stop/Model Setup/Status/Quit)

## Tech Stack

- **Frontend:** Vite 8.2.2, Three.js 0.185.1, @pixiv/three-vrm 3.5.5, Tailwind CDN
- **AI:** Ollama (gemma4:latest)
- **TTS:** Kokoro-82M (port 8880) + Web Speech API fallback
- **STT:** Web Speech API
- **Platform:** Windows, Node.js

## Quick Start

### Prerequisites
- Node.js 18+
- Ollama installed and running

### Setup
```bash
# Install dependencies
npm install

# Pull the AI model
ollama pull gemma4:latest

# Start the dev server
npm run dev
```

### Desktop Launcher
Double-click `Chloe AI.lnk` on your desktop for a terminal menu with options to:
- Open the app in browser
- Restart the dev server
- Stop the server
- Set up the Ollama model
- Check service status
- Open browser manually
- Quit

## Project Structure

```
Ai Chat girl/
├── index.html              # Main UI with modal, controls, chat drawer
├── package.json            # Dependencies and scripts
├── vite.config.js          # Vite configuration
├── config/
│   └── Modelfile           # Ollama model config (FROM gemma4:latest)
├── public/
│   └── GIRL1.vrm           # Avatar model file
├── src/
│   ├── main.js             # App orchestrator, event listeners, chat flow
│   ├── vrmManager.js       # 3D engine, VRM loading, pose, idle, dance
│   ├── ollamaService.js    # Ollama streaming API client
│   └── audioService.js     # STT + TTS + lip sync audio analyser
├── Launch Chloe.bat        # Desktop batch launcher
├── launcher.ps1            # PowerShell terminal menu
├── start-services.ps1      # Start Ollama + Kokoro services
└── SESSION-1-SUMMARY.md    # Development session notes
```

## Configuration

### Ollama Model
- Default model: `gemma4:latest` (9.6 GB)
- Config file: `config/Modelfile`
- API endpoint: `http://localhost:11434`

### TTS (Optional)
- Kokoro-82M runs on port 8880
- Browser SpeechSynthesis fallback with female voice (pitch 1.3, rate 1.05)
- Preferred voices: Zira, Samantha, Victoria, Google UK English Female

### VRM Models
- Default: `public/GIRL1.vrm`
- Supports drag-and-drop hot-swap at runtime
- Any VRM 0.x or 1.x compatible model

## Controls

- **Mouse drag** — Rotate head tracking
- **Mouse wheel** — Zoom in/out
- **Touch pinch** — Mobile zoom
- **Dance button** — Trigger 6-second dance animation
- **Chat drawer** — Type or use microphone
- **Background picker** — Change background color
- **Background URL** — Load custom background image
- **Upload VRM** — Change avatar model

## Known Issues

- VRM avatar stuck in T-pose/Y-pose (see SESSION-1-SUMMARY.md for investigation notes)
- Arms rotate upward instead of downward when applying Z-axis rotations
- VRM normalized bone coordinate system may differ from expected conventions

## License

MIT
