import { spawnSync } from 'node:child_process';

for (const [binary, args] of [
  ['node_modules/typescript/bin/tsc', ['--build', 'tsconfig.next.json']],
  ['node_modules/vue-tsc/bin/vue-tsc.js', ['--noEmit', '-p', 'examples/prototype/tsconfig.json']],
  ['node_modules/vite/bin/vite.js', ['build', '--config', 'examples/prototype/vite.config.ts']],
]) {
  const result = spawnSync(process.execPath, [binary, ...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
