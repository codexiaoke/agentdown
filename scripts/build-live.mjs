import { writeFileSync } from 'node:fs';

process.env.VITE_AGENT_MODE = 'live';
process.env.VITE_BROWSER_DEMO = 'false';
await import('./build-next.mjs');
writeFileSync(new URL('../dist-next/prototype/agentdown-mode.json', import.meta.url), `${JSON.stringify({ schemaVersion: 1, mode: 'live' })}\n`);
