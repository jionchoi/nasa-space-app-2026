// Copies MediaPipe's WebAssembly files from node_modules into public/models/wasm, so unresponsive detection
// loads everything from our own server and works with no internet. Runs after every `npm install` (postinstall).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The frontend folder (this script lives in frontend/scripts).
const frontend = join(dirname(fileURLToPath(import.meta.url)), '..');

// Where npm put the files, and where Vite serves static files from (/models/wasm in the browser).
const from = join(frontend, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const to = join(frontend, 'public', 'models', 'wasm');

// If the package is not installed yet, say so and stop without failing the install.
if (!existsSync(from)) {
  console.warn('[copy-mediapipe-wasm] @mediapipe/tasks-vision is not installed; nothing copied.');
  process.exit(0);
}

// Copy the whole folder, replacing older copies.
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true, force: true });
console.log(`[copy-mediapipe-wasm] copied ${from} -> ${to}`);
