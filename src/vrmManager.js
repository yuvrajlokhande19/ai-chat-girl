import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

let scene, camera, renderer, currentVRM, clock, container;
let cameraDistance = 2.2;
let targetDistance = 2.2;
const blink = { timer: 0, next: 3, val: 0, phase: 'open' };
let idleTimer = 0;
let idleAction = null;
let isDancing = false;
let danceTimer = 0;

export function getVRM() { return currentVRM; }

export function init(el, modelPath) {
    container = el;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.2, cameraDistance);
    camera.lookAt(0, 1.0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    // Studio lighting
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(2, 3, 2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x94a3b8, 0.6);
    fill.position.set(-2, 2, 1);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0x22d3ee, 2.5);
    rim.position.set(0, 1, -3);
    scene.add(rim);
    scene.add(new THREE.AmbientLight(0x404040, 0.6));

    clock = new THREE.Clock();
    loadModel(modelPath);

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', lookAt);
    window.addEventListener('wheel', onZoom, { passive: false });
    // Touch zoom
    let lastTouchDist = 0;
    window.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            lastTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        }
    });
    window.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            targetDistance += (lastTouchDist - d) * 0.005;
            targetDistance = Math.max(1.0, Math.min(5.0, targetDistance));
            lastTouchDist = d;
        }
    });
}

