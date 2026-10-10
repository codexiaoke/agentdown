import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createModelServer } from '../examples/model-server/server.mjs';
import { createDeepSeekProvider } from '../examples/model-server/deepseek.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function requireModelKey(environment = process.env) {
  if (typeof environment.DEEPSEEK_API_KEY !== 'string' || !environment.DEEPSEEK_API_KEY.trim()) {
    throw new Error('DEEPSEEK_API_KEY is required. Configure the model key on this server before starting the real demo.');
  }
}

/** A normal prototype/browser build cannot start the real-model demo. */
export async function validateLiveDemoBuild(rootDirectory = projectRoot) {
  const directory = resolve(rootDirectory, 'dist-next/prototype');
  let marker;
  try { marker = JSON.parse(await readFile(resolve(directory, 'agentdown-mode.json'), 'utf8')); }
  catch { throw new Error('A verified live build is required. Run npm run build:live before starting this demo.'); }
  if (marker?.schemaVersion !== 1 || marker?.mode !== 'live') {
    throw new Error('This build is not a real-model UI. Run npm run build:live; browser fixture builds are rejected.');
  }
  for (const entry of ['index.html', 'vue.html', 'react.html']) {
    let present = false;
    try { present = (await stat(resolve(directory, entry))).isFile(); } catch { /* reported below */ }
    if (!present) throw new Error('The live UI build is incomplete. Run npm run build:live again.');
  }
  return directory;
}

function originsFromEnvironment(environment) {
  const origins = (environment.AGENTDOWN_CORS_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  if (environment.RENDER_EXTERNAL_URL) {
    let external;
    try { external = new URL(environment.RENDER_EXTERNAL_URL); } catch { throw new Error('RENDER_EXTERNAL_URL must be a valid HTTPS deployment URL.'); }
    if (external.protocol !== 'https:' || external.username || external.password || external.search || external.hash) {
      throw new Error('RENDER_EXTERNAL_URL must be a valid HTTPS deployment URL.');
    }
    origins.push(external.origin);
  }
  return [...new Set(origins)];
}

/** Starts one same-origin HTTP service. Constructing it makes no model request. */
export async function startLiveDemo({ environment = process.env, rootDirectory = projectRoot } = {}) {
  requireModelKey(environment);
  const staticDir = await validateLiveDemoBuild(rootDirectory);
  const host = environment.HOST ?? '127.0.0.1';
  const port = Number(environment.PORT ?? '8011');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer between 0 and 65535.');
  const provider = createDeepSeekProvider({
    apiKey: environment.DEEPSEEK_API_KEY,
    ...(environment.DEEPSEEK_BASE_URL ? { baseUrl: environment.DEEPSEEK_BASE_URL } : {}),
    ...(environment.DEEPSEEK_MODEL ? { model: environment.DEEPSEEK_MODEL } : {}),
  });
  const server = createModelServer({
    provider,
    staticDir,
    accessToken: environment.AGENTDOWN_ACCESS_TOKEN,
    dataDir: resolve(rootDirectory, environment.AGENTDOWN_DATA_DIR ?? '.agentdown-data'),
    corsOrigins: originsFromEnvironment(environment),
  });
  await new Promise((resolveStarted, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.removeListener('error', reject); resolveStarted(); });
  });
  return server;
}

function shutdownHandlers(server) {
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => { server.closeAllConnections(); process.exit(0); }, 10_000);
    deadline.unref();
    server.close(() => { clearTimeout(deadline); process.exit(0); });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const server = await startLiveDemo();
    shutdownHandlers(server);
    const port = server.address().port;
    const host = process.env.HOST ?? '127.0.0.1';
    if (['127.0.0.1', 'localhost', '::1'].includes(host)) console.log(`Agentdown real-model demo: http://localhost:${port}/`);
    else console.log(`Agentdown real-model demo listening on port ${port}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
