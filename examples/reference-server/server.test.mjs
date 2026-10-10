import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createReferenceServer } from './server.mjs';

async function fixture(context, options = {}) {
  const server = createReferenceServer({ stepDelay: 8, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, server };
}

function sendOperation(overrides = {}) {
  return {
    operationId: 'operation-send',
    attemptId: 'attempt-send',
    conversationId: 'conversation-demo',
    executionId: 'execution-demo',
    turnId: 'turn-demo',
    action: { type: 'send', input: { text: '验证完整任务流程' } },
    cursors: {},
    ...overrides
  };
}

function respondOperation(interactionId, approved, suffix, cursor) {
  return sendOperation({
    operationId: `operation-${suffix}`,
    attemptId: `attempt-${suffix}`,
    action: { type: 'respond', interactionId, response: { approved } },
    ...(cursor === undefined ? {} : { cursor })
  });
}

function post(url, operation, headers = {}) {
  return fetch(`${url}/api/operations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(operation)
  });
}

async function eventsUntil(response, predicate) {
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/event-stream/);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buffer = '';
  let timeout;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error('Timed out while waiting for a reference event.')), 2000);
    timeout.unref();
  });
  try {
    for (;;) {
      const { value, done } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
        if (!data) continue;
        const event = JSON.parse(data);
        events.push(event);
        if (predicate(event, events)) return events;
      }
    }
    return events;
  } finally {
    clearTimeout(timeout);
    await reader.cancel();
    reader.releaseLock();
  }
}

function eventStream(url, cursor) {
  return fetch(`${url}/api/executions/execution-demo/events${cursor === undefined ? '' : `?cursor=${cursor}`}`);
}

async function waitingEvents(url) {
  return eventsUntil(await eventStream(url), ({ event }) => event.type === 'execution.updated' && event.status === 'waiting');
}

test('operation identity freezes business payload and permits a new delivery attempt', async (context) => {
  const { url } = await fixture(context);
  const initial = sendOperation();
  const accepted = await post(url, initial);
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), {
    confirmation: 'backend',
    remoteId: initial.operationId,
    subscription: { streamId: initial.executionId, executionId: initial.executionId }
  });
  const before = await waitingEvents(url);
  const cursor = before.at(-1).cursor;
  const duplicate = await post(url, { ...initial, attemptId: 'attempt-send-again', cursor });
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).subscription.cursor, cursor);
  const after = await waitingEvents(url);
  assert.deepEqual(after, before);
  assert.equal(after.filter(({ event }) => event.type === 'operation.accepted').length, 1);
  assert.equal(new Set(after.filter(({ event }) => event.type === 'run.upsert').map(({ event }) => event.run.id)).size, 1);
  assert.equal(after.filter(({ event }) => event.type === 'message.upsert').length, 1);

  const changed = await post(url, { ...initial, action: { type: 'send', input: { text: '另一个业务意图' } } });
  assert.equal(changed.status, 409);
  assert.equal((await changed.json()).error.code, 'idempotencyConflict');
  const query = await fetch(`${url}/api/operations/${initial.operationId}`);
  assert.equal(query.status, 200);
  assert.equal((await query.json()).status, 'accepted');
  assert.equal((await fetch(`${url}/api/operations/unknown`)).status, 404);
});

test('one POST stream exposes two approvals; resume is exclusive of the committed cursor', async (context) => {
  const { url } = await fixture(context);
  const response = await post(url, sendOperation(), { accept: 'text/event-stream' });
  assert.equal(response.headers.get('x-agentdown-confirmation'), 'backend');
  assert.equal(response.headers.get('x-agentdown-execution-id'), 'execution-demo');
  assert.equal(response.headers.get('x-agentdown-operation-id'), 'operation-send');
  const first = await eventsUntil(response, ({ event }) => event.type === 'execution.updated' && event.status === 'waiting');
  const approvals = first.filter(({ event }) => event.type === 'interaction.upsert').map(({ event }) => event.interaction);
  assert.equal(approvals.length, 2);
  assert.notEqual(approvals[0].id, approvals[1].id);
  assert.equal(first.filter(({ event }) => event.type === 'message.delta').length, 1);

  let cursor = first.at(-1).cursor;
  const approve = await post(url, respondOperation(approvals[0].id, true, 'approve', cursor));
  assert.equal(approve.status, 200);
  const approvedEvents = await eventsUntil(await eventStream(url, cursor), ({ event }) => event.type === 'tool.upsert' && event.tool.status === 'completed');
  assert(approvedEvents.every((envelope) => Number(envelope.cursor) > Number(cursor)));
  assert.equal(approvedEvents.filter(({ event }) => event.type === 'interaction.resolved').length, 1);
  assert.equal(approvedEvents.some(({ event }) => event.type === 'execution.updated' && event.status === 'completed'), false);
  cursor = approvedEvents.at(-1).cursor;

  const reject = await post(url, respondOperation(approvals[1].id, false, 'reject', cursor));
  assert.equal(reject.status, 200);
  const completed = await eventsUntil(await eventStream(url, cursor), ({ event }) => event.type === 'execution.updated' && event.status === 'completed');
  assert(completed.every((envelope) => Number(envelope.cursor) > Number(cursor)));
  const artifact = completed.find(({ event }) => event.type === 'artifact.upsert').event.artifact;
  assert.equal(artifact.status, 'ready');
  assert.deepEqual(artifact.content.decisions.map(({ approved }) => approved), [true, false]);
  assert.equal(completed.filter(({ event }) => event.type === 'interaction.resolved').length, 1);
  assert.equal(completed.filter(({ event }) => event.type === 'message.completed').length, 1);

  const replay = await eventsUntil(await eventStream(url, '0'), () => false);
  assert.equal(replay.filter(({ event }) => event.type === 'operation.accepted').length, 3);
  assert.deepEqual(replay.map((envelope) => envelope.cursor), replay.map((_, index) => String(index + 1)));
  const end = await eventsUntil(await eventStream(url, replay.at(-1).cursor), () => false);
  assert.deepEqual(end, []);
});

test('an accepted request with a lost acknowledgement is queryable and safe to retry', async (context) => {
  const { url } = await fixture(context);
  const operation = sendOperation();
  await assert.rejects(post(url, operation, { 'x-agentdown-drop-ack': 'true' }));
  const query = await fetch(`${url}/api/operations/${operation.operationId}`);
  assert.equal(query.status, 200);
  assert.equal((await query.json()).status, 'accepted');
  const duplicate = await post(url, { ...operation, attemptId: 'attempt-after-loss' });
  assert.equal(duplicate.status, 200);
  const events = await waitingEvents(url);
  assert.equal(events.filter(({ event }) => event.type === 'operation.accepted').length, 1);
  assert.equal(events.filter(({ event }) => event.type === 'message.upsert').length, 1);
});

test('closing observation leaves the task alive; explicit cancel confirms a terminal outcome', async (context) => {
  const { url } = await fixture(context);
  const response = await post(url, sendOperation(), { accept: 'text/event-stream' });
  await eventsUntil(response, ({ event }) => event.type === 'run.upsert');
  const waiting = await waitingEvents(url);
  assert.equal(waiting.at(-1).event.status, 'waiting');
  const operation = sendOperation({ operationId: 'operation-cancel', attemptId: 'attempt-cancel', action: { type: 'cancelExecution', executionId: 'execution-demo' } });
  const cancel = await post(url, operation);
  assert.equal(cancel.status, 200);
  const cancelled = await eventsUntil(await eventStream(url, waiting.at(-1).cursor), () => false);
  assert.equal(cancelled.at(-1).event.type, 'execution.updated');
  assert.equal(cancelled.at(-1).event.status, 'cancelled');
  assert.equal(cancelled.filter(({ event }) => event.type === 'interaction.upsert' && event.interaction.status === 'expired').length, 2);
  assert.equal(cancelled.some(({ event }) => event.type === 'artifact.upsert'), false);
  const late = await post(url, respondOperation('execution-demo:approval:save', true, 'late'));
  assert.equal(late.status, 409);
  assert.equal((await late.json()).error.code, 'expired');
});

test('validation failure does not reserve execution identity or advance an event stream', async (context) => {
  const { url } = await fixture(context);
  const invalid = await post(url, sendOperation({ cursor: '900' }));
  assert.equal(invalid.status, 409);
  assert.equal((await fetch(`${url}/api/operations/operation-send`)).status, 404);
  assert.equal((await fetch(`${url}/api/executions/execution-demo/events`)).status, 404);
  const valid = await post(url, sendOperation());
  assert.equal(valid.status, 200);
  const events = await waitingEvents(url);
  assert.equal(events[0].cursor, '1');
  const ahead = await eventStream(url, '900');
  assert.equal(ahead.status, 409);
  const negative = await eventStream(url, '-1');
  assert.equal(negative.status, 400);
  const invalidDecision = await post(url, respondOperation('execution-demo:approval:save', 'yes', 'invalid'));
  assert.equal(invalidDecision.status, 400);
});

test('regeneration creates a new execution and reuses the original turn input', async (context) => {
  const { url } = await fixture(context);
  await post(url, sendOperation());
  await waitingEvents(url);
  const operation = sendOperation({
    operationId: 'operation-regenerate',
    attemptId: 'attempt-regenerate',
    executionId: 'execution-second',
    action: { type: 'regenerate', turnId: 'turn-demo', fromExecutionId: 'execution-demo' }
  });
  const response = await post(url, operation);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).subscription.executionId, 'execution-second');
  const stream = await fetch(`${url}/api/executions/execution-second/events`);
  const events = await eventsUntil(stream, ({ event }) => event.type === 'execution.updated' && event.status === 'waiting');
  assert(events.every((event) => event.executionId === 'execution-second'));
  const tool = events.find(({ event }) => event.type === 'tool.upsert').event.tool;
  assert.equal(tool.input.text, '验证完整任务流程');
});

test('execution capacity belongs to each conversation and rejects its fifth active task', async (context) => {
  const { url } = await fixture(context);
  function operation(conversationId, index) {
    const identity = `${conversationId}-${index}`;
    return sendOperation({
      operationId: `operation-${identity}`,
      attemptId: `attempt-${identity}`,
      conversationId,
      executionId: `execution-${identity}`,
      turnId: `turn-${identity}`
    });
  }
  for (const conversationId of ['conversation-a', 'conversation-b']) {
    for (let index = 1; index <= 4; index++) {
      const accepted = await post(url, operation(conversationId, index));
      assert.equal(accepted.status, 200, `${conversationId} should have its own capacity`);
      await accepted.json();
    }
    const fifth = operation(conversationId, 5);
    const rejected = await post(url, fifth);
    assert.equal(rejected.status, 409);
    assert.equal((await rejected.json()).error.code, 'conflict');
    assert.equal((await fetch(`${url}/api/operations/${fifth.operationId}`)).status, 404);
    assert.equal((await fetch(`${url}/api/executions/${fifth.executionId}/events`)).status, 404);
  }
});

test('approval revision conflicts preserve the pending decision and freeze accepted retries', async (context) => {
  const { url } = await fixture(context);
  await post(url, sendOperation());
  const before = await waitingEvents(url);
  const interaction = before.find(({ event }) => event.type === 'interaction.upsert').event.interaction;
  const decision = {
    ...respondOperation(interaction.id, true, 'revision', before.at(-1).cursor),
    interactionRevision: interaction.revision
  };

  for (const invalidRevision of [-1, 1.5, '1', null]) {
    const invalid = await post(url, { ...decision, interactionRevision: invalidRevision });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, 'invalidInput');
  }
  const stale = await post(url, { ...decision, interactionRevision: interaction.revision + 1 });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, 'conflict');
  assert.equal((await fetch(`${url}/api/operations/${decision.operationId}`)).status, 404);

  // The same operation identity can now succeed because the rejected attempt
  // neither reserved it nor changed the pending interaction's revision.
  const correct = await post(url, decision);
  assert.equal(correct.status, 200);
  await correct.json();
  const resolved = await eventsUntil(await eventStream(url, before.at(-1).cursor), ({ event }) => event.type === 'tool.upsert' && event.tool.status === 'completed');
  assert.equal(Number(resolved[0].cursor), Number(before.at(-1).cursor) + 1);
  const confirmation = resolved.find(({ event }) => event.type === 'interaction.resolved').event;
  assert.equal(confirmation.interactionId, interaction.id);
  assert.equal(confirmation.revision, interaction.revision + 1);
  assert.deepEqual(confirmation.response, { approved: true });

  const retry = await post(url, { ...decision, attemptId: 'attempt-revision-retry' });
  assert.equal(retry.status, 200);
  await retry.json();
  const changed = await post(url, { ...decision, attemptId: 'attempt-revision-changed', interactionRevision: interaction.revision + 1 });
  assert.equal(changed.status, 409);
  assert.equal((await changed.json()).error.code, 'idempotencyConflict');
});
