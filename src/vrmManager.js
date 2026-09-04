import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';

// ────────────────────────────────────────────────────────────
//  STATE
// ────────────────────────────────────────────────────────────
let scene, camera, renderer, currentVRM, clock, container;
let mixer = null; // THREE.AnimationMixer — drives ALL bone motion
let cameraDistance = 1.8, targetDistance = 1.8;
let cameraY = 1.5, targetCameraY = 1.5;
let isZooming = false, zoomCooldown = 0;

// Blinking (driven via VRM expression manager, not bones)
const blink = { timer: 0, next: 3, val: 0, phase: 'open' };

// Facial expressions (VRM expression manager)
let expressionState = { happy: 0, sad: 0, angry: 0, surprised: 0, relaxed: 0 };

// Animation actions
let idleAction = null;   // always-playing idle loop
let talkAction = null;   // talking head-bob loop
let gestureAction = null; // current one-shot gesture
let isTalking = false;
let gestureTimeout = null; // timeout for mocap gesture playback

// Slow-drifting fog/cloud layer (decorative, behind the avatar).
let cloudSprites = [];

// ────────────────────────────────────────────────────────────
//  QUATERNION CLIP HELPERS
//  All bone rotations are stored as quaternions and interpolated
//  via SLERP — no Euler gimbal lock, no per-frame bone math.
// ────────────────────────────────────────────────────────────

function qEuler(x, y, z) {
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(x || 0, y || 0, z || 0));
}

// ────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────
//  BASE PROCEDURAL CLIPS (ONLY idle + talk)
//  These two are not "poses" — they keep her alive & natural at all times
//  (soft breathing, standing stance, talking head-bob) and are the ONLY
//  hand-authored clips in the project. ALL poses/gestures come from real
//  recorded motion-capture (.vrma) files below.
// ────────────────────────────────────────────────────────────
// Neutral arms-down euler offsets used to keep the bind-pose T-pose away.
const L_UA = [0, 0.05, 1.35];   // leftUpperArm  euler
const R_UA = [0, -0.05, -1.35]; // rightUpperArm
const L_LA = [0, 0, -0.25];     // leftLowerArm  (elbow bend)
const R_LA = [0, 0, 0.25];      // rightLowerArm
const L_H  = [0, -0.08, 0.25];  // leftHand
const R_H  = [0, 0.08, -0.15];  // rightHand

const CLIPS = {};

// ────────────────────────────────────────────────────────────
//  MOTION LIBRARY (.vrma) — real recorded human motion ONLY.
//  Sources (no duplicates, checked by file hash):
//    * semperai/amica official VRoid motions (dance, greeting, peace, ...)
//    * tk256ailab/vrm-viewer official emotion clips (Angry..Thinking)
//    * Sunwood-ai-labs/sakaki-tesshin-vrm corrected 10-motion conversation pack
//    * flarom/figure authored idle + walk
//    * not-elm/desktop-homunculus maid idles + grabbed
//  Each pose name = what the recorded motion actually looks like.
// ────────────────────────────────────────────────────────────
const MOCAP_FILES = {
    // — Amica / VRoid Project pack (big distinct moves) —
    'dance':          'amica_dance.vrma',
    'greeting':       'amica_greeting.vrma',      // cheery double-handwave greeting
    'wave_both':      'amica_greeting.vrma',
    'peace':          'amica_peaceSign.vrma',     // peace / victory sign
    'victory':        'amica_peaceSign.vrma',
    'shoot':          'amica_shoot.vrma',         // finger gun
    'spin':           'amica_spin.vrma',          // spin around
    'squat':          'amica_squat.vrma',         // squat down
    'model_pose':     'amica_modelPose.vrma',     // model show-off
    'show_body':      'amica_showFullBody.vrma',  // show off full body
    'idle':           'amica_idle_loop.vrma',     // natural idle loop

    // — tk256ailab/vrm-viewer emotion set (each file = its own emotion) —
    'angry':          'Angry.vrma',
    'blush':          'Blush.vrma',               // shy blush
    'clap':           'Clapping.vrma',            // clapping hands (they meet)
    'cheer':          'Clapping.vrma',
    'wave_hi':        'Goodbye.vrma',             // single-hand goodbye wave = "hi"
    'jump':           'Jump.vrma',
    'look_around':    'LookAround.vrma',
    'relax':          'Relax.vrma',               // relaxed / calm
    'calm':           'Relax.vrma',
    'sad':            'Sad.vrma',
    'tilt_head':      'Sad.vrma',
    'sleepy':         'Sleepy.vrma',
    'surprised':      'Surprised.vrma',
    'surprise':       'Surprised.vrma',
    'think':          'Thinking.vrma',            // hand-on-chin thinking

    // — sakaki-tesshin conversation / idle pack —
    'observe':        'observe.vrma',
    'accuse':         'accuse.vrma',
    'deny':           'deny.vrma',
    'idle_breathe':   'idle_breathe.vrma',
    'idle_listen':    'idle_listen.vrma',
    'idle_suspicion': 'idle_suspicion.vrma',
    'talk_calm':      'talk_calm.vrma',
    'talk_whisper':   'talk_whisper.vrma',
    'talk_press':     'talk_press.vrma',

    // — flarom/figure —
    'walk':           'walk.vrma',
    'idle_flarom':    'idle_flarom.vrma',

    // — desktop-homunculus —
    'grabbed':        'grabbed.vrma',
    'idle_maid':      'idle_maid.vrma',
    'idle_sitting':   'idle_sitting.vrma',
};

