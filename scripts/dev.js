import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = path.join(root, 'backend');
const frontendDir = path.join(root, 'frontend');
const viteBin = path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js');

const children = [
  spawn(process.execPath, ['--env-file-if-exists=.env', 'src/server.js'], {
    cwd: backendDir,
    stdio: 'inherit',
  }),
  spawn(process.execPath, [viteBin], {
    cwd: frontendDir,
    stdio: 'inherit',
  }),
];

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(code), 300);
}

for (const child of children) {
  child.on('exit', (code) => {
    if (!stopping) shutdown(code ?? 0);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
