import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { requireModelKey } from './start-demo.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

try { requireModelKey(); }
catch (error) { console.error(error.message); process.exit(1); }

const npmPath = process.env.npm_execpath;
const child = spawn(npmPath ? process.execPath : 'npm', npmPath ? [npmPath, 'run', 'build:live'] : ['run', 'build:live'], {
  cwd: root,
  stdio: 'inherit',
  detached: process.platform !== 'win32',
  // The built UI and API share the root origin in this single-service demo.
  env: { ...process.env, PROTOTYPE_BASE: '/', VITE_AGENT_MODE: 'live', VITE_BROWSER_DEMO: 'false' },
});
let interrupted = false;
const stopBuild = () => {
  interrupted = true;
  // Stop the build's compiler children together instead of leaving them running.
  if (process.platform !== 'win32' && child.pid) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  } else child.kill('SIGTERM');
};
process.once('SIGINT', stopBuild);
process.once('SIGTERM', stopBuild);
let result;
try {
  result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
} catch {
  console.error('Could not start the live UI build. Install dependencies with npm ci first.');
  process.exit(1);
}
process.removeListener('SIGINT', stopBuild);
process.removeListener('SIGTERM', stopBuild);
if (interrupted || result.signal) process.exit(130);
if (result.code !== 0) process.exit(result.code ?? 1);

// Reuse the hosting startup and its strict live-build checks; do not start Vite.
const server = spawn(process.execPath, ['scripts/start-demo.mjs'], { cwd: root, stdio: 'inherit', env: process.env });
let stopping = false;
const stopServer = () => { if (!stopping) { stopping = true; server.kill('SIGTERM'); } };
process.once('SIGINT', stopServer);
process.once('SIGTERM', stopServer);
server.once('error', () => { console.error('Could not start the real-model demo server.'); process.exitCode = 1; });
server.once('exit', (code) => { process.exitCode = stopping ? 0 : code ?? 1; });