// Store loaded mocap AnimationClips after the VRM is ready
let mocapClips = {};

function loadMocapClips(vrm) {
    const animationLoader = new GLTFLoader();
    animationLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));

    const targets = new Set(Object.values(MOCAP_FILES));
    for (const file of targets) {
        animationLoader.load(
            'animations/' + file,
            async (gltf) => {
                try {
                    const anim = gltf.userData.vrmAnimations[0];
                    if (!anim) return;
                    const clip = createVRMAnimationClip(anim, vrm);
                    // Map every gesture that uses this file to this clip
                    for (const name in MOCAP_FILES) {
                        if (MOCAP_FILES[name] === file) mocapClips[name] = clip;
                    }
                } catch (e) {
                    console.warn('[VRM] mocap failed for', file, e.message);
                }
            },
            undefined,
            (err) => console.warn('[VRM] mocap load error', file)
        );
    }
}

// Safely get a bone's THREE.js Object3D name from the VRM humanoid.
// Returns null if the bone doesn't exist in this model.
function bn(vrm, name) {
    const node = vrm.humanoid.getNormalizedBoneNode(name);
    return node ? node.name : null;
}

function buildClipsFromVRM(vrm) {
    // Helper: create a quaternion track using the VRM's actual bone name
    function qt(boneKey, keyframes) {
        const name = bn(vrm, boneKey);
        if (!name) return null; // bone not in this model
        const times = [], values = [];
        for (const [t, x, y, z] of keyframes) {
            times.push(t);
            const q = qEuler(x, y, z);
            values.push(q.x, q.y, q.z, q.w);
        }
        return new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, values);
    }
    function st(boneKey, keyframes) {
        const name = bn(vrm, boneKey);
        if (!name) return null;
        const times = [], values = [];
        for (const [t, x, y, z] of keyframes) {
            times.push(t);
            values.push(x ?? 1, y ?? 1, z ?? 1);
        }
        return new THREE.VectorKeyframeTrack(name + '.scale', times, values);
    }
    function pack(tracks) { return tracks.filter(Boolean); }

    // ── IDLE BREATHING (4 s loop) ─────────────────────────
    // Natural standing stance — arms relaxed at the sides with a gentle bend,
    // hands slightly forward/curled, soft breathing sway. NEVER a T-pose.
    CLIPS.idle = new THREE.AnimationClip('idle', 4, pack([
        qt('leftUpperArm',  [[0,...L_UA], [1.3, 0.015,0.05,1.34], [2.6,...L_UA], [4,...L_UA]]),
        qt('rightUpperArm', [[0,...R_UA], [1.3,-0.015,-0.05,-1.34],[2.6,...R_UA],[4,...R_UA]]),
        qt('leftLowerArm',  [[0,...L_LA], [1.3, 0.02,0,-0.18], [2.6,...L_LA], [4,...L_LA]]),
        qt('rightLowerArm', [[0,...R_LA], [1.3,-0.02,0, 0.18], [2.6,...R_LA], [4,...R_LA]]),
        qt('leftHand',      [[0,...L_H],  [1.3, 0, -0.08, 0.28], [2.6,...L_H], [4,...L_H]]),
        qt('rightHand',     [[0,...R_H],  [1.3, 0,  0.08,-0.17], [2.6,...R_H], [4,...R_H]]),
        st('chest',      [[0,1,1,1],[2,1.03,1.03,1.03],[4,1,1,1]]),
        st('upperChest', [[0,1,1,1],[2,1.03,1.03,1.03],[4,1,1,1]]),
        qt('chest',      [[0,0,0,0],[2,0.006,0,0],[4,0,0,0]]),
        qt('head', [[0,0,0,0],[1.5,0,0.02,0],[3,0,-0.02,0],[4,0,0,0]]),
        qt('neck', [[0,0,0,0],[2,0,0.008,0],[4,0,0,0]]),
        qt('spine', [[0,0,0,0],[2,0.005,0,0],[4,0,0,0]]),
        qt('hips', [[0,0,0,0],[1.3,0,0.006,0],[2.6,0,-0.006,0],[4,0,0,0]]),
        qt('leftShoulder',  [[0,0,0,0],[4,0,0,0]]),
        qt('rightShoulder', [[0,0,0,0],[4,0,0,0]]),
    ]));

    // ── TALKING HEAD BOB (1.5 s loop) ─────────────────────
    CLIPS.talk = new THREE.AnimationClip('talk', 1.5, pack([
        qt('head', [[0, 0.03,0,0],[0.4,-0.02,0.015,0],[0.8,0.015,-0.01,0],[1.2,-0.01,0.01,0],[1.5,0.03,0,0]]),
        qt('neck', [[0,0,0.008,0],[0.75,0,-0.008,0],[1.5,0,0.008,0]]),
        qt('spine', [[0,0,0,0.008],[0.75,0,0,-0.008],[1.5,0,0,0.008]]),
        qt('leftHand',  [[0,...L_H],[0.5,0,-0.08,0.27],[1,0,-0.08,0.24],[1.5,...L_H]]),
        qt('rightHand', [[0,...R_H],[0.5,0,0.08,-0.16],[1,0,0.08,-0.13],[1.5,...R_H]]),
    ]));

    // NOTE: All POSE / GESTURE clips come from recorded .vrma motion files
    // (MOCAP_FILES). No hand-authored arm choreography exists in the project —
    // that was the source of the "hands behind the back" artifacts.

    console.log('[VRM] Clips built:', Object.keys(CLIPS));
}

