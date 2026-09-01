import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

let scene, camera, renderer, currentVRM, clock, container;
let cameraDistance = 2.2;
let targetDistance = 2.2;
let cameraY = 1.0;
let targetCameraY = 1.0;
const blink = { timer: 0, next: 3, val: 0, phase: 'open' };
let idleTimer = 0;
let idleAction = null;
let isDancing = false;
let danceTimer = 0;
let danceTimeout = null;
let poseReady = false;

// Store the REST POSE so we always return to it
const restPose = {};

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

    // Lighting
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
    poseReady = false;
    loadModel(modelPath);

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('wheel', onZoom, { passive: false });
    let lastTouch = 0;
    window.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) lastTouch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    });
    window.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            targetDistance = Math.max(0.8, Math.min(5.0, targetDistance + (lastTouch - d) * 0.005));
            lastTouch = d;
        }
    });
}

function onZoom(e) {
    e.preventDefault();
    targetDistance = Math.max(0.8, Math.min(5.0, targetDistance + e.deltaY * 0.002));
    // Adjust camera Y based on zoom distance to keep face in frame
    targetCameraY = 0.9 + (targetDistance - 1.0) * 0.1;
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
                vrm.scene.rotation.y = Math.PI;

                // Apply natural pose and SAVE it
                applyAndSavePose(vrm);

                console.log('[VRM] Loaded, pose saved');
            } else {
                scene.add(gltf.scene);
            }
            startLoop();
        },
        (p) => { if (p.total) console.log('[VRM] ' + Math.round(p.loaded / p.total * 100) + '%'); },
        (err) => { console.error('[VRM] Failed:', err); makePlaceholder(); startLoop(); }
    );
}

function applyAndSavePose(vrm) {
    if (!vrm || !vrm.humanoid) return;
    const h = vrm.humanoid;

    // Helper to set bone rotation and save it
    const setBone = (name, x, y, z) => {
        const bone = h.getNormalizedBoneNode(name);
        if (bone) {
            bone.rotation.set(x, y, z);
            restPose[name] = { x, y, z };
            console.log('[VRM] Set bone:', name, '->', x.toFixed(2), y.toFixed(2), z.toFixed(2));
        } else {
            console.warn('[VRM] Bone not found:', name);
        }
    };

    // === ARMS: Down from T-pose to natural sides ===
    // Upper arms: rotate on Z axis to bring down
    setBone('leftUpperArm', 0.05, -0.1, 0.35);     // Left arm slightly forward, out, down
    setBone('rightUpperArm', 0.05, 0.1, -0.35);     // Right arm slightly forward, out, down

    // Forearms: slight natural bend
    setBone('leftLowerArm', -0.15, 0, 0);           // Slight bend forward
    setBone('rightLowerArm', -0.15, 0, 0);

    // Hands: relaxed
    setBone('leftHand', 0, 0, 0);
    setBone('rightHand', 0, 0, 0);

    // === SPINE: slight natural forward lean ===
    setBone('spine', 0.05, 0, 0);
    setBone('chest', -0.02, 0, 0);

    // === HEAD: straight ===
    setBone('head', 0, 0, 0);
    setBone('neck', 0, 0, 0);

    // === LEGS: straight ===
    setBone('leftUpperLeg', 0, 0, 0);
    setBone('rightUpperLeg', 0, 0, 0);
    setBone('leftLowerLeg', 0, 0, 0);
    setBone('rightLowerLeg', 0, 0, 0);

    poseReady = true;
    console.log('[VRM] Rest pose saved with', Object.keys(restPose).length, 'bones');
}

