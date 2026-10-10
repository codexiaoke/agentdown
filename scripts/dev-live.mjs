import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
if (!process.env.DEEPSEEK_API_KEY) {
  console.error('DEEPSEEK_API_KEY is required. Configure it on the backend before starting live mode.');
  process.exit(1);
}
const backendPort = process.env.AGENTDOWN_MODEL_PORT ?? '8011';
const serverEnvironment = {
  ...process.env, HOST: '127.0.0.1', PORT: backendPort,
  AGENTDOWN_CORS_ORIGINS: [process.env.AGENTDOWN_CORS_ORIGINS, 'http://localhost:5174', 'http://127.0.0.1:5174'].filter(Boolean).join(','),
};
const webEnvironment = {
  ...process.env, VITE_AGENT_MODE: 'live', VITE_BROWSER_DEMO: 'false',
  AGENTDOWN_BACKEND_URL: `http://127.0.0.1:${backendPort}`,
};
const processes = [
  spawn(process.execPath, ['examples/model-server/server.mjs'], { cwd: root, env: serverEnvironment, stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'examples/prototype/vite.config.ts'], { cwd: root, env: webEnvironment, stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const child of processes) {
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code ?? 1); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
console.log('Agentdown live API workspace: http://localhost:5174/');