// ────────────────────────────────────────────────────────────
//  POSE REGISTRY & MATCHING
// ────────────────────────────────────────────────────────────
// 'cat' groups options in the three-dot menu. Primary/hero poses are listed
// first so the most-used motions (Happy, Greeting, Thinking, Dance) are easy
// to find and visually distinct.
// Every pose below maps 1:1 to a real recorded .vrma motion file (MOCAP_FILES)
// and its name = what that recording actually does. 'cat' groups options in the
// three-dot menu into separate sections.
const POSES = {
    // —— Greetings & Waves ——
    'wave_hi':       { label: 'Hi Wave',           emotion: 'happy',     desc: 'Single-hand hello wave',  cat: 'Greetings' },
    'greeting':      { label: 'Greeting',          emotion: 'excited',   desc: 'Cheery two-hand greeting',cat: 'Greetings' },
    'peace':         { label: 'Peace Sign',        emotion: 'happy',     desc: 'Peace / victory sign ✌️',  cat: 'Greetings' },

    // —— Emotions ——
    'clap':          { label: 'Clap / Cheer',      emotion: 'excited',   desc: 'Clapping hands',           cat: 'Emotions' },
    'jump':          { label: 'Jump',              emotion: 'excited',   desc: 'Little jump',              cat: 'Emotions' },
    'surprised':     { label: 'Surprised',         emotion: 'surprised', desc: 'Surprised reaction',       cat: 'Emotions' },
    'blush':         { label: 'Blush / Shy',       emotion: 'excited',   desc: 'Shy blush',                cat: 'Emotions' },
    'angry':         { label: 'Angry',             emotion: 'angry',     desc: 'Cross angry',              cat: 'Emotions' },
    'sad':           { label: 'Sad',               emotion: 'sad',       desc: 'Sad / soft pose',          cat: 'Emotions' },
    'sleepy':        { label: 'Sleepy',            emotion: 'sleepy',    desc: 'Sleepy / tired',           cat: 'Emotions' },
    'relax':         { label: 'Relaxed',           emotion: 'relaxed',   desc: 'Calm relaxed stance',      cat: 'Emotions' },

    // —— Thinking & Talk ——
    'think':         { label: 'Thinking',          emotion: 'neutral',   desc: 'Hand-on-chin thinking',    cat: 'Thinking' },
    'look_around':   { label: 'Look Around',       emotion: 'neutral',   desc: 'Looking around',           cat: 'Thinking' },
    'talk_calm':     { label: 'Talk Calm',         emotion: 'calm',      desc: 'Calm talking motion',      cat: 'Thinking' },
    'talk_whisper':  { label: 'Talk Whisper',      emotion: 'calm',      desc: 'Quiet whisper motion',     cat: 'Thinking' },
    'talk_press':    { label: 'Talk Press',        emotion: 'excited',   desc: 'Press a point',            cat: 'Thinking' },

    // —— Idle Breathe & Listen ——
    'idle_breathe':  { label: 'Idle Breathe',      emotion: 'calm',      desc: 'Natural breathing idle',   cat: 'Idle' },
    'idle_listen':   { label: 'Idle Listen',       emotion: 'calm',      desc: 'Listening attention',      cat: 'Idle' },
    'idle_suspicion':{ label: 'Idle Suspicion',    emotion: 'neutral',   desc: 'Quiet suspicion',          cat: 'Idle' },
    'idle_maid':     { label: 'Idle Maid',         emotion: 'relaxed',   desc: 'Maiden standing idle',     cat: 'Idle' },
    'idle_sitting':  { label: 'Idle Sitting',      emotion: 'relaxed',   desc: 'Seated idle',              cat: 'Idle' },
    'idle_flarom':   { label: 'Idle Gentle',       emotion: 'relaxed',   desc: 'Gentle idle sway',         cat: 'Idle' },

    // —— Scene Poses ——
    'observe':       { label: 'Observe',           emotion: 'neutral',   desc: 'Watchful observing',       cat: 'Scene' },
    'accuse':        { label: 'Accuse',            emotion: 'angry',     desc: 'Pointing accusation',      cat: 'Scene' },
    'deny':          { label: 'Deny',              emotion: 'neutral',   desc: 'Hands-up denial',          cat: 'Scene' },
    'grabbed':       { label: 'Grabbed',           emotion: 'surprised', desc: 'Caught / grabbed',         cat: 'Scene' },

    // —— Moves & Dance ——
    'dance':         { label: 'Dance',             emotion: 'excited',   desc: 'Real dance',               cat: 'Moves' },
    'walk':          { label: 'Walk',              emotion: 'neutral',   desc: 'Walk cycle',               cat: 'Moves' },
    'spin':          { label: 'Spin Around',       emotion: 'excited',   desc: 'Spin 360°',                cat: 'Moves' },
    'squat':         { label: 'Squat',             emotion: 'excited',   desc: 'Squat down',               cat: 'Moves' },
    'shoot':         { label: 'Finger Gun',        emotion: 'excited',   desc: 'Playful finger gun',       cat: 'Moves' },
    'model_pose':    { label: 'Model Pose',        emotion: 'happy',     desc: 'Show-off pose',            cat: 'Moves' },
    'show_body':     { label: 'Show Off',          emotion: 'excited',   desc: 'Show off outfit',          cat: 'Moves' },
};

