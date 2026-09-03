import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

let scene, camera, renderer, currentVRM, clock, container;
let cameraDistance = 1.8;
let targetDistance = 1.8;
let cameraY = 1.5;
let targetCameraY = 1.5;
const blink = { timer: 0, next: 3, val: 0, phase: 'open' };
let idleTimer = 0;
let idleAction = null;
let idleActionTimer = 0;
let isDancing = false;
let danceTimer = 0;
let danceTimeout = null;
let mouseTarget = { x: 0, y: 0 };
let lookAtWeight = 0;
let isZooming = false;
let zoomCooldown = 0;
let expressionState = { happy: 0, sad: 0, angry: 0, surprised: 0, relaxed: 0 };
let gesture = null; // active gesture: { name, start }
const GESTURE_DUR = 900;

const JOINT_LIMITS = {
    leftShoulder:  { x: [-0.4, 0.4], y: [-0.25, 0.25], z: [-0.25, 0.25] },
    rightShoulder: { x: [-0.3, 0.3], y: [-0.2, 0.2], z: [-0.2, 0.2] },
    leftUpperArm:  { x: [-1.9, 0.9], y: [-0.4, 0.4], z: [0.5, 1.9] },
    rightUpperArm: { x: [-0.6, 0.6], y: [-0.3, 0.3], z: [-1.8, -0.5] },
    leftLowerArm:  { x: [-0.5, 1.8], y: [-0.4, 0.4], z: [-0.9, 0.9] },
    rightLowerArm: { x: [-0.3, 1.5], y: [-0.3, 0.3], z: [-0.3, 0.5] },
    leftHand:      { x: [-0.5, 0.5], y: [-0.4, 0.4], z: [-0.4, 0.4] },
    rightHand:     { x: [-0.4, 0.4], y: [-0.3, 0.3], z: [-0.3, 0.3] },
    head:          { x: [-0.4, 0.3], y: [-0.6, 0.6], z: [-0.25, 0.25] },
    neck:          { x: [-0.3, 0.2], y: [-0.4, 0.4], z: [-0.15, 0.15] },
    spine:         { x: [-0.15, 0.08], y: [-0.08, 0.08], z: [-0.08, 0.08] },
    chest:         { x: [-0.1, 0.04], y: [-0.04, 0.04], z: [-0.04, 0.04] },
    upperChest:    { x: [-0.08, 0.04], y: [-0.03, 0.03], z: [-0.03, 0.03] },
    hips:          { x: [-0.15, 0.08], y: [-0.08, 0.08], z: [-0.08, 0.08] },
    leftUpperLeg:  { x: [-0.9, 1.2], y: [-0.2, 0.2], z: [-0.15, 0.15] },
    rightUpperLeg: { x: [-0.9, 1.2], y: [-0.2, 0.2], z: [-0.15, 0.15] },
    leftLowerLeg:  { x: [-0.1, 1.6], y: [-0.15, 0.15], z: [-0.1, 0.1] },
    rightLowerLeg: { x: [-0.1, 1.6], y: [-0.15, 0.15], z: [-0.1, 0.1] },
    leftFoot:      { x: [-0.6, 0.6], y: [-0.3, 0.3], z: [-0.2, 0.2] },
    rightFoot:     { x: [-0.6, 0.6], y: [-0.3, 0.3], z: [-0.2, 0.2] },
};

