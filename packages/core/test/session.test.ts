import { describe, expect, it, vi } from 'vitest';
import { AdapterDeliveryError, createAgentActions, createAgentSession, projectAgentView } from '../src/index.js';
import type { AdapterContext, AdapterOperation, AdapterReceipt, AgentAdapter, AgentCapabilities, DomainEvent, EventEnvelope, EventSubscription, SessionArchive } from '../src/index.js';

class Queue {
  private values: EventEnvelope[] = [];
  private wake: (() => void) | undefined;
  ended = false;
  push(value: EventEnvelope): void { this.values.push(value); this.wake?.(); this.wake = undefined; }
  end(): void { this.ended = true; this.wake?.(); this.wake = undefined; }
  async *read(signal?: AbortSignal): AsyncIterable<EventEnvelope> {
    while (!this.ended || this.values.length) {
      if (signal?.aborted) return;
      const value = this.values.shift();
      if (value) { yield value; continue; }
      await new Promise<void>((resolve) => { this.wake = resolve; signal?.addEventListener('abort', resolve, { once: true }); });
    }
  }
}
function fixture(capabilities: AgentCapabilities = { respond: true, resume: true, cancelExecution: true, regenerate: true, operationIdempotency: true, maxConcurrentExecutions: 2 }) {
  const requests: AdapterOperation[] = [];
  const queues: Queue[] = [];
  let executeImpl: ((operation: AdapterOperation, context: AdapterContext) => Promise<AdapterReceipt>) | undefined;
  const execute = vi.fn(async (operation: AdapterOperation, context: AdapterContext): Promise<AdapterReceipt> => {
    requests.push(operation);
    if (executeImpl) return executeImpl(operation, context);
    const queue = new Queue(); queues.push(queue);
    return { confirmation: 'transport', subscription: { streamId: operation.executionId, executionId: operation.executionId, data: { index: queues.length - 1 } } };
  });
  const events = vi.fn((subscription: EventSubscription, context: AdapterContext): AsyncIterable<EventEnvelope> => {
    const data = subscription.data as { index: number };
    return queues[data.index]!.read(context.signal);
  });
  const adapter: AgentAdapter = { id: 'fixture', version: '1', capabilities, execute, events };
  let count = 0;
  const session = createAgentSession({ conversationId: 'conversation-1', adapter, createId: (kind) => `${kind}-${++count}`, clock: () => 123 });
  function emit(event: DomainEvent, cursor: string, queueIndex = queues.length - 1, eventId = `event-${cursor}`): void {
    const executionId = requests[queueIndex]?.executionId ?? requests.at(-1)!.executionId;
    queues[queueIndex]!.push({ streamId: executionId, executionId, eventId, cursor, event });
  }
  return { adapter, session, requests, queues, execute, events, emit, setExecute: (impl: typeof executeImpl) => { executeImpl = impl; } };
}
async function waitCursor(f: ReturnType<typeof fixture>, cursor: string): Promise<void> {
  await expect.poll(() => f.session.exportSnapshot().cursors[f.requests.at(-1)!.executionId]).toBe(cursor);
}
async function start(f: ReturnType<typeof fixture>) {
  const handle = f.session.dispatch({ type: 'send', input: { text: 'Research the project' } });
  expect((await handle.delivery).status).toBe('delivered');
  await expect.poll(() => f.events.mock.calls.length).toBe(1);
  return { handle, executionId: f.requests[0]!.executionId, turnId: f.requests[0]!.turnId };
}

