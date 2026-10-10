import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { startLiveDemo, validateLiveDemoBuild } from './start-demo.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
async function buildFixture(context, marker) {
  const directory = await mkdtemp(join(tmpdir(), 'agentdown-demo-start-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const assets = join(directory, 'dist-next/prototype'); await mkdir(assets, { recursive: true });
  for (const entry of ['index.html', 'vue.html', 'react.html']) await writeFile(join(assets, entry), '<p>startup test UI</p>');
  if (marker !== undefined) await writeFile(join(assets, 'agentdown-mode.json'), JSON.stringify(marker));
  return directory;
}

test('one-command demo fails before build or startup when the server key is missing', () => {
  const result = spawnSync(process.execPath, ['scripts/demo-live.mjs'], { cwd: root, env: { ...process.env, DEEPSEEK_API_KEY: '', npm_execpath: '/does-not-exist/test-build-must-not-run' }, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 1); assert.match(result.stderr, /DEEPSEEK_API_KEY is required/); assert.equal(result.stdout, ''); assert.equal(result.stderr.includes('test-build-must-not-run'), false);
});

test('missing and fixture build markers are rejected before constructing a model service', async (context) => {
  const missing = await buildFixture(context);
  await assert.rejects(validateLiveDemoBuild(missing), /verified live build is required/);
  const fixture = await buildFixture(context, { schemaVersion: 1, mode: 'browser' });
  await assert.rejects(startLiveDemo({ rootDirectory: fixture, environment: { DEEPSEEK_API_KEY: 'test-only-no-model-call', PORT: '0' } }), /browser fixture builds are rejected/);
});

test('verified live startup serves one origin with protected APIs and accepts the exact Render HTTPS origin without a model call', async (context) => {
  const rootDirectory = await buildFixture(context, { schemaVersion: 1, mode: 'live' });
  const server = await startLiveDemo({ rootDirectory, environment: { DEEPSEEK_API_KEY: 'test-only-no-model-call', DEEPSEEK_BASE_URL: 'http://127.0.0.1:9', AGENTDOWN_ACCESS_TOKEN: 'demo-start-token', HOST: '127.0.0.1', PORT: '0', RENDER_EXTERNAL_URL: 'https://agentdown-start-test.onrender.com/' } });
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal(await (await fetch(url)).text(), '<p>startup test UI</p>');
  const health = await (await fetch(`${url}/health`)).json(); assert.equal(health.protocol, 'agentdown-model/v1'); assert.equal(health.authenticated, true);
  assert.equal((await fetch(`${url}/api/operations/test`)).status, 401);
  const preflight = await fetch(`${url}/api/operations`, { method: 'OPTIONS', headers: { origin: 'https://agentdown-start-test.onrender.com', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization' } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://agentdown-start-test.onrender.com');
  assert.equal((await fetch(`${url}/api/operations`, { method: 'OPTIONS', headers: { origin: 'https://agentdown-start-test.onrender.com.evil.example' } })).status, 403);
});

test('verified startup still refuses a public bind without the separate demo token', async (context) => {
  const rootDirectory = await buildFixture(context, { schemaVersion: 1, mode: 'live' });
  await assert.rejects(startLiveDemo({ rootDirectory, environment: { DEEPSEEK_API_KEY: 'test-only-no-model-call', HOST: '0.0.0.0', PORT: '0' } }), /Public binding requires AGENTDOWN_ACCESS_TOKEN/);
});
