import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const packageNames = ['core', 'reference', 'vue', 'react'];
const lock = JSON.parse(await readFile(join(repositoryRoot, 'package-lock.json'), 'utf8'));

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}\n${stdout}\n${stderr}`));
    });
  });
}

function lockedVersion(name) {
  const version = lock.packages[`node_modules/${name}`]?.version;
  assert.equal(typeof version, 'string', `Missing locked version for ${name}`);
  return version;
}

async function absent(path) {
  try { await access(path); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  assert.fail(`Unexpected framework in isolated consumer: ${path}`);
}

const runtimePrelude = `
import assert from 'node:assert/strict';
import { createAgentSession, createAgentActions, projectAgentView, AdapterDeliveryError } from '@agentdown/core';
import { createReferenceAdapter } from '@agentdown/reference';
assert.equal(typeof window, 'undefined');
const calls = { execute: 0, events: 0, fetch: 0 };
const adapter = {
  id: 'package-consumer', version: '1', capabilities: {},
  async execute() { calls.execute++; return { confirmation: 'transport' }; },
  async *events() { calls.events++; },
};
const reference = createReferenceAdapter({ endpoint: 'http://unused.invalid', fetch: async () => {
  calls.fetch++; throw new Error('Unexpected SSR transport request');
} });
assert.equal(typeof reference.execute, 'function');
assert.equal(typeof reference.events, 'function');
assert.equal(typeof AdapterDeliveryError, 'function');
const session = createAgentSession({ conversationId: 'consumer', adapter });
assert.equal(projectAgentView(session.getSnapshot()).conversationId, 'consumer');
assert.equal(typeof createAgentActions(session).send, 'function');
session.dispose();
`;

const runtimeChecks = {
  core: '',
  vue: `
import { createSSRApp, defineComponent, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { AgentProvider, useAgentSession, useAgentSelector } from '@agentdown/vue';
assert.equal(typeof AgentProvider, 'object');
assert.equal(typeof useAgentSelector, 'function');
let binding;
const app = createSSRApp(defineComponent({ setup() {
  binding = useAgentSession({ conversationId: 'vue-ssr', adapter });
  return () => h('span', binding.snapshot.value.conversationId + ':' + binding.snapshot.value.messages.length);
} }));
assert.equal(await renderToString(app), '<span>vue-ssr:0</span>');
binding.session.dispose();
`,
  react: `
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { AgentProvider, useAgentSession, useAgentSelector } from '@agentdown/react';
assert.equal(typeof AgentProvider, 'function');
assert.equal(typeof useAgentSelector, 'function');
let binding;
function Probe() {
  binding = useAgentSession({ conversationId: 'react-ssr', adapter });
  return createElement('span', null, binding.snapshot.conversationId + ':' + binding.snapshot.messages.length);
}
assert.equal(renderToString(createElement(Probe)), '<span>react-ssr:0</span>');
binding.session.dispose();
`,
};

const typePrelude = `
import { createAgentSession, createAgentActions, projectAgentView, type AgentAdapter, type AgentViewSnapshot } from '@agentdown/core';
import { createReferenceAdapter, type ReferenceAdapter, type ReferenceAdapterOptions } from '@agentdown/reference';
const options: ReferenceAdapterOptions = { endpoint: 'http://unused.invalid' };
const reference: ReferenceAdapter = createReferenceAdapter(options);
const adapter: AgentAdapter = reference;
const session = createAgentSession({ conversationId: 'type-consumer', adapter });
const view: AgentViewSnapshot = projectAgentView(session.getSnapshot());
const actions = createAgentActions(session);
void [view, actions];
`;

const tempRoot = await mkdtemp(join(tmpdir(), 'agentdown-next-consumer-'));
try {
  const tarballs = {};
  for (const name of packageNames) {
    const root = join(repositoryRoot, 'packages', name);
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    assert.equal(manifest.private, true, `${name} must remain private`);
    assert.equal(manifest.name, `@agentdown/${name}`);
    if (name === 'core' || name === 'reference') {
      for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
        for (const dependency of Object.keys(manifest[field] ?? {})) {
          assert.ok(!/^(?:vue|react|react-dom|@vue\/|@types\/(?:vue|react))/.test(dependency), `${name} depends on UI framework ${dependency}`);
        }
      }
    }
    const { stdout } = await run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', tempRoot], root);
    const [report] = JSON.parse(stdout);
    const files = report.files.map(file => file.path);
    assert.ok(files.includes('dist/index.js'), `${name}: missing runtime export`);
    assert.ok(files.includes('dist/index.d.ts'), `${name}: missing declaration export`);
    assert.ok(files.every(path => path.startsWith('dist/') || ['package.json', 'README.md', 'LICENSE', 'LICENSE.md'].includes(path)), `${name}: unexpected source or legacy files in tarball`);
    tarballs[name] = join(tempRoot, report.filename);
  }

  for (const kind of ['core', 'vue', 'react']) {
    const consumer = join(tempRoot, kind);
    await mkdir(consumer);
    const dependencies = {
      '@agentdown/core': `file:${tarballs.core}`,
      '@agentdown/reference': `file:${tarballs.reference}`,
      typescript: lockedVersion('typescript'),
    };
    if (kind !== 'core') dependencies[`@agentdown/${kind}`] = `file:${tarballs[kind]}`;
    for (const name of kind === 'vue' ? ['vue'] : kind === 'react' ? ['react', 'react-dom', '@types/react', '@types/react-dom'] : []) {
      dependencies[name] = lockedVersion(name);
    }
    await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: `next-${kind}-consumer`, private: true, type: 'module', dependencies }, null, 2));
    const install = ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false'];
    try { await run('npm', [...install, '--offline'], consumer); }
    catch (error) {
      // npm can report ERESOLVE ("framework@undefined") when offline peer
      // metadata is unavailable. Retry with the normal resolver, never --force.
      if (!/ENOTCACHED|ERESOLVE/.test(error.message)) throw error;
      process.stdout.write(`${kind}: offline resolution unavailable; retrying with the normal resolver and verification.\n`);
      await run('npm', [...install, '--prefer-offline'], consumer);
    }
    for (const other of kind === 'core' ? ['vue', 'react', 'react-dom'] : kind === 'vue' ? ['react', 'react-dom'] : ['vue']) {
      await absent(join(consumer, 'node_modules', other));
    }
    await writeFile(join(consumer, 'smoke.mjs'), runtimePrelude + runtimeChecks[kind] + `\nassert.deepEqual(calls, { execute: 0, events: 0, fetch: 0 });\n`);
    await run(process.execPath, ['smoke.mjs'], consumer);
    const bindingTypes = kind === 'core' ? '' : `
import { AgentProvider, useAgentSession, useAgentSelector, type AgentSessionBinding } from '@agentdown/${kind}';
function checkBinding() {
  const binding: AgentSessionBinding = useAgentSession(session);
  const selected = useAgentSelector(snapshot => snapshot.conversationId, session);
  void [AgentProvider, binding.actions.send, selected];
}
void checkBinding;
`;
    await writeFile(join(consumer, 'types.ts'), typePrelude + bindingTypes);
    await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: false, lib: ['ES2022', 'DOM', 'DOM.Iterable'] }, include: ['types.ts'] }));
    await run(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], consumer);
    process.stdout.write(`PASS ${kind}: isolated tarball imports, declarations, framework boundary and passive${kind === 'core' ? ' core' : ' SSR'}.\n`);
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