const BASE_POSE = {
    leftShoulder:  { x: 0, y: 0, z: 0 },
    rightShoulder: { x: 0, y: 0, z: 0 },
    leftUpperArm:  { x: 0, y: 0.05, z: 1.35 },
    rightUpperArm: { x: 0, y: -0.05, z: -1.35 },
    leftLowerArm:  { x: 0, y: 0, z: -0.25 },
    rightLowerArm: { x: 0, y: 0, z: 0.25 },
    leftHand:      { x: 0, y: -0.08, z: 0.25 },
    rightHand:     { x: 0, y: 0.08, z: -0.15 },
    leftHandThumb: { x: 0, y: 0, z: 0.1 },
    rightHandThumb: { x: 0, y: 0, z: -0.1 },
    head:          { x: 0, y: 0, z: 0 },
    neck:          { x: 0, y: 0, z: 0 },
    spine:         { x: 0, y: 0, z: 0 },
    chest:         { x: 0, y: 0, z: 0, scale: 1 },
    upperChest:    { x: 0, y: 0, z: 0, scale: 1 },
    hips:          { x: 0, y: 0, z: 0 },
    leftUpperLeg:  { x: 0, y: 0, z: 0 },
    rightUpperLeg: { x: 0, y: 0, z: 0 },
    leftLowerLeg:  { x: 0, y: 0, z: 0 },
    rightLowerLeg: { x: 0, y: 0, z: 0 },
    leftFoot:      { x: 0, y: 0, z: 0 },
    rightFoot:     { x: 0, y: 0, z: 0 },
};

const IDLE_ACTIONS = ['breathe', 'hairTouch', 'weightShift', 'lookAround', 'fidget'];

// Pose registry: every pose the avatar can strike. Each entry maps to a case in
// applyGesturePose(). The AI (local model) picks from these keys, and the
// "Poses" buttons in the three-dot menu trigger them directly.
const POSES = {
    'wave_hi':       { label: 'Wave Hi',            emotion: 'happy',    desc: '"Hi!" wave with clean elbow/forearm/hand alignment' },
    'wave_both':     { label: 'Wave Both Hands',    emotion: 'excited',  desc: 'Friendly double-hand wave' },
    'spread_arms':   { label: 'Spread Arms',        emotion: 'happy',    desc: 'Open-arms greeting, palms up' },
    'happy_bounce':  { label: 'Happy Bounce',       emotion: 'excited',  desc: 'Little cheer: arms up + knee bounce' },
    'hands_hip':     { label: 'Hands on Hips',      emotion: 'happy',    desc: 'Confident boss stance' },
    'lean_cool':     { label: 'Cool Lean',          emotion: 'neutral',  desc: 'Relaxed weight-on-one-hip lean' },
    'nod':           { label: 'Nod',                emotion: 'calm',     desc: 'Agreeing nod' },
    'tilt_head':     { label: 'Tilt Head',          emotion: 'sad',      desc: 'Gentle head tilt' },
    'think':         { label: 'Think',              emotion: 'neutral',  desc: 'Hand to chin, thinking' },
    'shrug':         { label: 'Shrug',              emotion: 'neutral',  desc: '\'I don\'t know\' shrug' },
    'point':         { label: 'Point',              emotion: 'excited',  desc: 'Pointing out' },
    'cross_arms':    { label: 'Cross Arms',         emotion: 'neutral',  desc: 'Arms crossed' },
    'blow_kiss':     { label: 'Blow Kiss',          emotion: 'happy',    desc: 'Playful kiss' },
    'salute':        { label: 'Salute',             emotion: 'excited',  desc: 'Friendly salute' },
    'bow':           { label: 'Bow',                emotion: 'neutral',  desc: 'Polite bow' },
    'stretch':       { label: 'Stretch',            emotion: 'relaxed',  desc: 'Arms-up stretch' },
    'flip_hair':     { label: 'Flip Hair',          emotion: 'excited',  desc: 'Hair flip' },
    'laugh':         { label: 'Laugh',              emotion: 'happy',    desc: 'Laughing' },
    'surprise':      { label: 'Surprise',           emotion: 'surprised', desc: 'Hands up, surprised' },
    'dance':         { label: 'Dance',              emotion: 'excited',  desc: 'Quick dance' },
};

function getPoseList() { return { ...POSES }; }