function restorePose() {
    if (!currentVRM || !currentVRM.humanoid) return;
    const h = currentVRM.humanoid;

    for (const [name, rot] of Object.entries(restPose)) {
        const bone = h.getNormalizedBoneNode(name);
        if (bone) {
            bone.rotation.x = rot.x;
            bone.rotation.y = rot.y;
            bone.rotation.z = rot.z;
        }
    }
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

    // === SMOOTH ZOOM (face-centered) ===
    cameraDistance += (targetDistance - cameraDistance) * 0.08;
    cameraY += (targetCameraY - cameraY) * 0.08;
    camera.position.set(0, cameraY, cameraDistance);

    // Look at face area (head is around y=1.4-1.6)
    const lookTarget = new THREE.Vector3(0, 1.1 + (cameraDistance - 1.0) * 0.05, 0);
    camera.lookAt(lookTarget);

    if (currentVRM && currentVRM.humanoid && poseReady) {
        const h = currentVRM.humanoid;
        const get = (n) => h.getNormalizedBoneNode(n);

        // === RESTORE POSE FIRST, then apply idle on top ===
        restorePose();

        if (!isDancing) {
            // === ADD SUBTLE IDLE MOVEMENTS ON TOP OF REST POSE ===

            // Breathing: spine subtle movement
            const spine = get('spine');
            const chest = get('chest');
            if (spine) {
                spine.rotation.z += Math.sin(t * 0.7) * 0.015;
                spine.rotation.x += Math.sin(t * 1.8) * 0.01;
            }
            if (chest) chest.rotation.x += Math.sin(t * 1.5) * 0.008;

            // Arm micro-sway (on top of rest pose)
            const leftArm = get('leftUpperArm');
            const rightArm = get('rightUpperArm');
            const leftForeArm = get('leftLowerArm');
            const rightForeArm = get('rightLowerArm');

            if (leftArm) {
                leftArm.rotation.z += Math.sin(t * 0.6) * 0.02;
                leftArm.rotation.x += Math.sin(t * 0.4) * 0.015;
            }
            if (rightArm) {
                rightArm.rotation.z += Math.sin(t * 0.6 + 0.5) * 0.02;
                rightArm.rotation.x += Math.sin(t * 0.4 + 0.5) * 0.015;
            }
            if (leftForeArm) leftForeArm.rotation.x += Math.sin(t * 0.5) * 0.015;
            if (rightForeArm) rightForeArm.rotation.x += Math.sin(t * 0.5 + 0.5) * 0.015;

            // Idle head
            idleTimer += dt;
            if (idleTimer > 3 + Math.random() * 4) {
                idleTimer = 0;
                idleAction = ['look', 'tilt', 'nod', 'glance'][Math.floor(Math.random() * 4)];
                setTimeout(() => { idleAction = null; }, 600 + Math.random() * 1200);
            }
            const head = get('head');
            if (head && idleAction) {
                if (idleAction === 'look') {
                    head.rotation.y += Math.sin(t * 2) * 0.15;
                    head.rotation.x += Math.cos(t * 1.5) * 0.06;
                } else if (idleAction === 'tilt') {
                    head.rotation.z += Math.sin(t * 3) * 0.08;
                } else if (idleAction === 'nod') {
                    head.rotation.x += Math.sin(t * 4) * -0.08;
                } else if (idleAction === 'glance') {
                    head.rotation.y += Math.sin(t * 5) * 0.2;
                }
            }

            // Subtle leg weight shift
            const leftLeg = get('leftUpperLeg');
            const rightLeg = get('rightUpperLeg');
            if (leftLeg) leftLeg.rotation.x += Math.sin(t * 0.5) * 0.01;
            if (rightLeg) rightLeg.rotation.x += Math.sin(t * 0.5 + Math.PI) * 0.01;
        }

        // === DANCE ANIMATION ===
        if (isDancing) {
            danceTimer += dt;
            const d = danceTimer;

            const spine = get('spine');
            const chest = get('chest');
            const head = get('head');
            const leftArm = get('leftUpperArm');
            const rightArm = get('rightUpperArm');
            const leftForeArm = get('leftLowerArm');
            const rightForeArm = get('rightLowerArm');
            const leftLeg = get('leftUpperLeg');
            const rightLeg = get('rightUpperLeg');
            const leftToes = get('leftToes');
            const rightToes = get('rightToes');

            if (spine) { spine.rotation.z += Math.sin(d * 6) * 0.1; spine.rotation.x += Math.sin(d * 4) * 0.06; }
            if (chest) chest.rotation.x += Math.sin(d * 3) * 0.04;
            if (head) { head.rotation.z += Math.sin(d * 6) * 0.1; head.rotation.x += Math.sin(d * 4) * 0.06; }

            if (leftArm) { leftArm.rotation.z += Math.sin(d * 5) * 1.2; leftArm.rotation.x += Math.cos(d * 4) * 0.8; }
            if (leftForeArm) leftForeArm.rotation.x += Math.sin(d * 5) * 0.6;
            if (rightArm) { rightArm.rotation.z += Math.sin(d * 5 + 1) * 1.2; rightArm.rotation.x += Math.cos(d * 4 + 1) * 0.8; }
            if (rightForeArm) rightForeArm.rotation.x += Math.sin(d * 5 + 1) * 0.6;

            if (leftLeg) { leftLeg.rotation.x += Math.sin(d * 6) * 0.25; leftLeg.rotation.z += Math.sin(d * 3) * 0.06; }
            if (rightLeg) { rightLeg.rotation.x += Math.sin(d * 6 + Math.PI) * 0.25; rightLeg.rotation.z += Math.sin(d * 3 + Math.PI) * 0.06; }
            if (leftToes) leftToes.rotation.x += Math.max(0, Math.sin(d * 6) * 0.15);
            if (rightToes) rightToes.rotation.x += Math.max(0, Math.sin(d * 6 + Math.PI) * 0.15);
        }

        // === BLINKING ===
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

function onMouseMove(e) {
    if (!currentVRM || !currentVRM.humanoid || isDancing) return;
    const mx = (e.clientX / window.innerWidth) * 2 - 1;
    const my = -(e.clientY / window.innerHeight) * 2 + 1;
    const head = currentVRM.humanoid.getNormalizedBoneNode('head');
    if (head) {
        head.rotation.y += THREE.MathUtils.lerp(0, mx * 0.15, 0.04);
        head.rotation.x += THREE.MathUtils.lerp(0, my * 0.08, 0.04);
    }
}

export function startDance() {
    isDancing = true;
    danceTimer = 0;
    console.log('[VRM] Dance start');
    if (danceTimeout) clearTimeout(danceTimeout);
    danceTimeout = setTimeout(() => { isDancing = false; console.log('[VRM] Dance end'); }, 6000);
}

export function triggerMotion(name) {
    if (!currentVRM || !currentVRM.humanoid) return;
    const h = currentVRM.humanoid;
    const get = (n) => h.getNormalizedBoneNode(n);

    const anim = (bone, axis, target, dur) => {
        const node = get(bone);
        if (!node) return;
        const start = performance.now();
        const from = node.rotation[axis];
        (function step(now) {
            const p = Math.min((now - start) / dur, 1);
            node.rotation[axis] = from + (target - from) * p;
            if (p < 1) requestAnimationFrame(step);
            else setTimeout(() => restorePose(), 800);
        })(start);
    };

    const face = (expr, val, dur) => {
        if (!currentVRM.expressionManager) return;
        currentVRM.expressionManager.setValue(expr, val);
        setTimeout(() => currentVRM.expressionManager.setValue(expr, 0), dur);
    };

    if (name === 'dance') { startDance(); return; }

    // Restore pose first, then apply gesture
    restorePose();

    switch (name) {
        case 'wave': anim('rightUpperArm', 'z', -2.0, 400); anim('rightLowerArm', 'x', -1.0, 400); break;
        case 'nod': anim('head', 'x', -0.3, 250); break;
        case 'laugh': face('happy', 1, 600); anim('spine', 'z', 0.1, 150); break;
        case 'think': anim('head', 'y', 0.4, 500); anim('rightUpperArm', 'z', -0.8, 300); anim('rightLowerArm', 'x', -1.2, 300); break;
        case 'shrug': anim('leftUpperArm', 'x', 0.6, 300); anim('rightUpperArm', 'x', 0.6, 300); anim('leftUpperArm', 'z', 0.5, 300); anim('rightUpperArm', 'z', -0.5, 300); break;
        case 'tilt_head': anim('head', 'z', 0.4, 350); break;
        case 'surprise': face('surprised', 1, 500); anim('head', 'x', -0.25, 200); anim('leftUpperArm', 'z', 0.8, 200); anim('rightUpperArm', 'z', -0.8, 200); break;
        case 'blow_kiss': anim('rightUpperArm', 'z', -1.2, 300); anim('rightLowerArm', 'x', -1.5, 300); face('happy', 0.8, 800); break;
        case 'bow': anim('spine', 'x', 0.5, 500); anim('head', 'x', 0.3, 500); break;
        case 'stretch': anim('leftUpperArm', 'z', 1.5, 500); anim('rightUpperArm', 'z', -1.5, 500); anim('leftLowerArm', 'x', -0.3, 500); anim('rightLowerArm', 'x', -0.3, 500); break;
        case 'point': anim('rightUpperArm', 'z', -1.0, 300); anim('rightLowerArm', 'x', -0.5, 300); break;
    }
}

export function setMouth(v) {
    if (currentVRM && currentVRM.expressionManager) currentVRM.expressionManager.setValue('aa', v);
}
export function resetMouth() { setMouth(0); }
export function zoomIn() { targetDistance = Math.max(0.8, targetDistance - 0.4); targetCameraY = 0.9 + (targetDistance - 1.0) * 0.1; }
export function zoomOut() { targetDistance = Math.min(5.0, targetDistance + 0.4); targetCameraY = 0.9 + (targetDistance - 1.0) * 0.1; }
export function setBackground(hex) { if (scene) scene.background = new THREE.Color(hex); }
export function setBackgroundImage(url) {
    new THREE.TextureLoader().load(url, (tex) => { tex.colorSpace = THREE.SRGBColorSpace; scene.background = tex; }, undefined, (e) => console.error('[VRM] Bg image fail:', e));
}
