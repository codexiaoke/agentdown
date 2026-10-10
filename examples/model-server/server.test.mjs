import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createModelServer } from './server.mjs';

function operation(overrides = {}) { return { operationId: 'op-send', attemptId: 'attempt-send', conversationId: 'conversation', executionId: 'execution', turnId: 'turn', action: { type: 'send', input: { text: '请回答这个真实任务' } }, cursors: {}, ...overrides }; }
function post(url, value, headers = {}) { return fetch(`${url}/api/operations`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(value) }); }
async function fixture(context, provider, options = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'agentdown-model-'));
  const server = createModelServer({ provider, dataDir, ...options }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  context.after(async () => { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); await rm(dataDir, { recursive: true, force: true }); });
  return { url: `http://127.0.0.1:${server.address().port}`, dataDir, server };
}
async function eventsUntil(response, predicate) {
  assert.equal(response.status, 200); const reader = response.body.getReader(); let buffer = ''; const events = []; const decoder = new TextDecoder(); let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Timed out waiting for model events.')), 3000); });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timeout]); if (done) return events;
      buffer += decoder.decode(value, { stream: true }); let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        const data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
        if (!data) continue; const event = JSON.parse(data); events.push(event); if (predicate(event, events)) return events;
      }
    }
  } finally { clearTimeout(timer); await reader.cancel(); reader.releaseLock(); }
}
function stream(url, cursor, headers = {}) { return fetch(`${url}/api/executions/execution/events${cursor === undefined ? '' : `?cursor=${cursor}`}`, { headers }); }
const completed = ({ event }) => event.type === 'execution.updated' && event.status === 'completed';
const waiting = ({ event }) => event.type === 'execution.updated' && event.status === 'waiting';

test('model text streams directly without synthetic approvals, conversation history and regeneration remain coherent', async (context) => {
  const messages = [];
  const provider = { async *stream(input) { messages.push(structuredClone(input.messages)); yield { type: 'text', delta: '真实' }; yield { type: 'text', delta: '回答' }; } };
  const { url } = await fixture(context, provider);
  const response = await post(url, operation(), { accept: 'text/event-stream' });
  assert.equal(response.headers.get('x-agentdown-confirmation'), 'backend'); const events = await eventsUntil(response, completed);
  assert.equal(events.filter(({ event }) => event.type === 'message.delta').map(({ event }) => event.delta).join(''), '真实回答');
  assert.equal(events.some(({ event }) => event.type === 'interaction.upsert'), false);
  const next = operation({ operationId: 'op-next', attemptId: 'attempt-next', executionId: 'execution-next', turnId: 'turn-next', action: { type: 'send', input: { text: '然后呢' } } });
  await eventsUntil(await post(url, next, { accept: 'text/event-stream' }), completed);
  assert.deepEqual(messages[1].slice(1).map(({ role, content }) => [role, content]), [['user', '请回答这个真实任务'], ['assistant', '真实回答'], ['user', '然后呢']]);
  const regenerate = operation({ operationId: 'op-regenerate', attemptId: 'attempt-regenerate', executionId: 'execution-again', action: { type: 'regenerate', turnId: 'turn', fromExecutionId: 'execution' } });
  await eventsUntil(await post(url, regenerate, { accept: 'text/event-stream' }), completed);
  assert.equal(messages[2].length, 2); assert.equal(messages[2][1].content, '请回答这个真实任务');
});

