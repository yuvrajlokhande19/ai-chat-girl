# AI Chat Girl - Session 1 Summary

## Project Location
`C:\Users\lokha\Downloads\Ai Chat girl`

## What Works
- Full VRM avatar loading with Three.js + @pixiv/three-vrm
- Ollama streaming chat (gemma4:latest)
- TTS with Kokoro-82M + Web Speech API fallback
- Wake modal, chat drawer, top controls
- Blinking, head tracking, dance animation
- Multiple motion gestures (wave, nod, laugh, etc.)
- Background image, zoom, VRM file upload
- Desktop launcher (Chloe AI shortcut)
- GitHub repo: https://github.com/yuvrajlokhande19/ai-chat-girl

## ACTIVE ISSUE: Y-Shape Arm Pose (Arms Stuck UP)

### What We Tried (All Failed)
1. **Direct rotation on load** — `vrm.update()` overwrites every frame → T-pose
2. **resetNormalizedPose()** — resets to T-pose bind pose → T-pose
3. **Save/restore base pose** — saved T-pose, restored T-pose → T-pose
4. **Apply A-pose every frame** — set `leftUpperArm.rotation.z = -1.0` → arms go UP (Y-shape)
5. **Opposite signs** — `leftUpperArm.rotation.z = 1.0` → still T-pose or Y-shape
6. **Target-based lerp system** — targets set every frame, lerped → still Y-shape

### Root Cause Analysis
- **T-pose:** `vrm.update(dt)` overwrites manual rotations every frame with default bind pose
- **Y-shape:** The Z-axis rotation signs are REVERSED from what we expect
  - `leftUpperArm.rotation.z = -1.0` → arm goes UP instead of DOWN
  - `rightUpperArm.rotation.z = 1.0` → arm goes UP instead of DOWN
  - The VRM normalized bone coordinate system is different from our assumptions

### What We Know
- 54 bones found in the VRM model
- Default rotation is `(0, 0, 0)` with quaternion `(0, 0, 0, 1)`
- `getNormalizedBoneNode('leftUpperArm')` exists and returns a valid Object3D
- Setting rotation DOES work (we see Y-shape), just wrong direction
- The scene is rotated 180° (`vrm.scene.rotation.y = Math.PI`) which may affect coordinate system

### Next Steps to Try
1. **Try X-axis rotation** instead of Z-axis — maybe the arms need rotation around a different axis
2. **Remove `vrm.scene.rotation.y = Math.PI`** — the 180° scene rotation may be flipping the coordinate system
3. **Use `getRawBoneNode()`** instead of `getNormalizedBoneNode()` — may have different coordinate system
4. **Load a Mixamo idle animation** (.glb) — bypass manual bone manipulation entirely
5. **Check VRM version** — VRM 0.x vs 1.x have different coordinate conventions
6. **Use `vrm.humanoid.getNormalizedBoneNode('leftUpperArm').rotation`** with Euler order changes

## Current Code Architecture
- `src/vrmManager.js` — 3D engine, VRM loading, pose, idle, dance
- `src/main.js` — App orchestrator, event listeners, chat flow
- `src/ollamaService.js` — Ollama streaming API
- `src/audioService.js` — STT + TTS + lip sync
- `index.html` — UI with modal, controls, chat drawer
- `public/GIRL1.vrm` — Avatar model file

## Commands
- Start: `npm run dev` (Vite on port 3000)
- Build: `npm run build`
- Ollama: `ollama serve` (port 11434)
- TTS: Kokoro on port 8880 (optional)
