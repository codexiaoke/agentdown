import { appendFile, readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const version = packageJson.version;
const expectedTag = `v${version}`;
const actualTag = process.argv[2] ?? process.env.GITHUB_REF_NAME;

if (!actualTag) {
  throw new Error(`Release tag is required. Expected ${expectedTag}.`);
}
if (actualTag !== expectedTag) {
  throw new Error(`Release tag ${actualTag} does not match package version ${version}. Expected ${expectedTag}.`);
}

const repositoryUrl = typeof packageJson.repository === 'string'
  ? packageJson.repository
  : packageJson.repository?.url;
const repositoryMatch = String(repositoryUrl ?? '').match(/github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/i);
const configuredRepository = repositoryMatch?.[1]?.toLowerCase();
const workflowRepository = process.env.GITHUB_REPOSITORY?.toLowerCase();

if (workflowRepository && configuredRepository !== workflowRepository) {
  throw new Error(
    `package.json repository ${configuredRepository ?? '(missing)'} does not match ${workflowRepository}.`
  );
}

const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(packageJson.name)}/${encodeURIComponent(version)}`;
const response = await fetch(registryUrl, {
  headers: {
    accept: 'application/json'
  }
});

if (response.ok) {
  throw new Error(`${packageJson.name}@${version} is already published; npm versions are immutable.`);
}
if (response.status !== 404) {
  throw new Error(`Unable to verify npm version availability: ${response.status} ${response.statusText}.`);
}

const distTag = version.includes('-') ? 'next' : 'latest';

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `dist-tag=${distTag}\n`, 'utf8');
}

process.stdout.write(
  `PASS: ${actualTag} matches ${packageJson.name}@${version}; npm dist-tag will be ${distTag}.\n`
);