describe('Session contract', () => {
  it('constructs, subscribes and projects passively with stable immutable references', () => {
    const f = fixture();
    const listener = vi.fn();
    const unsubscribe = f.session.subscribe(listener);
    const snapshot = f.session.getSnapshot();
    expect(f.session.getSnapshot()).toBe(snapshot);
    expect(projectAgentView(snapshot)).toBe(projectAgentView(snapshot));
    expect(Object.isFrozen(snapshot.messages)).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
    unsubscribe(); unsubscribe(); f.session.dispose();
    expect(listener).not.toHaveBeenCalled();
  });

  it('validates actions through fulfilled failures and freezes a copy of input', async () => {
    const f = fixture();
    const failed = f.session.dispatch({ type: 'send', input: { text: ' ' } });
    expect(await failed.delivery).toMatchObject({ status: 'failed', error: { code: 'invalidInput' } });
    expect(f.execute).not.toHaveBeenCalled();
    const input = { text: 'Original' };
    const handle = createAgentActions(f.session).send(input);
    input.text = 'Changed';
    expect((await handle.delivery).status).toBe('delivered');
    expect(f.requests[0]!.action).toEqual({ type: 'send', input: { text: 'Original' } });
    expect(Object.values(f.session.getSnapshot().messages)[0]!.text).toBe('Original');
    f.session.dispose();
  });

  it('keeps execution outcome separate from run completion and stream EOF', async () => {
    const f = fixture();
    const { executionId, turnId } = await start(f);
    const originalMessage = Object.values(f.session.getSnapshot().messages)[0];
    f.emit({ type: 'execution.updated', status: 'running' }, '1');
    f.emit({ type: 'run.upsert', run: { id: 'run-1', executionId, status: 'completed' } }, '2');
    f.emit({ type: 'message.upsert', message: { id: 'answer-1', executionId, turnId, role: 'assistant', text: '', status: 'streaming', createdAt: 124 } }, '3');
    f.emit({ type: 'message.delta', messageId: 'answer-1', delta: 'Hello' }, '4');
    await waitCursor(f, '4');
    expect(f.session.getSnapshot().executions[executionId]!.status).toBe('running');
    expect(Object.values(f.session.getSnapshot().messages)[0]).toBe(originalMessage);
    f.queues[0]!.end();
    await expect.poll(() => f.session.getSnapshot().connections[executionId]?.status).toBe('disconnected');
    expect(f.session.getSnapshot().executions[executionId]!.status).toBe('running');
    f.session.dispose();
  });

  it('supports two independent approvals and distinguishes delivery from resolution', async () => {
    const f = fixture();
    const { executionId } = await start(f);
    f.emit({ type: 'execution.updated', status: 'waiting' }, '1');
    for (let index = 1; index <= 2; index++) f.emit({ type: 'interaction.upsert', interaction: { id: `approval-${index}`, executionId, kind: 'approval', prompt: `Approve ${index}`, revision: 1, status: 'pending' } }, `${index + 1}`);
    await waitCursor(f, '3');
    expect(projectAgentView(f.session.getSnapshot()).pendingInteractions).toHaveLength(2);
    const invalid = f.session.dispatch({ type: 'respond', interactionId: 'approval-1', response: { approved: 'yes' } });
    expect(await invalid.delivery).toMatchObject({ status: 'failed', error: { code: 'invalidInput' } });
    const response = { type: 'respond' as const, interactionId: 'approval-1', response: { approved: true } };
    const first = f.session.dispatch(response);
    const duplicate = f.session.dispatch(response);
    expect(duplicate).toBe(first);
    const conflicting = f.session.dispatch({ ...response, response: { approved: false } });
    expect(await conflicting.delivery).toMatchObject({ status: 'failed', error: { code: 'conflict' } });
    expect((await first.delivery).status).toBe('delivered');
    expect(f.requests[1]!.interactionRevision).toBe(1);
    expect(f.session.getSnapshot().interactions['approval-1']!.status).toBe('awaitingConfirmation');
    expect(f.session.getSnapshot().interactions['approval-2']!.status).toBe('pending');
    await expect.poll(() => f.events.mock.calls.length).toBe(2);
    f.emit({ type: 'interaction.resolved', interactionId: 'approval-1', response: { approved: true }, revision: 1 }, '4');
    await waitCursor(f, '4');
    expect(f.session.getSnapshot().interactions['approval-1']!.status).toBe('resolved');
    expect(f.session.getSnapshot().operations[first.operationId]!.acceptance).toBe('accepted');
    expect(projectAgentView(f.session.getSnapshot()).pendingInteractions).toHaveLength(1);
    f.session.dispose();
  });

  it('deduplicates stable event identities across reconnect and archive restore', async () => {
    const f = fixture();
    const { executionId, turnId } = await start(f);
    f.emit({ type: 'message.upsert', message: { id: 'answer', executionId, turnId, role: 'assistant', text: '', status: 'streaming', createdAt: 124 } }, '1');
    f.emit({ type: 'message.delta', messageId: 'answer', delta: 'A' }, '2');
    await waitCursor(f, '2');
    await f.session.dispatch({ type: 'disconnect', executionId }).delivery;
    const archive = f.session.exportSnapshot();
    const restored = createAgentSession({ conversationId: archive.conversationId, adapter: f.adapter, initialSnapshot: archive });
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect((await restored.dispatch({ type: 'resume', executionId }).delivery).status).toBe('delivered');
    await expect.poll(() => f.events.mock.calls.length).toBe(2);
    expect(f.requests[1]!.cursor).toBe('2');
    expect(f.requests[1]!.cursors).toEqual({ [executionId]: '2' });
    f.emit({ type: 'message.delta', messageId: 'answer', delta: 'A' }, '2');
    f.emit({ type: 'message.delta', messageId: 'answer', delta: 'B' }, '3');
    await expect.poll(() => restored.exportSnapshot().cursors[executionId]).toBe('3');
    expect(restored.getSnapshot().messages.answer!.text).toBe('AB');
    restored.dispose(); f.session.dispose();
  });

  it('commits cursor and dedupe atomically and never checkpoints an invalid event', async () => {
    const f = fixture();
    const { executionId } = await start(f);
    const checkpoints: SessionArchive[] = [];
    f.session.subscribe(() => { checkpoints.push(f.session.exportSnapshot()); });
    f.emit({ type: 'execution.updated', status: 'running' }, 'good');
    await waitCursor(f, 'good');
    const checkpoint = checkpoints.find((archive) => archive.cursors[executionId] === 'good')!;
    expect(checkpoint.snapshot.executions[executionId]!.status).toBe('running');
    expect(checkpoint.dedupe[executionId]).toContain('event:event-good');
    f.queues[0]!.push({ streamId: executionId, executionId, eventId: 'bad-event', cursor: 'bad', event: { type: 'message.delta', messageId: 'missing', delta: 'unsafe' } });
    await expect.poll(() => f.session.getSnapshot().connections[executionId]!.status).toBe('error');
    expect(f.session.exportSnapshot().cursors[executionId]).toBe('good');
    expect(f.session.exportSnapshot().dedupe[executionId]).not.toContain('event:bad-event');
    f.session.dispose();
  });

  it('retries uncertain delivery with the same frozen operation and a new attempt', async () => {
    const f = fixture();
    f.setExecute(async () => { throw new Error('ack lost'); });
    const first = f.session.dispatch({ type: 'send', input: { text: 'One request' } });
    expect(await first.delivery).toMatchObject({ status: 'uncertain' });
    f.setExecute(async () => ({ confirmation: 'backend' }));
    const retry = f.session.dispatch({ type: 'retryOperation', operationId: first.operationId });
    expect(retry.operationId).toBe(first.operationId);
    expect(retry.attemptId).not.toBe(first.attemptId);
    expect(await retry.delivery).toEqual({ status: 'delivered', confirmation: 'backend' });
    expect(f.requests[0]!.action).toEqual(f.requests[1]!.action);
    expect(f.requests[0]!.executionId).toBe(f.requests[1]!.executionId);
    expect(Object.keys(f.session.getSnapshot().turns)).toHaveLength(1);
    expect(Object.keys(f.session.getSnapshot().messages)).toHaveLength(1);
    expect(f.session.getSnapshot().operations[first.operationId]!.attemptCount).toBe(2);
    expect(await f.session.dispatch({ type: 'retryOperation', operationId: first.operationId }).delivery).toMatchObject({ status: 'failed', error: { code: 'conflict' } });
    f.session.dispose();
  });

  it('does not retry uncertain requests without backend idempotency, including query-only adapters', async () => {
    const f = fixture({ operationQuery: true });
    f.setExecute(async () => { throw new Error('lost ack'); });
    const first = f.session.dispatch({ type: 'send', input: { text: 'One request' } });
    await first.delivery;
    expect(await f.session.dispatch({ type: 'retryOperation', operationId: first.operationId }).delivery).toMatchObject({ status: 'failed', error: { code: 'unsupported' } });
    expect(f.execute).toHaveBeenCalledTimes(1);
    f.session.dispose();
  });

  it('keeps known request failure distinct from uncertainty', async () => {
    const f = fixture();
    f.setExecute(async () => { throw new AdapterDeliveryError({ status: 'failed', error: { code: 'transport', message: 'Bad request' }, retryable: false }); });
    const handle = f.session.dispatch({ type: 'send', input: { text: 'Input' } });
    expect(await handle.delivery).toMatchObject({ status: 'failed', retryable: false });
    expect(f.session.getSnapshot().operations[handle.operationId]!.acceptance).toBe('unknown');
    expect(Object.values(f.session.getSnapshot().executions)[0]!.status).toBe('failed');
    expect(projectAgentView(f.session.getSnapshot()).canSend).toBe(true);
    f.session.dispose();
  });

  it('retries a definitely unissued request without creating another execution', async () => {
    const f = fixture({ maxConcurrentExecutions: 1 });
    f.setExecute(async () => { throw new AdapterDeliveryError({ status: 'failed', error: { code: 'transport', message: 'Unissued' }, retryable: true }); });
    const first = f.session.dispatch({ type: 'send', input: { text: 'Retry safely' } });
    await first.delivery;
    const executionId = f.requests[0]!.executionId;
    expect(f.session.getSnapshot().executions[executionId]!.status).toBe('failed');
    f.setExecute(async () => ({ confirmation: 'transport' }));
    const retry = f.session.dispatch({ type: 'retryOperation', operationId: first.operationId });
    expect(f.session.getSnapshot().executions[executionId]!.status).toBe('pending');
    expect(await retry.delivery).toEqual({ status: 'delivered', confirmation: 'transport' });
    expect(Object.keys(f.session.getSnapshot().executions)).toHaveLength(1);
    f.session.dispose();
  });

  it('blocks retrying an old decision after the interaction revision changes', async () => {
    const f = fixture();
    const { executionId } = await start(f);
    f.emit({ type: 'interaction.upsert', interaction: { id: 'approval', executionId, kind: 'approval', prompt: 'Approve original plan', revision: 1, status: 'pending' } }, '1');
    await waitCursor(f, '1');
    f.setExecute(async () => { throw new Error('ACK lost'); });
    const first = f.session.dispatch({ type: 'respond', interactionId: 'approval', response: { approved: true } });
    expect(await first.delivery).toMatchObject({ status: 'uncertain' });
    expect(f.requests[1]!.interactionRevision).toBe(1);
    f.emit({ type: 'interaction.upsert', interaction: { id: 'approval', executionId, kind: 'approval', prompt: 'Approve revised plan', revision: 2, status: 'pending' } }, '2');
    await waitCursor(f, '2');
    expect(await f.session.dispatch({ type: 'retryOperation', operationId: first.operationId }).delivery).toMatchObject({ status: 'failed', error: { code: 'conflict' } });
    expect(f.execute).toHaveBeenCalledTimes(2);
    const archive = f.session.exportSnapshot();
    const restored = createAgentSession({ conversationId: archive.conversationId, adapter: f.adapter, initialSnapshot: archive });
    expect(restored.getSnapshot().operations[first.operationId]!.interactionRevision).toBe(1);
    expect(await restored.dispatch({ type: 'retryOperation', operationId: first.operationId }).delivery).toMatchObject({ status: 'failed', error: { code: 'conflict' } });
    restored.dispose(); f.session.dispose();
  });

  it('checks concurrency again before retrying a failed send', async () => {
    const f = fixture({ maxConcurrentExecutions: 1 });
    f.setExecute(async () => { throw new AdapterDeliveryError({ status: 'failed', error: { code: 'transport', message: 'Not issued' }, retryable: true }); });
    const first = f.session.dispatch({ type: 'send', input: { text: 'Failed first input' } });
    await first.delivery;
    f.setExecute(async () => ({ confirmation: 'transport' }));
    await f.session.dispatch({ type: 'send', input: { text: 'New input' } }).delivery;
    const retry = f.session.dispatch({ type: 'retryOperation', operationId: first.operationId });
    expect(await retry.delivery).toMatchObject({ status: 'failed', error: { code: 'conflict' } });
    expect(f.execute).toHaveBeenCalledTimes(2);
    f.session.dispose();
  });

  it('creates regeneration as a new execution of the same turn', async () => {
    const f = fixture();
    const { executionId, turnId } = await start(f);
    const regenerated = f.session.dispatch({ type: 'regenerate', turnId, fromExecutionId: executionId });
    await regenerated.delivery;
    expect(f.requests[1]!.executionId).not.toBe(executionId);
    expect(f.requests[1]!.turnId).toBe(turnId);
    expect(f.session.getSnapshot().turns[turnId]!.executionIds).toHaveLength(2);
    expect(Object.keys(f.session.getSnapshot().messages)).toHaveLength(1);
    f.session.dispose();
  });

  it('never treats cancel request delivery as confirmed execution cancellation', async () => {
    const f = fixture();
    const { executionId } = await start(f);
    await f.session.dispatch({ type: 'cancelExecution', executionId }).delivery;
    expect(f.session.getSnapshot().executions[executionId]!.status).toBe('pending');
    await expect.poll(() => f.events.mock.calls.length).toBe(2);
    f.emit({ type: 'execution.updated', status: 'cancelled' }, '1');
    await waitCursor(f, '1');
    expect(f.session.getSnapshot().executions[executionId]!.status).toBe('cancelled');
    f.session.dispose();
  });

  it('settles unissued and issued attempts on disposal and ignores late receipts', async () => {
    const unissued = fixture();
    const queued = unissued.session.dispatch({ type: 'send', input: { text: 'Queued' } });
    unissued.session.dispose(); unissued.session.dispose();
    expect(await queued.delivery).toMatchObject({ status: 'failed', error: { code: 'disposed' } });
    expect(unissued.execute).not.toHaveBeenCalled();
    const issued = fixture();
    let resolve!: (receipt: AdapterReceipt) => void;
    issued.setExecute(() => new Promise((done) => { resolve = done; }));
    const pending = issued.session.dispatch({ type: 'send', input: { text: 'Issued' } });
    await expect.poll(() => issued.execute.mock.calls.length).toBe(1);
    issued.session.dispose();
    expect(await pending.delivery).toMatchObject({ status: 'uncertain' });
    const snapshot = issued.session.getSnapshot();
    resolve({ confirmation: 'backend', subscription: { streamId: 'late', executionId: issued.requests[0]!.executionId } });
    await Promise.resolve(); await Promise.resolve();
    expect(issued.session.getSnapshot()).toBe(snapshot);
    expect(issued.events).not.toHaveBeenCalled();
    expect(await issued.session.dispatch({ type: 'send', input: { text: 'After disposal' } }).delivery).toMatchObject({ status: 'failed', error: { code: 'disposed' } });
    expect(issued.session.getSnapshot()).toBe(snapshot);
  });

  it('aborts an acknowledged response body when an observer disposes during handoff', async () => {
    const f = fixture();
    let signal: AbortSignal | undefined;
    f.setExecute(async (operation, context) => {
      signal = context.signal;
      return { confirmation: 'transport', subscription: { streamId: operation.executionId, executionId: operation.executionId } };
    });
    f.session.subscribe(() => {
      if (Object.values(f.session.getSnapshot().operations).some((operation) => operation.status === 'delivered')) f.session.dispose();
    });
    const handle = f.session.dispatch({ type: 'send', input: { text: 'Dispose during handoff' } });
    expect((await handle.delivery).status).toBe('delivered');
    expect(signal!.aborted).toBe(true);
    expect(f.events).not.toHaveBeenCalled();
  });

  it('isolates an old connection even when its iterator ignores cancellation', async () => {
    const f = fixture();
    f.events.mockImplementation((subscription: EventSubscription) => {
      const data = subscription.data as { index: number };
      return f.queues[data.index]!.read();
    });
    const { executionId, turnId } = await start(f);
    f.emit({ type: 'message.upsert', message: { id: 'answer', executionId, turnId, role: 'assistant', text: '', status: 'streaming', createdAt: 124 } }, '1');
    await waitCursor(f, '1');
    await f.session.dispatch({ type: 'disconnect', executionId }).delivery;
    await f.session.dispatch({ type: 'resume', executionId }).delivery;
    f.queues[0]!.push({ streamId: executionId, executionId, eventId: 'stale', cursor: 'stale', event: { type: 'message.delta', messageId: 'answer', delta: 'OLD' } });
    f.emit({ type: 'message.delta', messageId: 'answer', delta: 'NEW' }, '2');
    await waitCursor(f, '2');
    expect(f.session.getSnapshot().messages.answer!.text).toBe('NEW');
    expect(f.session.exportSnapshot().dedupe[executionId]).not.toContain('event:stale');
    f.queues[0]!.end(); f.session.dispose();
  });

  it('supports passive replay and rejects corrupted archive identities before side effects', async () => {
    const f = fixture();
    const { executionId } = await start(f);
    const archive = f.session.exportSnapshot();
    const replay = createAgentSession({ conversationId: archive.conversationId, adapter: f.adapter, initialSnapshot: archive, mode: 'replay' });
    const replaySnapshot = replay.getSnapshot();
    expect(projectAgentView(replay.getSnapshot()).canSend).toBe(false);
    expect(await replay.dispatch({ type: 'resume', executionId }).delivery).toMatchObject({ status: 'failed', error: { code: 'unsupported' } });
    expect(replay.getSnapshot()).toBe(replaySnapshot);
    expect(f.execute).toHaveBeenCalledTimes(1);
    const corrupted = JSON.parse(JSON.stringify(archive));
    corrupted.snapshot.executions[executionId].turnId = 'wrong-turn';
    expect(() => createAgentSession({ conversationId: archive.conversationId, adapter: f.adapter, initialSnapshot: corrupted })).toThrow(/Invalid archived/);
    expect(() => createAgentSession({ conversationId: 'different-conversation', adapter: f.adapter, initialSnapshot: archive })).toThrow('mismatch');
    replay.dispose(); f.session.dispose();
  });
});