// Keyword-based pose selection (offline fallback when the local AI model is
// not available). Returns a valid pose key from the registry.
function matchPose(text) {
    const t = String(text || '').toLowerCase();
    const has = (ws) => ws.some((w) => t.includes(w));
    if (has(['dance', 'nach', 'nacho'])) return 'dance';
    if (has(['wave', 'hii', 'hi ', 'hello', 'namaste', 'swagat', 'hey'])) return 'wave_hi';
    if (has(['haha', 'lol', 'laugh', 'giggle', 'mazaak', 'joke', 'hasna'])) return 'laugh';
    if (has(['happy', 'khush', 'mast', 'yay', 'excited', 'awesome', 'celebrate'])) return 'happy_bounce';
    if (has(['sad', 'udaas', 'dukh', 'dukhi', 'worried', 'sob', 'cry'])) return 'tilt_head';
    if (has(['angry', 'gussa', 'annoyed', 'frustrated', 'strict', 'nonsense'])) return 'cross_arms';
    if (has(['wow', 'omg', 'arre', 'sach', 'seriously', 'shocked', 'surprise'])) return 'surprise';
    if (has(['think', 'soch', 'muse', 'idea', 'hmm', 'kya soch'])) return 'think';
    if (has(['point', 'dekho', 'look', 'vaha', 'wahan'])) return 'point';
    if (has(['kiss', 'blush', 'shy'])) return 'blow_kiss';
    if (has(['thank', 'shukriya', 'dhanyawad'])) return 'bow';
    if (has(['bye', 'goodbye', 'alvida', 'tata', 'chalta'])) return 'wave_both';
    return 'nod';
}

function lerp(a, b, t) { return a + (b - a) * t; }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function applyJointLimits(boneName, rot) {
    const limits = JOINT_LIMITS[boneName];
    if (!limits) return rot;
    return {
        x: clamp(rot.x, limits.x[0], limits.x[1]),
        y: clamp(rot.y, limits.y[0], limits.y[1]),
        z: clamp(rot.z, limits.z[0], limits.z[1]),
    };
}

function getBone(h, name) { return h.getNormalizedBoneNode(name); }

export function getVRM() { return currentVRM; }

export function init(el, modelPath) {
    container = el;
    if (renderer) { renderer.dispose(); container.innerHTML = ''; }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, cameraY, cameraDistance);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

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
        if (e.touches.length === 2) lastTouch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    });
    window.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            targetDistance = Math.max(0.7, Math.min(4.0, targetDistance + (lastTouch - d) * 0.005));
            lastTouch = d;
        }
    });
}

// Elements that should scroll normally instead of zooming the camera when the
// user wheels over them (chat panel, models/vrms menues, three-dot menu, ...).
const NON_ZOOM_SELECTOR = '#chat-widget, #chat-window, #chat-header, '
    + '#menu-dropdown, #menu, .menu-panel, .dropdown-menu, select, '
    + '[data-scroll], .scroll';