function getPoseList() { return { ...POSES }; }

// Emotion -> a real mocap pose to hold WHILE speaking that line (keeps body +
// face in sync for the whole utterance). All values are real .vrma clips.
const EMOTION_POSE = {
    'happy':     'wave_hi',
    'excited':   'clap',
    'sad':       'sad',
    'angry':     'angry',
    'surprised': 'surprised',
    'calm':      'idle_breathe',
    'neutral':   'idle_listen',
    'relaxed':   'relax',
    'sleepy':    'sleepy',
};

function poseForEmotion(emotion) {
    const e = String(emotion || '').toLowerCase();
    return EMOTION_POSE[e] || 'idle_listen';
}

// Keyword -> real mocap pose. Every key below has a loaded .vrma clip.
function matchPose(text) {
    const t = String(text || '').toLowerCase();
    const has = (ws) => ws.some((w) => t.includes(w));
    if (has(['grabbed', 'catch', 'pakdo'])) return 'grabbed';
    if (has(['accuse', 'point out', 'ilzaam', 'complaint'])) return 'accuse';
    if (has(['deny', 'not me', 'naheen', 'insaan'])) return 'deny';
    if (has(['dance', 'nach', 'nacho', 'party'])) return 'dance';
    if (has(['walk', 'chalo', 'ghoomna', 'chale'])) return 'walk';
    if (has(['wave', 'hii', 'hi ', 'hello', 'hey', 'aayush'])) return 'wave_hi';
    if (has(['namaste', 'swagat', 'greeting', 'good to meet'])) return 'greeting';
    if (has(['peace', 'shanti', 'victory'])) return 'peace';
    if (has(['haha', 'lol', 'laugh', 'giggle', 'mazaak', 'joke', 'clap', 'tali', 'cheer'])) return 'clap';
    if (has(['happy', 'khush', 'mast', 'yay', 'excited', 'awesome', 'wow'])) return 'clap';
    if (has(['jump', 'kud', 'jumping'])) return 'jump';
    if (has(['spin', 'ghoom', 'turn around'])) return 'spin';
    if (has(['squat', 'baith', 'crouch'])) return 'squat';
    if (has(['sad', 'udaas', 'dukh', 'dukhi', 'worried'])) return 'sad';
    if (has(['angry', 'gussa', 'annoyed', 'frustrated'])) return 'angry';
    if (has(['omg', 'arre', 'sach', 'shocked', 'surprise', 'really'])) return 'surprised';
    if (has(['think', 'soch', 'hmm', 'idea'])) return 'think';
    if (has(['look', 'dekho', 'wahan', 'idhar'])) return 'look_around';
    if (has(['sleep', 'so', 'neend', 'thak', 'yawn'])) return 'sleepy';
    if (has(['shoot', 'pew', 'gun'])) return 'shoot';
    if (has(['kiss', 'blush', 'shy'])) return 'blush';
    if (has(['thank', 'shukriya'])) return 'greeting';
    if (has(['bye', 'goodbye', 'tata', 'alvida'])) return 'wave_hi';
    if (has(['smile', 'muskura', 'relax', 'aram'])) return 'relax';
    if (has(['listen', 'sun', 'suno', 'spy', 'chup'])) return 'idle_listen';
    return 'idle_breathe';
}

// ────────────────────────────────────────────────────────────
//  INIT
// ────────────────────────────────────────────────────────────
export function getVRM() { return currentVRM; }
window.__vrmPose = () => {
    if (!currentVRM || !currentVRM.humanoid) return { err: 'no vrm' };
    const pos = (bone) => {
        const n = currentVRM.humanoid.getNormalizedBoneNode(bone);
        if (!n) return null;
        n.updateWorldMatrix(true, false);
        const p = new THREE.Vector3();
        n.getWorldPosition(p);
        return [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)];
    };
    const lShoulder = pos('leftShoulder'), rShoulder = pos('rightShoulder');
    const lElbow = pos('leftUpperArm'), rElbow = pos('rightUpperArm');
    const lHand = pos('leftHand'), rHand = pos('rightHand');
    return { shoulderL: lShoulder, shoulderR: rShoulder, elbowL: lElbow, elbowR: rElbow, handL: lHand, handR: rHand };
};