test('independent model tool calls require approval; rejected tools continue as results and approved reports persist once', async (context) => {
  const requests = [];
  const provider = { async *stream(input) {
    requests.push(structuredClone(input.messages));
    if (requests.length === 1) { yield { type: 'text', delta: '已准备两份报告。' }; yield { type: 'tool-call', id: 'call-one', name: 'save_report', arguments: { title: '允许报告', content: '实际生成的报告正文' } }; yield { type: 'tool-call', id: 'call-two', name: 'save_report', arguments: { title: '拒绝报告', content: '这份不应保存' } }; }
    else yield { type: 'text', delta: '已保存第一份，并跳过被拒绝的第二份。' };
  } };
  const { url, dataDir } = await fixture(context, provider);
  const initial = await eventsUntil(await post(url, operation(), { accept: 'text/event-stream' }), waiting);
  const interactions = initial.filter(({ event }) => event.type === 'interaction.upsert').map(({ event }) => event.interaction);
  assert.equal(interactions.length, 2); assert.deepEqual(await readdir(dataDir), []);
  let cursor = initial.at(-1).cursor;
  const approve = operation({ operationId: 'approve', attemptId: 'approve-attempt', interactionRevision: 1, cursor, action: { type: 'respond', interactionId: interactions[0].id, response: { approved: true } } });
  assert.equal((await post(url, approve)).status, 200);
  const saved = await eventsUntil(await stream(url, cursor), ({ event }) => event.type === 'tool.upsert' && event.tool.status === 'completed');
  assert(saved.every((event) => Number(event.cursor) > Number(cursor))); assert.equal(requests.length, 1);
  cursor = saved.at(-1).cursor;
  assert.equal((await post(url, { ...approve, attemptId: 'approve-retry', cursor })).status, 200);
  const reject = operation({ operationId: 'reject', attemptId: 'reject-attempt', cursor, interactionRevision: 1, action: { type: 'respond', interactionId: interactions[1].id, response: { approved: false } } });
  assert.equal((await post(url, reject)).status, 200);
  const ended = await eventsUntil(await stream(url, cursor), completed); assert(ended.some(({ event }) => event.type === 'tool.upsert' && event.tool.status === 'cancelled'));
  const reports = await readdir(dataDir); assert.equal(reports.length, 1); assert.match(await readFile(join(dataDir, reports[0]), 'utf8'), /实际生成的报告正文/);
  assert.equal(requests.length, 2);
  const toolResults = requests[1].filter(({ role }) => role === 'tool').map(({ content }) => JSON.parse(content));
  assert.equal(toolResults[0].ok, true); assert.equal(toolResults[1].denied, true);
  const replay = await eventsUntil(await stream(url), () => false); assert.equal(replay.filter(({ event }) => event.type === 'artifact.upsert').length, 1);
});

test('lost acknowledgement can query and redeliver the same intent without another model call', async (context) => {
  let calls = 0; const { url } = await fixture(context, { async *stream() { calls++; yield { type: 'text', delta: '结果' }; } });
  const intent = operation(); await assert.rejects(post(url, intent, { 'x-agentdown-drop-ack': 'true' }));
  const query = await fetch(`${url}/api/operations/op-send`); assert.equal(query.status, 200); assert.equal((await query.json()).status, 'accepted');
  const events = await eventsUntil(await post(url, { ...intent, attemptId: 'retry' }, { accept: 'text/event-stream' }), completed);
  assert.equal(calls, 1); assert.equal(events.filter(({ event }) => event.type === 'operation.accepted').length, 1);
  assert.equal((await post(url, { ...intent, action: { type: 'send', input: { text: 'changed intent' } } })).status, 409);
});

test('disconnect only stops observation; explicit cancel aborts the provider and expires pending approvals', async (context) => {
  let signal;
  const { url } = await fixture(context, { async *stream(input) { signal = input.signal; yield { type: 'text', delta: '正在处理' }; await new Promise((resolve) => input.signal.addEventListener('abort', resolve, { once: true })); } });
  const first = await eventsUntil(await post(url, operation(), { accept: 'text/event-stream' }), ({ event }) => event.type === 'message.delta');
  assert.equal(signal.aborted, false);
  const cancel = operation({ operationId: 'cancel', attemptId: 'attempt-cancel', cursor: first.at(-1).cursor, action: { type: 'cancelExecution', executionId: 'execution' } });
  assert.equal((await post(url, cancel)).status, 200); assert.equal(signal.aborted, true);
  const ended = await eventsUntil(await stream(url), () => false); assert(ended.some(({ event }) => event.type === 'execution.updated' && event.status === 'cancelled'));
  assert.equal(ended.some(({ event }) => event.type === 'execution.updated' && event.status === 'completed'), false);
});

