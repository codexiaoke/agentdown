import { spawn } from 'node:child_process';
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const examples = ['vue-ag-ui', 'vue-a2ui', 'vue-ag-ui-a2ui'];

function run(command, args, cwd, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
    }
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error([
        `${command} ${args.join(' ')} exited with code ${code}.`,
        stdout,
        stderr
      ].filter(Boolean).join('\n')));
    });
  });
}

async function linkWorkspaceDependencies(targetNodeModules) {
  const workspaceNodeModules = join(repositoryRoot, 'node_modules');
  const entries = await readdir(workspaceNodeModules, { withFileTypes: true });
  await mkdir(targetNodeModules, { recursive: true });

  for (const entry of entries) {
    if (entry.name === 'agentdown') continue;
    await symlink(
      join(workspaceNodeModules, entry.name),
      join(targetNodeModules, entry.name),
      entry.isDirectory() ? 'dir' : 'file'
    );
  }
}

function shouldCopyExample(source, exampleRoot) {
  const path = relative(exampleRoot, source);
  return !path.split('/').some((part) => part === 'node_modules' || part === 'dist');
}

async function assertPackagedFiles(packageRoot) {
  const expectedFiles = [
    'CHANGELOG.md',
    'SECURITY.md',
    'dist/index.js',
    'dist/index.d.ts',
    'dist/ag-ui.js',
    'dist/entries/ag-ui.d.ts',
    'dist/a2ui.js',
    'dist/entries/a2ui.d.ts',
    'dist/ag-ui-a2ui.js',
    'dist/entries/ag-ui-a2ui.d.ts',
    'dist/style.css'
  ];
  await Promise.all(expectedFiles.map((path) => access(join(packageRoot, path))));

  const a2uiEntry = await readFile(join(packageRoot, 'dist/entries/a2ui.d.ts'), 'utf8');
  if (!a2uiEntry.includes("../a2ui/index")) {
    throw new Error('Packaged A2UI declaration entry must target the explicit directory index.');
  }
}

async function assertRuntimeExports(tempRoot) {
  const smokePath = join(tempRoot, 'smoke.mjs');
  await writeFile(smokePath, `
const core = await import('agentdown');
const agui = await import('agentdown/ag-ui');
const a2ui = await import('agentdown/a2ui');
const combined = await import('agentdown/ag-ui-a2ui');

const checks = [
  ['agentdown.RunSurface', core.RunSurface],
  ['agentdown.createAgentdown', core.createAgentdown],
  ['agentdown/ag-ui.useAgUiChatSession', agui.useAgUiChatSession],
  ['agentdown/a2ui.A2UiSurface', a2ui.A2UiSurface],
  ['agentdown/a2ui.createA2UiClientCapabilities', a2ui.createA2UiClientCapabilities],
  ['agentdown/ag-ui-a2ui.useAgUiA2UiChatSession', combined.useAgUiA2UiChatSession]
];

for (const [name, value] of checks) {
  if (typeof value !== 'function' && typeof value !== 'object') {
    throw new Error(\`Missing packaged export: \${name}\`);
  }
}

const configured = core.createAgentdown({
  runtime: { limits: { maxNodes: 25 } }
});
if (configured.inspectConfig().runtimeLimits.maxNodes !== 25) {
  throw new Error('Packaged createAgentdown config did not reach the runtime factory.');
}
`, 'utf8');
  await run(process.execPath, [smokePath], tempRoot);
}

const tempRoot = await mkdtemp(join(tmpdir(), 'agentdown-package-consumer-'));

try {
  const packResult = await run(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--pack-destination', tempRoot],
    repositoryRoot,
    true
  );
  const packReport = JSON.parse(packResult.stdout);
  const tarballName = packReport[0]?.filename;
  if (typeof tarballName !== 'string' || tarballName.length === 0) {
    throw new Error('npm pack did not report a tarball filename.');
  }

  const nodeModules = join(tempRoot, 'node_modules');
  const packageRoot = join(nodeModules, 'agentdown');
  await linkWorkspaceDependencies(nodeModules);
  await mkdir(packageRoot, { recursive: true });
  await run(
    'tar',
    ['-xzf', join(tempRoot, basename(tarballName)), '-C', packageRoot, '--strip-components=1'],
    repositoryRoot
  );
  await assertPackagedFiles(packageRoot);
  await assertRuntimeExports(tempRoot);

  for (const example of examples) {
    const source = join(repositoryRoot, 'examples', example);
    const target = join(tempRoot, 'apps', example);
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, {
      recursive: true,
      filter: (path) => shouldCopyExample(path, source)
    });
    await run('npm', ['run', 'build', '--', '--logLevel', 'error'], target);
  }

  process.stdout.write('PASS: npm tarball imports, declarations, and all three consumers build successfully.\n');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