// ── TEMPORARY CALIBRATION HOOK (used by pose2-probe.cjs, removed later) ──
// Sets a single bone to the given euler (all other bones neutral) and plays a
// short clip, so world hand/elbow positions can be measured for that rotation.
window.__calib = (bone, x, y, z, dur) => {
    if (!mixer || !currentVRM || !currentVRM.humanoid) return { err: 'no vrm' };
    const neutral = { leftUpperArm: L_UA, rightUpperArm: R_UA, leftLowerArm: L_LA, rightLowerArm: R_LA, leftHand: L_H, rightHand: R_H };
    try {
        if (gestureTimeout) { clearTimeout(gestureTimeout); gestureTimeout = null; }
        if (gestureAction) { gestureAction.stop(); gestureAction.weight = 0; gestureAction = null; }
        const dur2 = dur || 2.5;
        const boneName = bn(currentVRM, bone);
        if (!boneName) return { err: 'no bone ' + bone };
        const times = [0];
        const vals = [];
        const q = qEuler(x || 0, y || 0, z || 0);
        vals.push(q.x, q.y, q.z, q.w);
        const tracks = [];
        // Neutral tracks so other bones don't fall to bind T-pose
        for (const b in neutral) {
            const nm = bn(currentVRM, b);
            if (!nm || b === bone) continue;
            const t2 = [0], v2 = [];
            const q2 = qEuler(neutral[b][0], neutral[b][1], neutral[b][2]);
            v2.push(q2.x, q2.y, q2.z, q2.w);
            tracks.push(new THREE.QuaternionKeyframeTrack(nm + '.quaternion', t2, v2));
        }
        tracks.push(new THREE.QuaternionKeyframeTrack(boneName + '.quaternion', times, vals));
        const clip = new THREE.AnimationClip('__calib', dur2, tracks);
        const act = mixer.clipAction(clip);
        act.setLoop(THREE.LoopRepeat);
        act.reset().play();
        act.weight = 1;
        if (idleAction) idleAction.weight = 0;
        const settle = setTimeout(() => {
            if (idleAction) idleAction.weight = 1;
            act.stop(); act.weight = 0;
        }, dur2 * 1000);
        window.__calibStop = () => clearTimeout(settle);
        return { ok: true, bone: bone, euler: [x, y, z] };
    } catch (e) {
        return { err: String(e && e.message || e) };
    }
};

export function init(el, modelPath) {
    container = el;
    if (renderer) { renderer.dispose(); container.innerHTML = ''; }

    scene = new THREE.Scene();
    // Foggy dark background — atmospheric, not flat black
    scene.background = new THREE.Color(0x080810);
    scene.fog = new THREE.FogExp2(0x080810, 0.12);

    buildCloudLayer();

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, cameraY, cameraDistance);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    // Lighting — soft, cinematic
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2, 3, 2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x94a3b8, 0.6);
    fill.position.set(-2, 2, 1);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0x22d3ee, 2.0);
    rim.position.set(0, 1, -3);
    scene.add(rim);
    scene.add(new THREE.AmbientLight(0x505050, 0.8));

    clock = new THREE.Clock();
    loadModel(modelPath);

    window.addEventListener('resize', resize);
    window.addEventListener('wheel', onZoom, { passive: false });
    let lastTouch = 0;
    window.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) lastTouch = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
    });
    window.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            const d = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            targetDistance = Math.max(0.7, Math.min(4.0, targetDistance + (lastTouch - d) * 0.005));
            targetCameraY = 1.5;
            isZooming = true;
            zoomCooldown = 1.0;
        }
    });
}

// ────────────────────────────────────────────────────────────
//  SLOW-DRIFTING CLOUD LAYER (background atmosphere)
//  Big, soft, very transparent sprites drifting behind the girl —
//  reads as moving black-fog/cloud, slow and dreamlike.
// ────────────────────────────────────────────────────────────
function cloudTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 8, 128, 128, 122);
    grd.addColorStop(0, 'rgba(140,160,190,0.55)');
    grd.addColorStop(0.45, 'rgba(140,160,190,0.28)');
    grd.addColorStop(1, 'rgba(140,160,190,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
}

function buildCloudLayer() {
    for (const s of cloudSprites) scene.remove(s);
    cloudSprites = [];
    const count = 7;
    for (let i = 0; i < count; i++) {
        const tex = cloudTexture();
        const mat = new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            opacity: 0.06 + Math.random() * 0.06,
            depthWrite: false,
            fog: true,
            color: 0xc0cede,
        });
        const sp = new THREE.Sprite(mat);
        const w = 13 + Math.random() * 11;
        const h = 4.5 + Math.random() * 4;
        sp.scale.set(w, h, 1);
        sp.position.set(
            (Math.random() - 0.5) * 26,
            2.2 + Math.random() * 4.5,
            -6.5 - Math.random() * 4
        );
        // Slow horizontal drift, slow vertical bob, gentle spin.
        sp.userData = {
            speed: 0.12 + Math.random() * 0.22,
            range: 16 + w,
            bob: 0.12 + Math.random() * 0.15,
            bobPhase: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.05,
        };
        cloudSprites.push(sp);
        scene.add(sp);
    }
}

function updateClouds(dt, t) {
    for (const s of cloudSprites) {
        s.position.x += s.userData.speed * dt;
        if (s.position.x > s.userData.range) s.position.x = -s.userData.range;
        s.position.y += Math.sin(t * 0.2 + s.userData.bobPhase) * s.userData.bob * dt * 0.5;
        s.material.rotation += s.userData.spin * dt;
    }
}