test('cancellation expires tool approvals and no report is written', async (context) => {
  const { url, dataDir } = await fixture(context, { async *stream() { yield { type: 'tool-call', id: 'call', name: 'save_report', arguments: { title: '取消报告', content: '不能保存' } }; } });
  const initial = await eventsUntil(await post(url, operation(), { accept: 'text/event-stream' }), waiting);
  const interaction = initial.find(({ event }) => event.type === 'interaction.upsert').event.interaction;
  assert.equal((await post(url, operation({ operationId: 'cancel', action: { type: 'cancelExecution', executionId: 'execution' } }))).status, 200);
  const ended = await eventsUntil(await stream(url), () => false); assert(ended.some(({ event }) => event.type === 'interaction.upsert' && event.interaction.status === 'expired'));
  assert.equal((await post(url, operation({ operationId: 'late-approval', action: { type: 'respond', interactionId: interaction.id, response: { approved: true } } }))).status, 409);
  assert.deepEqual(await readdir(dataDir), []);
});

test('provider failure terminates with a safe error, never a fabricated response', async (context) => {
  const { url } = await fixture(context, { async *stream() { throw new Error('secret-api-key-and-provider-body'); } });
  const events = await eventsUntil(await post(url, operation(), { accept: 'text/event-stream' }), ({ event }) => event.type === 'execution.updated' && event.status === 'failed');
  assert.equal(JSON.stringify(events).includes('secret-api-key'), false); assert.equal(events.some(({ event }) => event.type === 'message.delta'), false);
});

test('all business routes require bearer auth and CORS origins are exact; public binding fails without a token', async (context) => {
  let calls = 0;
  const { url } = await fixture(context, { async *stream() { calls++; yield { type: 'text', delta: 'ok' }; } }, { accessToken: 'local-test-token', corsOrigins: ['https://codexiaoke.github.io'] });
  assert.equal((await fetch(`${url}/health`)).status, 200);
  assert.equal((await post(url, operation())).status, 401); assert.equal((await fetch(`${url}/api/operations/op-send`)).status, 401); assert.equal((await stream(url)).status, 401); assert.equal(calls, 0);
  assert.equal((await post(url, operation(), { authorization: 'Bearer local-test-token', origin: 'https://evil.example' })).status, 403); assert.equal(calls, 0);
  const response = await post(url, operation(), { authorization: 'Bearer local-test-token', origin: 'https://codexiaoke.github.io', accept: 'text/event-stream' });
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://codexiaoke.github.io'); await eventsUntil(response, completed); assert.equal(calls, 1);
  assert.equal((await fetch(`${url}/api/operations/op-send`, { headers: { authorization: 'Bearer local-test-token' } })).status, 200);
  const unsafe = createModelServer({ provider: { async *stream() {} } }); assert.throws(() => unsafe.listen(0, '0.0.0.0'), /requires AGENTDOWN_ACCESS_TOKEN/);
});

test('static serving refuses symlinks outside its root and encoded traversal', async (context) => {
  const assets = await mkdtemp(join(tmpdir(), 'agentdown-assets-')); const outside = await mkdtemp(join(tmpdir(), 'agentdown-outside-'));
  context.after(async () => { await rm(assets, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); });
  await writeFile(join(assets, 'index.html'), '<p>safe app</p>'); await writeFile(join(outside, 'private.txt'), 'server-private'); await symlink(join(outside, 'private.txt'), join(assets, 'leak.txt'));
  const { url } = await fixture(context, { async *stream() {} }, { staticDir: assets });
  assert.equal(await (await fetch(url)).text(), '<p>safe app</p>'); assert.equal((await fetch(`${url}/leak.txt`)).status, 404);
  const traversal = await fetch(`${url}/..%2f..%2fprivate.txt`); assert.equal(traversal.status, 403); assert.equal((await traversal.text()).includes('server-private'), false);
});

test('model output limits close the producer and terminate without fake completion', async (context) => {
  let producerClosed = false;
  const { url } = await fixture(context, { async *stream() { try { yield { type: 'text', delta: '12345' }; yield { type: 'text', delta: '67890' }; } finally { producerClosed = true; } } }, { maxOutputChars: 6 });
  const events = await eventsUntil(await post(url, operation(), { accept: 'text/event-stream' }), ({ event }) => event.type === 'execution.updated' && event.status === 'failed');
  assert.equal(producerClosed, true); assert.equal(events.filter(({ event }) => event.type === 'message.delta').map(({ event }) => event.delta).join(''), '12345');
  assert.equal(events.some(({ event }) => event.type === 'execution.updated' && event.status === 'completed'), false);
});