function onZoom(e) {
    // If the wheel happens over a scrollable or interactive overlay, let the
    // page/dropdown scroll normally instead of zooming the 3D camera.
    const t = e.target;
    if (t && typeof t.closest === 'function' && t.closest(NON_ZOOM_SELECTOR)) {
        return;
    }
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
                console.log('[VRM] Bones found:', boneNames);
                console.log('[VRM] Model ready with biomechanical joint limits');
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

function startLoop() { clock.start(); loop(); }

function loop() {
    requestAnimationFrame(loop);
    const dt = clock.getDelta();
    const t = clock.getElapsedTime();

    cameraDistance += (targetDistance - cameraDistance) * 0.08;
    cameraY += (targetCameraY - cameraY) * 0.08;
    camera.position.set(0, cameraY, cameraDistance);
    camera.lookAt(new THREE.Vector3(0, 1.5, 0));

    if (zoomCooldown > 0) {
        zoomCooldown -= dt;
        if (zoomCooldown <= 0) {
            isZooming = false;
            mouseTarget.x = 0;
            mouseTarget.y = 0;
        }
    }

    if (currentVRM && currentVRM.humanoid) {
        const h = currentVRM.humanoid;

        const pose = JSON.parse(JSON.stringify(BASE_POSE));

        const breath = 1 + Math.sin(t * 1.8) * 0.025;
        pose.chest.scale = breath;
        pose.upperChest.scale = breath;
        pose.chest.x += Math.sin(t * 1.8) * 0.005;

        pose.leftUpperArm.x  += Math.sin(t * 0.5) * 0.015;
        pose.rightUpperArm.x += Math.sin(t * 0.5 + 1) * 0.015;
        pose.leftHand.z      += Math.sin(t * 0.7) * 0.015;
        // Right hand stays still - no micro movements
        pose.head.y          += Math.sin(t * 0.3) * 0.01;
        pose.head.x          += Math.cos(t * 0.25) * 0.005;

        // Straight-on look: Arohi faces the camera and never follows the mouse,
        // so she is always making direct eye contact with the user.
        pose.head.y = 0;
        pose.head.x = 0;
        pose.neck.y = 0;
        pose.neck.x = 0;

        if (currentVRM.expressionManager) {
            const exp = expressionState;
            exp.happy     *= 0.98;
            exp.sad       *= 0.98;
            exp.angry     *= 0.98;
            exp.surprised *= 0.98;
            exp.relaxed   = 1 - Math.max(exp.happy, exp.sad, exp.angry, exp.surprised);
            
            if (exp.happy > 0.05) currentVRM.expressionManager.setValue('happy', exp.happy);
            if (exp.sad > 0.05) currentVRM.expressionManager.setValue('sad', exp.sad);
            if (exp.angry > 0.05) currentVRM.expressionManager.setValue('angry', exp.angry);
            if (exp.surprised > 0.05) currentVRM.expressionManager.setValue('surprised', exp.surprised);
        }

        if (!isDancing) {
            idleTimer += dt;
            if (idleTimer > 8 + Math.random() * 12) {
                idleTimer = 0;
                idleAction = IDLE_ACTIONS[Math.floor(Math.random() * IDLE_ACTIONS.length)];
                idleActionTimer = 0;
                console.log('[Idle]', idleAction);
            }

            if (idleAction) {
                idleActionTimer += dt;
                const at = easeInOut(Math.min(idleActionTimer / 1.5, 1));

                switch (idleAction) {
                    case 'hairTouch':
                        if (at < 1) {
                            pose.leftShoulder.x = lerp(0, 0.2, at);
                            pose.leftUpperArm.z = lerp(1.35, 1.7, at);
                            pose.leftUpperArm.x = lerp(0, -0.3, at);
                            pose.leftLowerArm.x = lerp(0, 0.8, at);
                            pose.head.z = lerp(0, -0.05, at);
                        } else {
                            pose.leftShoulder.x = 0.2 + Math.sin(t * 0.5) * 0.02;
                            pose.leftUpperArm.z = 1.7;
                            pose.leftUpperArm.x = -0.3;
                            pose.leftLowerArm.x = 0.8;
                            pose.head.z = -0.05;
                        }
                        if (idleActionTimer > 5) { idleAction = null; }
                        break;

                    case 'weightShift':
                        pose.hips.z = Math.sin(t * 0.5) * 0.06;
                        pose.hips.x = Math.cos(t * 0.5) * 0.02;
                        pose.head.z = -Math.sin(t * 0.5) * 0.04;
                        pose.neck.z = -Math.sin(t * 0.5) * 0.02;
                        // Only left arm moves during weight shift
                        pose.leftUpperArm.z = lerp(1.35, 1.25, 0.5 + Math.sin(t * 0.6) * 0.5);
                        if (idleActionTimer > 6) { idleAction = null; }
                        break;

                    case 'lookAround':
                        pose.head.y = Math.sin(t * 0.35) * 0.35;
                        pose.head.x = Math.cos(t * 0.25) * 0.08;
                        pose.neck.y = pose.head.y * 0.7;
                        pose.neck.x = pose.head.x * 0.6;
                        // Only left arm subtle movement
                        pose.leftUpperArm.z = lerp(1.35, 1.3, Math.sin(t * 0.2) * 0.5 + 0.5);
                        if (idleActionTimer > 8) { idleAction = null; }
                        break;

                    case 'fidget':
                        // Only left hand subtle fidget
                        pose.leftHand.z = lerp(0.25, 0.3, Math.sin(t * 3) * 0.5 + 0.5);
                        pose.leftHand.x = Math.sin(t * 2.5) * 0.03;
                        if (idleActionTimer > 3) { idleAction = null; }
                        break;
                }
            }
        }

        const speed = 0.08;

        // Apply active gesture (overrides pose targets so hand gestures are
        // accurate, visible and smoothly animated instead of being cancelled
        // by the base-pose lerp).
        if (gesture) {
            const elapsed = performance.now() - gesture.start;
            const p = Math.min(elapsed / GESTURE_DUR, 1);
            applyGesturePose(pose, p);
            if (p >= 1) gesture = null;
        }
        if (currentVRM && currentVRM.humanoid) {
            const applyBone = (name, target) => {
                const bone = getBone(h, name);
                if (!bone) return;
                const limited = applyJointLimits(name, target);
                if (limited.x !== undefined) bone.rotation.x += (limited.x - bone.rotation.x) * speed;
                if (limited.y !== undefined) bone.rotation.y += (limited.y - bone.rotation.y) * speed;
                if (limited.z !== undefined) bone.rotation.z += (limited.z - bone.rotation.z) * speed;
            };

            applyBone('leftShoulder', pose.leftShoulder);
            applyBone('rightShoulder', pose.rightShoulder);
            applyBone('leftUpperArm', pose.leftUpperArm);
            applyBone('rightUpperArm', pose.rightUpperArm);
            applyBone('leftLowerArm', pose.leftLowerArm);
            applyBone('rightLowerArm', pose.rightLowerArm);
            applyBone('leftHand', pose.leftHand);
            applyBone('rightHand', pose.rightHand);
            applyBone('head', pose.head);
            applyBone('neck', pose.neck);
            applyBone('spine', pose.spine);
            applyBone('chest', pose.chest);
            applyBone('upperChest', pose.upperChest);
            applyBone('hips', pose.hips);
            applyBone('leftUpperLeg', pose.leftUpperLeg);
            applyBone('rightUpperLeg', pose.rightUpperLeg);
            applyBone('leftLowerLeg', pose.leftLowerLeg);
            applyBone('rightLowerLeg', pose.rightLowerLeg);
            applyBone('leftFoot', pose.leftFoot);
            applyBone('rightFoot', pose.rightFoot);

            const chestBone = getBone(h, 'chest');
            const upperChestBone = getBone(h, 'upperChest');
            if (chestBone) chestBone.scale.setScalar(pose.chest.scale);
            if (upperChestBone) upperChestBone.scale.setScalar(pose.upperChest.scale);
        }

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

function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

export function startDance() {
    isDancing = true;
    danceTimer = 0;
    if (danceTimeout) clearTimeout(danceTimeout);
    danceTimeout = setTimeout(() => { isDancing = false; }, 6000);
}

// Applies an active gesture to the pose targets (called each frame inside loop).
// p is the eased progress 0->1. Returns nothing; mutates pose. Joints are set
// as a full chain (shoulder -> upperArm -> lowerArm -> hand) so elbows/forearms
// and hands stay aligned instead of the model collapsing into a T-pose.
function applyGesturePose(pose, p) {
    if (!gesture) return;
    const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p; // in-out
    const hold = Math.min(p * 3, 1); // quick rise
    const now = performance.now();

    switch (gesture.name) {
        // "Hi" wave: right arm raised, elbow bent, hand rotating side to side.
        // Whole chain set together for a clean, anatomically sensible wave.
        case 'wave':
        case 'wave_hi':
            pose.rightShoulder.x = 0.1;
            pose.rightShoulder.y = -0.15;
            pose.rightUpperArm.z = -1.6 + (gesture.name === 'wave_hi' ? 0.1 : 0);
            pose.rightUpperArm.x = -1.5 * ease;
            pose.rightLowerArm.z = -1.3 * ease;
            pose.rightLowerArm.x = 0.25 * ease;
            pose.rightHand.z = -0.55 + Math.sin(now / 120) * 0.2 * hold;
            pose.rightHand.y = 0.15 * ease;
            pose.head.x = 0.08 * ease;
            pose.head.y = 0.12 * ease;
            break;

        // Both hands wave "hi" with clean elbow + forearm alignment.
        case 'wave_both':
            pose.leftShoulder.x = 0.1;
            pose.rightShoulder.x = 0.1;
            pose.rightUpperArm.z = -1.6 * ease;
            pose.leftUpperArm.z = 1.6 * ease;
            pose.rightLowerArm.z = -1.3 * ease;
            pose.leftLowerArm.z = 1.3 * ease;
            pose.leftUpperArm.x = -1.36 * ease;
            pose.rightUpperArm.x = -1.36 * ease;
            pose.rightHand.z = -0.5 + Math.sin(now / 130) * 0.18 * hold;
            pose.leftHand.z = 0.5 + Math.sin(now / 130 + Math.PI) * 0.18 * hold;
            pose.head.x = 0.08 * ease;
            break;

        // Arms spread wide (greeting / "aur kya?") with palms up.
        case 'spread_arms':
            pose.leftUpperArm.z = 1.55 * ease;
            pose.rightUpperArm.z = -1.55 * ease;
            pose.leftUpperArm.x = -1.2 * ease;
            pose.rightUpperArm.x = -1.2 * ease;
            pose.leftLowerArm.z = 0.4 * ease;
            pose.rightLowerArm.z = -0.4 * ease;
            pose.leftHand.y = 0.2 * ease;
            pose.rightHand.y = 0.2 * ease;
            pose.leftHand.z = 0.3;
            pose.rightHand.z = -0.3;
            pose.head.y = 0.15 * ease;
            break;

        // Happy bounce: slight knee-bend + arms up, like a little cheer.
        case 'happy_bounce':
            pose.rightUpperArm.z = -1.45 * ease;
            pose.leftUpperArm.z = 1.45 * ease;
            pose.rightUpperArm.x = -0.9 * ease;
            pose.leftUpperArm.x = -0.9 * ease;
            pose.rightLowerArm.z = -0.9 * ease;
            pose.leftLowerArm.z = 0.9 * ease;
            pose.leftUpperLeg.x = -0.1 * ease;
            pose.rightUpperLeg.x = -0.1 * ease;
            pose.leftFoot.x = 0.1 * ease;
            pose.rightFoot.x = -0.1 * ease;
            pose.head.x = -0.1 * ease;
            break;

        // Confident hands-on-hips "boss" stance.
        case 'hands_hip':
            pose.leftUpperArm.z = 1.55;
            pose.rightUpperArm.z = -1.55;
            pose.leftUpperArm.x = -1.3 * ease;
            pose.rightUpperArm.x = -1.3 * ease;
            pose.leftLowerArm.x = 0.9 * ease;
            pose.rightLowerArm.x = 0.9 * ease;
            pose.leftLowerArm.z = 0.4;
            pose.rightLowerArm.z = -0.4;
            pose.leftUpperLeg.x = 0.12 * ease;
            pose.rightUpperLeg.x = -0.05 * ease;
            pose.hips.z = 0.12 * ease;
            break;

        // Relaxed cross-another-leg lean (weight on one hip).
        case 'lean_cool':
            pose.hips.z = 0.16 * ease;
            pose.hips.x = -0.03 * ease;
            pose.spine.z = 0.1 * ease;
            pose.leftUpperLeg.x = 0.18 * ease;
            pose.rightUpperLeg.x = -0.18 * ease;
            pose.head.z = 0.08 * ease;
            break;

        case 'nod':
            pose.head.x = -0.32 * ease;
            break;
        case 'laugh':
            pose.spine.z = 0.12 * ease;
            pose.head.x = -0.12 * ease;
            pose.spine.x = 0.06 * ease;
            break;
        case 'think':
            pose.head.y = 0.32 * ease;
            pose.leftUpperArm.x = -0.5 * ease;
            pose.leftUpperArm.z = 1.6;
            pose.leftLowerArm.x = 0.8 * ease;
            pose.leftLowerArm.z = 0.3 * ease;
            pose.leftHand.z = 0.45;
            break;
        case 'shrug':
            pose.leftShoulder.x = 0.25 * ease;
            pose.rightShoulder.x = 0.25 * ease;
            pose.leftUpperArm.y = 0.35 * ease;
            pose.rightUpperArm.y = -0.35 * ease;
            break;
        case 'tilt_head':
            pose.head.z = 0.3 * ease;
            pose.neck.z = 0.15 * ease;
            break;
        case 'surprise':
            pose.head.x = -0.22 * ease;
            pose.head.y = 0.12 * ease;
            pose.leftUpperArm.z = 1.55;
            pose.rightUpperArm.z = -1.55;
            pose.leftLowerArm.x = 0.3 * ease;
            pose.rightLowerArm.x = 0.3 * ease;
            pose.leftHand.y = 0.3 * ease;
            pose.rightHand.y = 0.3 * ease;
            break;
        case 'blow_kiss':
            pose.leftUpperArm.x = -1.4 * ease;
            pose.leftUpperArm.z = 1.7;
            pose.leftLowerArm.x = 1.0 * ease;
            pose.leftLowerArm.z = -0.6 * ease;
            pose.leftHand.z = 0.5;
            pose.head.z = 0.15 * ease;
            break;
        case 'bow':
            pose.spine.x = 0.45 * ease;
            pose.head.x = 0.3 * ease;
            break;
        case 'stretch':
            pose.leftUpperArm.z = 1.8;
            pose.rightUpperArm.z = -1.8;
            pose.leftUpperArm.x = -0.7 * ease;
            pose.rightUpperArm.x = -0.7 * ease;
            pose.leftLowerArm.x = -0.4 * ease;
            pose.rightLowerArm.x = -0.4 * ease;
            pose.head.x = -0.25 * ease;
            pose.head.y = -0.2 * ease;
            break;
        case 'point':
            pose.leftUpperArm.x = -1.4 * ease;
            pose.leftUpperArm.z = 1.5;
            pose.leftLowerArm.x = 0.35 * ease;
            pose.leftLowerArm.z = -0.5 * ease;
            pose.leftHand.z = -0.5 * ease;
            pose.head.y = 0.3 * ease;
            break;
        case 'cross_arms':
            pose.leftUpperArm.z = 1.7;
            pose.leftUpperArm.x = -1.15 * ease;
            pose.leftLowerArm.x = 0.7 * ease;
            pose.leftLowerArm.z = 0.25;
            pose.rightUpperArm.z = -1.3;
            pose.rightLowerArm.x = -0.7 * ease;
            pose.rightLowerArm.z = -0.25;
            break;
        case 'flip_hair':
            pose.head.z = 0.45 * ease;
            pose.head.y = -0.35 * ease;
            pose.leftUpperArm.z = 1.75;
            pose.leftUpperArm.x = -0.6 * ease;
            pose.leftLowerArm.x = 0.9 * ease;
            break;
        case 'salute':
            pose.rightUpperArm.z = -1.5;
            pose.rightUpperArm.x = -1.55 * ease;
            pose.rightLowerArm.x = 0.4 * ease;
            pose.rightHand.x = 0.35 * ease;
            pose.rightHand.y = 0.2 * ease;
            pose.head.x = 0.05;
            break;
    }
}

export function triggerMotion(name) {
    if (!currentVRM || !currentVRM.humanoid) return;
    if (name === 'dance') { startDance(); return; }
    gesture = { name, start: performance.now() };
    // Default emotion for every pose so her face matches the movement.
    const pose = POSES[name];
    if (pose && pose.emotion) setEmotionExpression(pose.emotion, 0.8);
    else {
        // Legacy: known gesture-expression pairs.
        const h = currentVRM.humanoid;
        switch (name) {
            case 'laugh': case 'blow_kiss': setEmotionExpression('happy', 0.9); break;
            case 'surprise': setEmotionExpression('surprised', 0.9); break;
            default: break;
        }
    }
}

export function resetPose() { gesture = null; }

export function setMouth(v) {
    if (currentVRM && currentVRM.expressionManager) currentVRM.expressionManager.setValue('aa', v);
}
export function resetMouth() { setMouth(0); }
export function zoomIn() { targetDistance = Math.max(0.7, targetDistance - 0.4); targetCameraY = 1.5; isZooming = true; zoomCooldown = 1.0; }
export function zoomOut() { targetDistance = Math.min(4.0, targetDistance + 0.4); targetCameraY = 1.5; isZooming = true; zoomCooldown = 1.0; }
export function setBackground(hex) { if (scene) scene.background = new THREE.Color(hex); }
export function setBackgroundImage(url) {
    new THREE.TextureLoader().load(url, (tex) => { tex.colorSpace = THREE.SRGBColorSpace; scene.background = tex; }, undefined, (e) => console.error('[VRM] Bg image fail:', e));
}

export function setExpressionFromText(text) {
    if (!currentVRM || !currentVRM.expressionManager) return;
    const exp = expressionState;
    const lower = text.toLowerCase();
    
    if (lower.includes('happy') || lower.includes('khush') || lower.includes('mast') || lower.includes('awesome') || lower.includes('amazing') || lower.includes('love') || lower.includes('wonderful') || lower.includes('glad') || lower.includes('😊') || lower.includes('😄')) {
        exp.happy = Math.min(exp.happy + 0.7, 1.0);
    }
    if (lower.includes('sad') || lower.includes('dukh') || lower.includes('udaas') || lower.includes('dukhi') || lower.includes('sorry') || lower.includes('disappointed') || lower.includes('😢') || lower.includes('😭')) {
        exp.sad = Math.min(exp.sad + 0.7, 1.0);
    }
    if (lower.includes('angry') || lower.includes('gussa') || lower.includes('irritated') || lower.includes('annoyed') || lower.includes('frustrated') || lower.includes('😠') || lower.includes('😡')) {
        exp.angry = Math.min(exp.angry + 0.7, 1.0);
    }
    if (lower.includes('wow') || lower.includes('omg') || lower.includes('arre') || lower.includes('sach') || lower.includes('really') || lower.includes('shocked') || lower.includes('😲') || lower.includes('😮')) {
        exp.surprised = Math.min(exp.surprised + 0.7, 1.0);
    }
    if (lower.includes('relaxed') || lower.includes('calm') || lower.includes('theek') || lower.includes('chill') || lower.includes('peaceful') || lower.includes('okay')) {
        exp.relaxed = Math.min(exp.relaxed + 0.5, 1.0);
    }
}

// Set facial expression directly from a detected emotion (used while talking)
// so her face matches how she speaks (excited/sad/angry/funny...)
export function setEmotionExpression(emotion, strength = 0.8) {
    if (!currentVRM || !currentVRM.expressionManager) return;
    const exp = expressionState;

    if (emotion === 'excited') { exp.happy = Math.min(exp.happy + strength, 1); exp.surprised = Math.min(exp.surprised + strength * 0.5, 1); }
    else if (emotion === 'happy' || emotion === 'funny') { exp.happy = Math.min(exp.happy + strength, 1); }
    else if (emotion === 'sad') { exp.sad = Math.min(exp.sad + strength, 1); }
    else if (emotion === 'angry') { exp.angry = Math.min(exp.angry + strength, 1); }
    else if (emotion === 'surprised') { exp.surprised = Math.min(exp.surprised + strength, 1); }
    else if (emotion === 'calm' || emotion === 'neutral') { exp.relaxed = Math.min(exp.relaxed + strength * 0.5, 1); }
}

export { getPoseList, matchPose };