// ────────────────────────────────────────────────────────────
//  VRM LOADING
// ────────────────────────────────────────────────────────────
const NON_ZOOM_SELECTOR = '#chat-widget, #chat-window, #chat-header, '
    + '#menu-dropdown, #menu, .menu-panel, .dropdown-menu, select, '
    + '[data-scroll], .scroll';

function onZoom(e) {
    const t = e.target;
    if (t && typeof t.closest === 'function' && t.closest(NON_ZOOM_SELECTOR)) return;
    e.preventDefault();
    targetDistance = Math.max(0.7, Math.min(4.0, targetDistance + e.deltaY * 0.002));
    targetCameraY = 1.5;
    isZooming = true;
    zoomCooldown = 1.0;
}

function loadModel(path) {
    console.log('[VRM] Loading:', path);
    const loader = new GLTFLoader();
    loader.register((p) => new VRMLoaderPlugin(p));
    loader.load(path,
        (gltf) => {
            const vrm = gltf.userData.vrm;
            if (vrm) {
                currentVRM = vrm;
                scene.add(vrm.scene);
                VRMUtils.rotateVRM0(vrm);

                const boneNames = Object.keys(vrm.humanoid.normalizedHumanBones);
                console.log('[VRM] Bones:', boneNames);

                // Create AnimationMixer AFTER VRM loads — clips use actual bone node names
                mixer = new THREE.AnimationMixer(vrm.scene);
                mixer.addEventListener('finished', onClipFinished);

                // Build animation clips using real bone names from the loaded VRM
                buildClipsFromVRM(vrm);
                loadMocapClips(vrm);
                startIdle();
            } else {
                scene.add(gltf.scene);
            }
            startLoop();
        },
        (p) => { if (p.total) console.log('[VRM] ' + Math.round(p.loaded / p.total * 100) + '%'); },
        (err) => { console.error('[VRM] Failed:', err); makePlaceholder(); startLoop(); }
    );
}

function makePlaceholder() {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 16), m);
    head.position.y = 1.55; g.add(head);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.55, 8), m);
    body.position.y = 1.18; g.add(body);
    scene.add(g);
}

// ────────────────────────────────────────────────────────────
//  ANIMATION ACTIONS — mixer.clipAction(clip).play()
// ────────────────────────────────────────────────────────────

// Ensures EXACTLY ONE action drives the skeleton at a time so she NEVER leaks
// back into the bind-pose T-pose: gesture/talk fade in, idle fades out, and on
// finish the gesture is stopped AND its weight hard-zeroed while idle returns
// to full weight.
function restoreIdle() {
    if (gestureAction) { gestureAction.stop(); gestureAction.weight = 0; gestureAction = null; }
    if (gestureTimeout) { clearTimeout(gestureTimeout); gestureTimeout = null; }
    if (heldPoseTimeout) { clearTimeout(heldPoseTimeout); heldPoseTimeout = null; }
    if (talkAction) { talkAction.stop(); talkAction.weight = 0; talkAction = null; }
    if (idleAction) { idleAction.weight = 1; idleAction.reset(); }
}

function startIdle() {
    if (!mixer) return;
    // Prefer the recorded natural idle loop once loaded; the procedural idle is
    // the fallback until then (and for models where the mocap doesn't apply).
    const clip = mocapClips['idle'] || CLIPS.idle;
    if (!clip) return;
    idleAction = mixer.clipAction(clip);
    idleAction.setLoop(THREE.LoopRepeat);
    idleAction.reset().play();
    idleAction.weight = 1;
}

// opts.hold: true => caller owns the restore (used by holdPose so a pose can
// span the exact duration of a spoken line without dropping early).
function playGesture(name, duration, opts = {}) {
    if (!mixer) return;

    // Real recorded motion-capture only. If the mocap for this pose isn't
    // loaded yet (or doesn't exist), do nothing — never fall back to
    // hand-authored arm choreography.
    const clip = mocapClips[name];
    if (!clip) { console.warn('[VRM] no mocap clip for pose:', name); return; }

    // Tear down any previous gesture / talk so weights never accumulate.
    if (gestureAction) { gestureAction.stop(); gestureAction.weight = 0; gestureAction = null; }
    if (gestureTimeout) { clearTimeout(gestureTimeout); gestureTimeout = null; }
    if (heldPoseTimeout) { clearTimeout(heldPoseTimeout); heldPoseTimeout = null; }
    if (talkAction) { talkAction.stop(); talkAction.weight = 0; talkAction = null; }

    gestureAction = mixer.clipAction(clip);
    // Loop while held so the motion reads clearly and the pose persists.
    gestureAction.setLoop(THREE.LoopRepeat);
    gestureAction.reset();
    gestureAction.weight = 1;
    if (idleAction) idleAction.weight = 0;
    gestureAction.play();

    if (opts.hold) return; // restoreIdle will be called by the caller (clearHeldPose)

    const loopMs = duration || 2400;
    gestureTimeout = setTimeout(restoreIdle, loopMs);
}

