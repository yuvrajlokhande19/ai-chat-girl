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
let danceTimeout = null;

export function getVRM() { return currentVRM; }

export function init(el, modelPath) {
    container = el;
    if (renderer) { renderer.dispose(); container.innerHTML = ''; }
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.0, cameraDistance);
    camera.lookAt(0, 0.9, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    // Lighting
    scene.add(new THREE.DirectionalLight(0xffffff, 1.6).translateX(2).translateY(3).translateZ(2));
    scene.add(new THREE.DirectionalLight(0x94a3b8, 0.6).translateX(-2).translateY(2).translateZ(1));
    const rim = new THREE.DirectionalLight(0x22d3ee, 2.0);
    rim.position.set(0, 1, -3);
    scene.add(rim);
    scene.add(new THREE.AmbientLight(0x505050, 0.8));

    clock = new THREE.Clock();
    loadModel(modelPath);

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', lookAt);
    window.addEventListener('wheel', onZoom, { passive: false });
    let lastTouch = 0;
    window.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) lastTouch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    });
    window.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            targetDistance = Math.max(1.0, Math.min(5.0, targetDistance + (lastTouch - d) * 0.005));
            lastTouch = d;
        }
    });
}

function onZoom(e) {
    e.preventDefault();
    targetDistance = Math.max(1.0, Math.min(5.0, targetDistance + e.deltaY * 0.002));
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
                console.log('[VRM] Loaded OK');
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
        const getBone = (n) => h.getNormalizedBoneNode(n);

        // --- NATURAL HUMAN POSTURE ---
        const spine = getBone('spine');
        const chest = getBone('chest');
        const head = getBone('head');
        const leftArm = getBone('leftUpperArm');
        const leftForeArm = getBone('leftLowerArm');
        const rightArm = getBone('rightUpperArm');
        const rightForeArm = getBone('rightLowerArm');
        const leftLeg = getBone('leftUpperLeg');
        const rightLeg = getBone('rightUpperLeg');
        const leftToes = getBone('leftToes');
        const rightToes = getBone('rightToes');

        if (!isDancing) {
            // Spine: gentle sway + breathing
            if (spine) {
                spine.rotation.z = Math.sin(t * 0.7) * 0.02;
                spine.rotation.x = Math.sin(t * 1.8) * 0.02;
            }
            if (chest) chest.rotation.x = Math.sin(t * 1.5) * 0.01;

            // Arms: relaxed at sides, slight natural swing
            if (leftArm) {
                leftArm.rotation.z = 0.25 + Math.sin(t * 0.6) * 0.03;
                leftArm.rotation.x = 0.05 + Math.sin(t * 0.4) * 0.02;
                leftArm.rotation.y = -0.1;
            }
            if (leftForeArm) {
                leftForeArm.rotation.x = -0.15 + Math.sin(t * 0.5) * 0.02;
            }
            if (rightArm) {
                rightArm.rotation.z = -0.25 + Math.sin(t * 0.6 + 0.5) * 0.03;
                rightArm.rotation.x = 0.05 + Math.sin(t * 0.4 + 0.5) * 0.02;
                rightArm.rotation.y = 0.1;
            }
            if (rightForeArm) {
                rightForeArm.rotation.x = -0.15 + Math.sin(t * 0.5 + 0.5) * 0.02;
            }

            // Legs: subtle weight shift
            if (leftLeg) leftLeg.rotation.x = Math.sin(t * 0.5) * 0.015;
            if (rightLeg) rightLeg.rotation.x = Math.sin(t * 0.5 + Math.PI) * 0.015;
            if (leftToes) leftToes.rotation.x = 0;
            if (rightToes) rightToes.rotation.x = 0;

            // Idle head movements
            idleTimer += dt;
            if (idleTimer > 3 + Math.random() * 4) {
                idleTimer = 0;
                idleAction = ['look', 'tilt', 'nod'][Math.floor(Math.random() * 3)];
                setTimeout(() => { idleAction = null; }, 800 + Math.random() * 1200);
            }
            if (head && idleAction) {
                if (idleAction === 'look') {
                    head.rotation.y = Math.sin(t * 2) * 0.2;
                    head.rotation.x = Math.cos(t * 1.5) * 0.08;
                } else if (idleAction === 'tilt') {
                    head.rotation.z = Math.sin(t * 3) * 0.1;
                } else if (idleAction === 'nod') {
                    head.rotation.x = Math.sin(t * 4) * -0.1;
                }
            }
        }

        // --- DANCE ANIMATION (full body) ---
        if (isDancing) {
            danceTimer += dt;
            const dt2 = danceTimer;

            // Body bounce
            if (spine) {
                spine.rotation.z = Math.sin(dt2 * 6) * 0.12;
                spine.rotation.x = Math.sin(dt2 * 4) * 0.08;
            }
            if (chest) chest.rotation.x = Math.sin(dt2 * 3) * 0.06;

            // Head bob
            if (head) {
                head.rotation.z = Math.sin(dt2 * 6) * 0.12;
                head.rotation.x = Math.sin(dt2 * 4) * 0.08;
            }

            // Arms: rhythmic waving
            if (leftArm) {
                leftArm.rotation.z = 0.3 + Math.sin(dt2 * 5) * 1.5;
                leftArm.rotation.x = Math.cos(dt2 * 4) * 1.0;
            }
            if (leftForeArm) leftForeArm.rotation.x = -0.5 + Math.sin(dt2 * 5) * 0.8;
            if (rightArm) {
                rightArm.rotation.z = -0.3 + Math.sin(dt2 * 5 + 1) * 1.5;
                rightArm.rotation.x = Math.cos(dt2 * 4 + 1) * 1.0;
            }
            if (rightForeArm) rightForeArm.rotation.x = -0.5 + Math.sin(dt2 * 5 + 1) * 0.8;

            // Legs: stepping / knee bounce
            if (leftLeg) {
                leftLeg.rotation.x = Math.sin(dt2 * 6) * 0.3;
                leftLeg.rotation.z = Math.sin(dt2 * 3) * 0.08;
            }
            if (rightLeg) {
                rightLeg.rotation.x = Math.sin(dt2 * 6 + Math.PI) * 0.3;
                rightLeg.rotation.z = Math.sin(dt2 * 3 + Math.PI) * 0.08;
            }
            if (leftToes) leftToes.rotation.x = Math.max(0, Math.sin(dt2 * 6) * 0.2);
            if (rightToes) rightToes.rotation.x = Math.max(0, Math.sin(dt2 * 6 + Math.PI) * 0.2);
        }

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
        head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, mx * 0.2, 0.04);
        head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, my * 0.12, 0.04);
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
    const getBone = (n) => h.getNormalizedBoneNode(n);

    const anim = (bone, axis, target, dur) => {
        const node = getBone(bone);
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
        case 'wave': anim('rightUpperArm', 'z', -1.8, 400); anim('rightLowerArm', 'x', -0.8, 400); break;
        case 'nod': anim('head', 'x', -0.3, 250); break;
        case 'laugh': face('happy', 1, 600); anim('spine', 'z', 0.1, 150); break;
        case 'think': anim('head', 'y', 0.4, 500); anim('rightUpperArm', 'z', -0.8, 300); break;
        case 'shrug': anim('leftUpperArm', 'x', 0.5, 300); anim('rightUpperArm', 'x', 0.5, 300); break;
        case 'tilt_head': anim('head', 'z', 0.4, 350); break;
        case 'surprise': face('surprised', 1, 500); anim('head', 'x', -0.25, 200); break;
    }
}

export function setMouth(v) {
    if (currentVRM && currentVRM.expressionManager) currentVRM.expressionManager.setValue('aa', v);
}
export function resetMouth() { setMouth(0); }
export function zoomIn() { targetDistance = Math.max(1.0, targetDistance - 0.4); }
export function zoomOut() { targetDistance = Math.min(5.0, targetDistance + 0.4); }
export function setBackground(hex) { if (scene) scene.background = new THREE.Color(hex); }
