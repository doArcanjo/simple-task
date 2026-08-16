// Runs the API (watch mode) and the Vite dev server side by side; Ctrl-C kills both.
import { spawn } from 'node:child_process';

const api = spawn('node', ['--watch', 'server/server.js'], { stdio: 'inherit' });
const web = spawn('npx', ['vite'], { stdio: 'inherit' });

let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  api.kill();
  web.kill();
  process.exit(code ?? 0);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
api.on('exit', (code) => shutdown(code));
web.on('exit', (code) => shutdown(code));