// Holds a real-mocap pose until clearHeldPose() — used to keep her body moving
// for the WHOLE time she is speaking, from the first syllable to the last.
let heldPoseTimeout = null;
export function holdPose(name, duration) {
    if (!currentVRM || !currentVRM.humanoid || !mixer) return;
    if (!mocapClips[name]) return;
    playGesture(name, 0, { hold: true });
    if (duration) heldPoseTimeout = setTimeout(restoreIdle, duration);
}

export function clearHeldPose() {
    if (heldPoseTimeout) { clearTimeout(heldPoseTimeout); heldPoseTimeout = null; }
    restoreIdle();
}

function startTalk() {
    if (!mixer || !CLIPS.talk || talkAction) return;
    // Keep the face/bob talking without stealing the body pose if a gesture is
    // already driving it — the talk clip only touches head/neck/hands.
    talkAction = mixer.clipAction(CLIPS.talk);
    talkAction.setLoop(THREE.LoopRepeat);
    talkAction.reset().play();
    talkAction.weight = 1;
}

function stopTalk() {
    if (talkAction) {
        talkAction.stop();
        talkAction.weight = 0;
        talkAction = null;
    }
}

function onClipFinished(e) {
    // LoopRepeat actions never "finish" on their own; this is a safety net in
    // case any LoopOnce action completes — force back to idle & zero weights.
    if (e.action) {
        e.action.stop();
        e.action.weight = 0;
    }
    if (e.action === gestureAction) gestureAction = null;
    if (idleAction) { idleAction.weight = 1; idleAction.reset(); }
}

// ────────────────────────────────────────────────────────────
//  RENDER LOOP
// ────────────────────────────────────────────────────────────
function startLoop() { clock.start(); loop(); }

function loop() {
    requestAnimationFrame(loop);
    const dt = clock.getDelta();
    const t = clock.getElapsedTime();

    updateClouds(dt, t);

    // Camera smooth follow
    cameraDistance += (targetDistance - cameraDistance) * 0.08;
    cameraY += (targetCameraY - cameraY) * 0.08;
    camera.position.set(0, cameraY, cameraDistance);
    camera.lookAt(new THREE.Vector3(0, 1.5, 0));

    if (zoomCooldown > 0) {
        zoomCooldown -= dt;
        if (zoomCooldown <= 0) {
            isZooming = false;
            mouseTarget = { x: 0, y: 0 };
        }
    }

    if (currentVRM && currentVRM.humanoid) {
        // Update AnimationMixer — drives ALL bone rotations via quaternion SLERP
        if (mixer) mixer.update(dt);

        // Facial expressions (VRM expression manager — separate from bones).
        // Only the dominant emotion shows; it eases in via setEmotionExpression
        // and decays slowly so she holds an expression while speaking.
        if (currentVRM.expressionManager) {
            const em = currentVRM.expressionManager;
            const exp = expressionState;
            exp.happy     *= 0.95;
            exp.sad       *= 0.95;
            exp.angry     *= 0.95;
            exp.surprised *= 0.95;

            // Apply only the strongest emotion (so faces don't look twisted)
            const names = { happy: exp.happy, sad: exp.sad, angry: exp.angry, surprised: exp.surprised };
            let best = 'happy', bestVal = 0.05;
            for (const k in names) { if (names[k] > bestVal) { bestVal = names[k]; best = k; } }

            // Only blend the dominant one; zero out the rest
            em.setValue('happy', best === 'happy' ? bestVal : 0);
            em.setValue('sad', best === 'sad' ? bestVal : 0);
            em.setValue('angry', best === 'angry' ? bestVal : 0);
            em.setValue('surprised', best === 'surprised' ? bestVal : 0);
        }

        // Blinking
        blink.timer += dt;
        if (blink.timer >= blink.next && blink.phase === 'open') {
            blink.timer = 0;
            blink.next = 2.5 + Math.random() * 3.5;
            blink.phase = 'closing';
        }
        if (blink.phase === 'closing') {
            blink.val = Math.min(blink.val + dt * 10, 1);
            if (blink.val >= 1) blink.phase = 'opening';
        } else if (blink.phase === 'opening') {
            blink.val = Math.max(blink.val - dt * 10, 0);
            if (blink.val <= 0) blink.phase = 'open';
        }
        if (currentVRM.expressionManager) {
            currentVRM.expressionManager.setValue('blink', blink.val);
        }

        currentVRM.update(dt);
    }

    renderer.render(scene, camera);
}

let mouseTarget = { x: 0, y: 0 };

function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ────────────────────────────────────────────────────────────
//  DANCE (special — keeps idle but speeds up)
// ────────────────────────────────────────────────────────────
let isDancing = false;
let danceTimeout = null;

export function startDance(duration) {
    isDancing = true;
    if (danceTimeout) clearTimeout(danceTimeout);
    danceTimeout = setTimeout(() => { isDancing = false; }, 6000);
    // Play the real recorded dance (.vrma) clip — loops for the hold duration,
    // then restoreIdle brings her back to the natural idle.
    playGesture('dance', duration || 6000);
}

// ────────────────────────────────────────────────────────────
//  PUBLIC API — same exports as before so main.js needs no changes
// ────────────────────────────────────────────────────────────

export function triggerMotion(name, duration) {
    if (!currentVRM || !currentVRM.humanoid) return;
    if (name === 'dance') { startDance(duration); return; }

    // Play the real recorded mocap clip for this pose (persist for the duration)
    playGesture(name, duration);

    // Set facial expression to match
    const pose = POSES[name];
    if (pose && pose.emotion) setEmotionExpression(pose.emotion, 0.8);
}

