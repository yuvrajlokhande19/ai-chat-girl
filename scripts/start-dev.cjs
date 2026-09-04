// start-dev.cjs — one command to turn on EVERYTHING:
//   npm run dev
//  -> starts the Hermes bridge (1923/9123) AND the vite dev server together.
//    Hermes connects to the girl so Arohi can manage the laptop right away.

const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const bridge = spawn(process.execPath, [path.join(root, 'bridge', 'hermes-bridge.cjs')], {
  cwd: root, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true,
});
const viteProc = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')], {
  cwd: root, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true,
});

console.log('[start-dev] Hermes bridge + Vite dev server started together.');
console.log('[start-dev] Arohi is ready: the Enter button will also connect Hermes.');

function shutdown() {
  try { bridge.kill(); } catch (e) {}
  try { viteProc.kill(); } catch (e) {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
bridge.on('exit', (code) => {
  if (viteProc.exitCode == null) console.log('[start-dev] Hermes bridge stopped (code ' + code + ').');
});
viteProc.on('exit', (code) => {
  console.log('[start-dev] Vite stopped (code ' + code + ').');
  try { bridge.kill(); } catch (e) {}
  process.exit(code || 0);
});