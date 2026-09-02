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
let idleActionTimer = 0;
let isDancing = false;
let danceTimer = 0;
let danceTimeout = null;

const IDLE_POSE = {
    leftUpperArm: { z: 1.45, y: 0.15, x: 0 },
    rightUpperArm: { z: -1.45, y: -0.15, x: 0 },
    leftLowerArm: { z: -0.3, x: -0.1 },
    rightLowerArm: { z: 0.3, x: -0.1 },
    leftHand: { z: 0.1 },
    rightHand: { z: -0.1 },
    head: { x: 0, y: 0, z: 0 },
    spine: { x: 0, z: 0 },
    chest: { x: 0 },
    hips: { z: 0 },
};

const IDLE_ACTIONS = ['breathe', 'hairTouch', 'dressGlance', 'weightShift', 'lookAround', 'fidget'];

function lerp(a, b, t) { return a + (b - a) * t; }

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

                // Use official VRMUtils.rotateVRM0 instead of manual rotation
                VRMUtils.rotateVRM0(vrm);

                const boneNames = Object.keys(vrm.humanoid.normalizedHumanBones);
                console.log('[VRM] Bones found:', boneNames);
                console.log('[VRM] Model ready');
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
    camera.lookAt(new THREE.Vector3(0, 1.1 + (cameraDistance - 1.0) * 0.05, 0));

    if (currentVRM && currentVRM.humanoid) {
        const h = currentVRM.humanoid;

        // Start with base A-pose
        const pose = JSON.parse(JSON.stringify(IDLE_POSE));

        // Always: subtle breathing
        pose.spine.x += Math.sin(t * 1.8) * 0.015;
        pose.spine.z += Math.sin(t * 0.7) * 0.008;
        pose.chest.x += Math.sin(t * 1.5) * 0.008;

        // Always: subtle arm sway
        pose.leftUpperArm.x += Math.sin(t * 0.5) * 0.02;
        pose.rightUpperArm.x += Math.sin(t * 0.5 + 1) * 0.02;

        // Always: subtle hand micro-movement
        pose.leftHand.z += Math.sin(t * 0.8) * 0.03;
        pose.rightHand.z += Math.sin(t * 0.8 + 0.5) * 0.03;

        // Pick random idle action periodically
        if (!isDancing) {
            idleTimer += dt;
            if (idleTimer > 4 + Math.random() * 6) {
                idleTimer = 0;
                idleAction = IDLE_ACTIONS[Math.floor(Math.random() * IDLE_ACTIONS.length)];
                idleActionTimer = 0;
            }

            if (idleAction) {
                idleActionTimer += dt;
                const at = Math.min(idleActionTimer / 0.8, 1);

                switch (idleAction) {
                    case 'hairTouch':
                        // Right hand raises toward head
                        if (at < 1) {
                            pose.rightUpperArm.z = lerp(-1.45, -2.0, at);
                            pose.rightUpperArm.x = lerp(0, 0.5, at);
                            pose.rightLowerArm.x = lerp(-0.1, -1.5, at);
                            pose.head.z = lerp(0, 0.08, at);
                        } else {
                            pose.rightUpperArm.z = -2.0;
                            pose.rightUpperArm.x = 0.5;
                            pose.rightLowerArm.x = -1.5;
                            pose.head.z = 0.08;
                        }
                        if (idleActionTimer > 3) { idleAction = null; }
                        break;

                    case 'dressGlance':
                        // Head tilts down, slight lean
                        if (at < 1) {
                            pose.head.x = lerp(0, 0.25, at);
                            pose.spine.x = lerp(0, 0.08, at);
                        } else {
                            pose.head.x = 0.25 + Math.sin(t * 0.5) * 0.03;
                            pose.spine.x = 0.08;
                        }
                        if (idleActionTimer > 3.5) { idleAction = null; }
                        break;

                    case 'weightShift':
                        // Slight hip sway
                        if (at < 1) {
                            pose.hips.z = lerp(0, 0.06, at);
                            pose.head.z = lerp(0, -0.05, at);
                        } else {
                            pose.hips.z = 0.06 * Math.sin(t * 0.8);
                            pose.head.z = -0.05 * Math.sin(t * 0.8);
                        }
                        if (idleActionTimer > 4) { idleAction = null; }
                        break;

                    case 'lookAround':
                        // Head looks around slowly
                        pose.head.y = Math.sin(t * 0.6) * 0.15;
                        pose.head.x = Math.cos(t * 0.4) * 0.05;
                        if (idleActionTimer > 5) { idleAction = null; }
                        break;

                    case 'fidget':
                        // Small arm/hand adjustment
                        pose.leftUpperArm.z = lerp(1.45, 1.3, Math.sin(t * 3) * 0.5 + 0.5);
                        pose.rightUpperArm.z = lerp(-1.45, -1.3, Math.sin(t * 3 + 1) * 0.5 + 0.5);
                        if (idleActionTimer > 2.5) { idleAction = null; }
                        break;
                }
            }
        }

        // Apply pose with smooth interpolation
        const speed = 0.12;
        const bones = [
            ['leftUpperArm', pose.leftUpperArm],
            ['rightUpperArm', pose.rightUpperArm],
            ['leftLowerArm', pose.leftLowerArm],
            ['rightLowerArm', pose.rightLowerArm],
            ['leftHand', pose.leftHand],
            ['rightHand', pose.rightHand],
            ['head', pose.head],
            ['spine', pose.spine],
            ['chest', pose.chest],
            ['hips', pose.hips],
        ];

        for (const [name, target] of bones) {
            const bone = h.getNormalizedBoneNode(name);
            if (!bone) continue;
            if (target.x !== undefined) bone.rotation.x += (target.x - bone.rotation.x) * speed;
            if (target.y !== undefined) bone.rotation.y += (target.y - bone.rotation.y) * speed;
            if (target.z !== undefined) bone.rotation.z += (target.z - bone.rotation.z) * speed;
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
        head.rotation.y += mx * 0.003;
        head.rotation.x += my * 0.002;
    }
}