// Debug hook (used by pose2-probe.cjs). Calls the REAL app module instance —
// a dynamic import() would create a second Vite module whose mixer never starts.
window.__gesture = (name, duration) => { triggerMotion(name, duration); };
window.__loadedMocap = () => Object.keys(mocapClips);
window.__resetGesture = () => { resetPose(); };
window.__holdPose = (name) => { holdPose(name); };
window.__clearHold = () => { clearHeldPose(); };
window.__cloudInfo = () => {
    const s = cloudSprites[0];
    return { count: cloudSprites.length, sample: s ? { x: +s.position.x.toFixed(2), y: +s.position.y.toFixed(2), z: +s.position.z.toFixed(2), speed: s.userData.speed } : null };
};

export function resetPose() {
    restoreIdle();
}

export function setMouth(v) {
    if (currentVRM && currentVRM.expressionManager) currentVRM.expressionManager.setValue('aa', v);
}

// Real mocap motions she fires randomly while speaking (in addition to the
// setTalking only manages the talking head-bob. The body pose during speech is
// driven by holdPose()/clearHeldPose() so ONE real-mocap motion spans the
// entire spoken line (no random mid-speech gestures fighting the held pose).
export function setTalking(v) {
    isTalking = v;
    if (v) {
        startTalk();
    } else {
        stopTalk();
        // Let an open-ended gesture keep running to its own timeout (don't cut
        // a pose off mid-motion just because voice ended).
        if (gestureAction && gestureTimeout) return;
        if (gestureAction) { gestureAction.stop(); gestureAction.weight = 0; gestureAction = null; }
        if (idleAction) idleAction.weight = 1;
    }
}

export function isSpeaking() { return isTalking; }

export function resetMouth() { setMouth(0); }

export function zoomIn() {
    targetDistance = Math.max(0.7, targetDistance - 0.4);
    targetCameraY = 1.5;
    isZooming = true;
    zoomCooldown = 1.0;
}

export function zoomOut() {
    targetDistance = Math.min(4.0, targetDistance + 0.4);
    targetCameraY = 1.5;
    isZooming = true;
    zoomCooldown = 1.0;
}

export function setBackground(hex) {
    if (scene) {
        scene.background = new THREE.Color(hex);
        // Update fog color to match background for consistency
        if (scene.fog) scene.fog.color = new THREE.Color(hex);
    }
}

export function setBackgroundImage(url) {
    new THREE.TextureLoader().load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        scene.background = tex;
        // Remove fog when showing an image so it doesn't wash out
        scene.fog = null;
    }, undefined, (e) => console.error('[VRM] Bg image fail:', e));
}

export function setExpressionFromText(text) {
    if (!currentVRM || !currentVRM.expressionManager) return;
    const exp = expressionState;
    const lower = text.toLowerCase();

    if (lower.includes('happy') || lower.includes('khush') || lower.includes('mast') || lower.includes('awesome') || lower.includes('amazing') || lower.includes('love') || lower.includes('wonderful') || lower.includes('glad')) {
        exp.happy = Math.min(exp.happy + 0.7, 1.0);
    }
    if (lower.includes('sad') || lower.includes('dukh') || lower.includes('udaas') || lower.includes('dukhi') || lower.includes('sorry') || lower.includes('disappointed')) {
        exp.sad = Math.min(exp.sad + 0.7, 1.0);
    }
    if (lower.includes('angry') || lower.includes('gussa') || lower.includes('irritated') || lower.includes('annoyed') || lower.includes('frustrated')) {
        exp.angry = Math.min(exp.angry + 0.7, 1.0);
    }
    if (lower.includes('wow') || lower.includes('omg') || lower.includes('arre') || lower.includes('sach') || lower.includes('really') || lower.includes('shocked')) {
        exp.surprised = Math.min(exp.surprised + 0.7, 1.0);
    }
    if (lower.includes('relaxed') || lower.includes('calm') || lower.includes('theek') || lower.includes('chill') || lower.includes('peaceful')) {
        exp.relaxed = Math.min(exp.relaxed + 0.5, 1.0);
    }
}

export function setEmotionExpression(emotion, strength = 0.8) {
    if (!currentVRM || !currentVRM.expressionManager) return;
    const exp = expressionState;

    if (emotion === 'excited')      { exp.happy = Math.min(exp.happy + strength, 1); exp.surprised = Math.min(exp.surprised + strength * 0.5, 1); }
    else if (emotion === 'happy' || emotion === 'funny') { exp.happy = Math.min(exp.happy + strength, 1); }
    else if (emotion === 'sad')     { exp.sad = Math.min(exp.sad + strength, 1); }
    else if (emotion === 'angry')   { exp.angry = Math.min(exp.angry + strength, 1); }
    else if (emotion === 'surprised') { exp.surprised = Math.min(exp.surprised + strength, 1); }
    else if (emotion === 'calm' || emotion === 'neutral') { exp.relaxed = Math.min(exp.relaxed + strength * 0.5, 1); }
}

export { getPoseList, matchPose, poseForEmotion };
