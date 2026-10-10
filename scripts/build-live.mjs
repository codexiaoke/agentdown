process.env.VITE_AGENT_MODE = 'live';
process.env.VITE_BROWSER_DEMO = 'false';
await import('./build-next.mjs');
