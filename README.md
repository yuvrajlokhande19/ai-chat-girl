# 🌸 Chloe AI - Your Indian Teen AI Companion

<div align="center">

![Chloe AI Banner](https://img.shields.io/badge/Chloe_AI-v2.0-pink?style=for-the-badge&logo=heart)
![Status](https://img.shields.io/badge/Status-Active-success?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Web-lightgrey?style=for-the-badge)

**A local, offline 3D VRM AI Avatar with Hinglish voice, glass-morphism UI, and autonomous personality**

[🚀 Quick Start](#-quick-start) • [✨ Features](#-features) • [🎙️ Voices](#-voice-engine--voices) • [⚙️ Configuration](#️-configuration) • [📸 Screenshots](#-screenshots)

</div>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎭 **3D VRM Avatar** | Load any `.vrm` model with Three.js + @pixiv/three-vrm |
| 💬 **AI Chat** | Local Ollama (gemma2:2b / gemma4:latest) with streaming |
| 🗣️ **Hinglish Voice** | Edge TTS (Microsoft Neural) + Kokoro + Browser fallback |
| 🎭 **Expressions** | Real-time blink, mouth sync, emotion from text |
| 🤸 **Animations** | Idle breathing, hair touch, weight shift, look around, dance |
| 🎨 **Glass Morphism UI** | Modern glass-morphism with blur, gradients, dark/light mode |
| 🖼️ **Backgrounds** | Solid color, image URL, or file upload |
| 🤖 **Autonomous Chat** | Chloe speaks every 30-120s in Hinglish |
| 🧠 **Smart Expressions** | Auto-detects emotion from text (happy/sad/angry/surprised) |
| 🎮 **Controls** | Zoom, dance, VRM hot-swap, mouse look-at (proximity-based) |

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+**
- **Ollama** installed and running

### Installation
```bash
# Clone the repo
git clone https://github.com/yuvrajlokhande19/ai-chat-girl.git
cd ai-chat-girl

# Install dependencies
npm install

# Pull AI model (one-time)
ollama pull gemma2:2b

# Start development server
npm run dev
```

### Desktop Launcher
Double-click `Chloe AI.lnk` on your desktop for a terminal menu:
```
┌─────────────────────────────────────┐
│         CHLOE AI LAUNCHER           │
├─────────────────────────────────────┤
│  O - Open in Browser                │
│  R - Restart Server                 │
│  S - Stop Server                    │
│  M - Model Setup                    │
│  C - Check Status                   │
│  Q - Quit                           │
└─────────────────────────────────────┘
```

---

## 🎙️ Voice Engine & Voices

Chloe supports **3 TTS engines** with **20+ Indian female voices**:

### 🔥 Edge TTS (Microsoft Neural) - **Best Quality**
| Voice | Locale | Style | Best For |
|-------|--------|-------|----------|
| **Neerja Expressive** | en-IN | Emotional, natural | **Default - Best overall** |
| **Neerja** | en-IN | Warm, friendly | Daily chat |
| **Prabhat** | en-IN | Male | Alternative |
| **Swara** | hi-IN | Pure Hindi female | Pure Hindi |
| **Madhur** | hi-IN | Hindi male | Hindi content |
| **Tanishaa** | bn-IN | Bengali female | Bengali |
| **Dhwani** | gu-IN | Gujarati female | Gujarati |
| **Sapna** | kn-IN | Kannada female | Kannada |
| **Sobhana** | ml-IN | Malayalam female | Malayalam |
| **Aarohi** | mr-IN | Marathi female | Marathi |
| **Pallavi** | ta-IN | Tamil female | Tamil |
| **Shruti** | te-IN | Telugu female | Telugu |
| **Gul** | ur-IN | Urdu female | Urdu |

### 🤖 Kokoro (Local, Fast) - 82M params
| Voice | Style |
|-------|-------|
| Bella | Teen, young |
| Heart | Warm, natural |
| Sky | Cute, high pitch |
| Nova | Bright, energetic |

### 🌐 Browser Fallback
- Uses system SpeechSynthesis
- Auto-detects best female voice

---

## 🎯 Voice Testing

**Built-in voice tester in the 3-dot menu:**
1. Click **⋮** (top-left) → Voice section
2. Select **Engine** (Edge/Kokoro/Browser)
3. Pick a **Voice** from the dropdown
4. Type custom text or use default: *"Hello, am Sia! Main aapke liye kya karu?"*
4. Click **▶ Play Sample** to hear instantly

---

## 🌸 Hinglish Auto-Chat

Chloe speaks autonomously every 30-120 seconds:
```
"Arre, abhi time itna ho gaya? 😮"
"Kya kar rahe ho abhi? Batao na 🤔"
"Bored ho rahi thi... bolo kuch 😴"
"Chai peene ka mann kar raha hai ☕"
"Mujhe dance karna hai! 💃"
```

---

## ⚙️ Configuration

### Ollama Models
Edit `config/Modelfile`:
```dockerfile
FROM gemma2:2b
# Or: FROM gemma4:latest
```

### Voice Profiles (in `src/audioService.js`)
```javascript
// Add custom voices
EDGE_VOICES['my-custom'] = {
  name: 'Custom Voice',
  voice: 'en-IN-CustomNeural',
  lang: 'en-IN',
  gender: 'Female',
  desc: 'My custom voice'
};
```

---

## 📸 Screenshots

<div align="center">

### Main Interface
![Main Interface](https://via.placeholder.com/800x450/0f172a/22d3ee?text=Main+Interface+with+Glass+UI)

### Voice Selection Menu
![Voice Menu](https://via.placeholder.com/400x500/0f172a/ec4899?text=Voice+Selection+Menu)

### Chat Widget
![Chat Widget](https://via.placeholder.com/400x500/0f172a/8b5cf6?text=Hinglish+Chat+Widget)

### Three-Dot Menu
![Settings Menu](https://via.placeholder.com/300x500/0f172a/f97316?text=Settings+Menu)

</div>

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **3D** | Three.js r158, @pixiv/three-vrm 3.5 |
| **AI** | Ollama (gemma2:2b / gemma4:latest) |
| **TTS** | Edge TTS (Microsoft Neural), Kokoro-82M, Browser SpeechSynthesis |
| **STT** | Web Speech API (WebkitSpeechRecognition) |
| **UI** | Glass Morphism CSS, Inter + Poppins fonts |
| **Build** | Vite 5, ES Modules |

---

## 📁 Project Structure

```
ai-chat-girl/
├── index.html              # Main UI with glass morphism
├── package.json            # Dependencies & scripts
├── vite.config.js          # Vite config
├── config/
│   └── Modelfile           # Ollama model config
├── public/
│   └── GIRL1.vrm           # Default avatar
├── src/
│   ├── main.js             # App orchestrator
│   ├── vrmManager.js       # 3D engine, VRM, animations
│   ├── ollamaService.js    # Ollama streaming client
│   └── audioService.js     # TTS (Edge/Kokoro/Browser)
├── launchers/
│   ├── Launch Chloe.bat    # Windows launcher
│   └── launcher.ps1        # PowerShell menu
└── README.md
```

---

## 🎮 Controls

| Action | Key/Click |
|--------|-----------|
| **Zoom** | Mouse wheel / +/- buttons |
| **Look at cursor** | Move mouse near avatar (proximity-based) |
| **Dance** | Click 💃 Dance button |
| **Voice input** | Click 🎤 mic button |
| **Send message** | Enter key / Send button |
| **Open menu** | Click ⋮ (top-left) |
| **Close menu** | Click outside / Esc |

---

## 🤝 Contributing

1. Fork the repo
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit: `git commit -m 'Add amazing feature'`
4. Push: `git push origin feature/amazing-feature`
5. Open Pull Request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **@pixiv/three-vrm** - VRM loading & animation
- **Microsoft Edge TTS** - Neural Indian voices
- **Kokoro TTS** - 82M parameter local TTS
- **Ollama** - Local LLM inference
- **Three.js** - 3D rendering
- **VRoid Studio** - Avatar creation

---

<div align="center">

**Made with 💖 for the Indian AI community**

[⬆ Back to Top](#-chloe-ai---your-indian-teen-ai-companion)

</div>