export function startDance() {
    isDancing = true;
    danceTimer = 0;
    if (danceTimeout) clearTimeout(danceTimeout);
    danceTimeout = setTimeout(() => { isDancing = false; }, 6000);
}

export function triggerMotion(name) {
    if (!currentVRM || !currentVRM.humanoid) return;
    const h = currentVRM.humanoid;

    const anim = (bone, axis, target, dur) => {
        const node = h.getNormalizedBoneNode(bone);
        if (!node) return;
        const start = performance.now();
        const from = node.rotation[axis];
        (function step(now) {
            const p = Math.min((now - start) / dur, 1);
            node.rotation[axis] = from + (target - from) * p;
            if (p < 1) requestAnimationFrame(step);
        })(start);
    };

    const face = (expr, val, dur) => {
        if (!currentVRM.expressionManager) return;
        currentVRM.expressionManager.setValue(expr, val);
        setTimeout(() => currentVRM.expressionManager.setValue(expr, 0), dur);
    };

    if (name === 'dance') { startDance(); return; }

    switch (name) {
        case 'wave': anim('rightUpperArm', 'x', 2.5, 400); anim('rightLowerArm', 'z', -1.0, 400); break;
        case 'nod': anim('head', 'x', -0.3, 250); break;
        case 'laugh': face('happy', 1, 600); anim('spine', 'z', 0.1, 150); break;
        case 'think': anim('head', 'y', 0.4, 500); anim('rightUpperArm', 'x', 1.2, 300); anim('rightLowerArm', 'z', -1.2, 300); break;
        case 'shrug': anim('leftUpperArm', 'y', 0.6, 300); anim('rightUpperArm', 'y', 0.6, 300); break;
        case 'tilt_head': anim('head', 'z', 0.4, 350); break;
        case 'surprise': face('surprised', 1, 500); anim('head', 'x', -0.25, 200); break;
        case 'blow_kiss': anim('rightUpperArm', 'x', 1.8, 300); anim('rightLowerArm', 'z', -1.5, 300); face('happy', 0.8, 800); break;
        case 'bow': anim('spine', 'x', 0.5, 500); anim('head', 'x', 0.3, 500); break;
        case 'stretch': anim('leftUpperArm', 'z', -2.5, 500); anim('rightUpperArm', 'x', 2.5, 500); break;
        case 'point': anim('rightUpperArm', 'x', 2.0, 300); anim('rightLowerArm', 'z', -0.5, 300); break;
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