function onZoom(e) {
    e.preventDefault();
    targetDistance += e.deltaY * 0.002;
    targetDistance = Math.max(1.0, Math.min(5.0, targetDistance));
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
                console.log('[VRM] Model loaded');
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

    // Smooth zoom
    cameraDistance += (targetDistance - cameraDistance) * 0.08;
    camera.position.z = cameraDistance;

    if (currentVRM && currentVRM.humanoid) {
        const h = currentVRM.humanoid;

        // --- HUMAN-LIKE IDLE: Weight shift, sway, breathing ---
        const spine = h.getNormalizedBoneNode('spine');
        const chest = h.getNormalizedBoneNode('chest');
        const leftArm = h.getNormalizedBoneNode('leftUpperArm');
        const rightArm = h.getNormalizedBoneNode('rightUpperArm');
        const leftLeg = h.getNormalizedBoneNode('leftUpperLeg');
        const rightLeg = h.getNormalizedBoneNode('rightUpperLeg');

        // Natural body sway (weight shift left/right)
        if (spine) {
            spine.rotation.z = Math.sin(t * 0.8) * 0.03;
            spine.rotation.x = Math.sin(t * 1.8) * 0.02; // breathing
        }
        if (chest) {
            chest.rotation.x = Math.sin(t * 1.6) * 0.015;
        }

        // Arm micro-movements (arms hanging naturally)
        if (leftArm) {
            leftArm.rotation.z = 0.3 + Math.sin(t * 0.7) * 0.04;
            leftArm.rotation.x = Math.sin(t * 0.5) * 0.03;
        }
        if (rightArm) {
            rightArm.rotation.z = -0.3 + Math.sin(t * 0.7 + 1) * 0.04;
            rightArm.rotation.x = Math.sin(t * 0.5 + 1.5) * 0.03;
        }

        // Subtle leg weight shift
        if (leftLeg) leftLeg.rotation.x = Math.sin(t * 0.6) * 0.02;
        if (rightLeg) rightLeg.rotation.x = Math.sin(t * 0.6 + Math.PI) * 0.02;

        // --- BLINKING ---
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

        // --- DANCE ANIMATION ---
        if (isDancing) {
            danceTimer += dt;
            if (spine) spine.rotation.z = Math.sin(danceTimer * 4) * 0.15;
            if (spine) spine.rotation.x = Math.sin(danceTimer * 3) * 0.1;
            if (leftArm) {
                leftArm.rotation.z = 0.3 + Math.sin(danceTimer * 5) * 1.2;
                leftArm.rotation.x = Math.cos(danceTimer * 4) * 0.8;
            }
            if (rightArm) {
                rightArm.rotation.z = -0.3 + Math.sin(danceTimer * 5 + 1) * 1.2;
                rightArm.rotation.x = Math.cos(danceTimer * 4 + 1) * 0.8;
            }
            // Head bob
            const head = h.getNormalizedBoneNode('head');
            if (head) {
                head.rotation.z = Math.sin(danceTimer * 4) * 0.15;
                head.rotation.x = Math.sin(danceTimer * 3) * 0.1;
            }
        } else {
            // --- RANDOM IDLE ACTIONS ---
            idleTimer += dt;
            if (idleTimer > 3 + Math.random() * 4) {
                idleTimer = 0;
                const actions = ['look', 'tilt', 'nod', 'sway'];
                idleAction = actions[Math.floor(Math.random() * actions.length)];
                setTimeout(() => { idleAction = null; }, 800 + Math.random() * 1500);
            }

            if (idleAction) {
                const head = h.getNormalizedBoneNode('head');
                if (head) {
                    if (idleAction === 'look') {
                        head.rotation.y = Math.sin(t * 2) * 0.2;
                        head.rotation.x = Math.cos(t * 1.5) * 0.1;
                    } else if (idleAction === 'tilt') {
                        head.rotation.z = Math.sin(t * 3) * 0.12;
                    } else if (idleAction === 'nod') {
                        head.rotation.x = Math.sin(t * 4) * -0.12;
                    } else if (idleAction === 'sway') {
                        head.rotation.y = Math.sin(t * 1.2) * 0.15;
                    }
                }
            }
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

function lookAt(e) {
    if (!currentVRM || !currentVRM.humanoid || isDancing) return;
    const mx = (e.clientX / window.innerWidth) * 2 - 1;
    const my = -(e.clientY / window.innerHeight) * 2 + 1;
    const head = currentVRM.humanoid.getNormalizedBoneNode('head');
    if (head) {
        head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, mx * 0.25, 0.04);
        head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, my * 0.15, 0.04);
    }
}

export function startDance() {
    isDancing = true;
    danceTimer = 0;
    console.log('[VRM] Dance started');
    setTimeout(() => { isDancing = false; console.log('[VRM] Dance ended'); }, 5000);
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
            else setTimeout(() => { node.rotation[axis] = from; }, 800);
        })(start);
    };

    const face = (expr, val, dur) => {
        if (!currentVRM.expressionManager) return;
        currentVRM.expressionManager.setValue(expr, val);
        setTimeout(() => currentVRM.expressionManager.setValue(expr, 0), dur);
    };

    if (name === 'dance') { startDance(); return; }

    switch (name) {
        case 'wave': anim('rightUpperArm', 'z', -1.5, 400); break;
        case 'nod': anim('head', 'x', -0.3, 250); break;
        case 'laugh': face('happy', 1, 600); anim('spine', 'z', 0.1, 150); break;
        case 'think': anim('head', 'y', 0.4, 500); break;
        case 'shrug': anim('leftUpperArm', 'x', 0.5, 300); anim('rightUpperArm', 'x', 0.5, 300); break;
        case 'tilt_head': anim('head', 'z', 0.4, 350); break;
        case 'surprise': face('surprised', 1, 500); anim('head', 'x', -0.25, 200); break;
    }
}

export function setMouth(v) {
    if (currentVRM && currentVRM.expressionManager) {
        currentVRM.expressionManager.setValue('aa', v);
    }
}
export function resetMouth() { setMouth(0); }

export function zoomIn() {
    targetDistance = Math.max(1.0, targetDistance - 0.4);
    console.log('[VRM] Zoom in:', targetDistance.toFixed(1));
}
export function zoomOut() {
    targetDistance = Math.min(5.0, targetDistance + 0.4);
    console.log('[VRM] Zoom out:', targetDistance.toFixed(1));
}
export function setBackground(hex) {
    if (scene) scene.background = new THREE.Color(hex);
    console.log('[VRM] Background:', hex);
}
