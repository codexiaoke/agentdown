import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAgentSession, projectAgentView, type AgentSession } from '@agentdown/core';
import { createReferenceAdapter } from '@agentdown/reference';
// The dependency-free fixture backend is intentionally native JavaScript.
import { createReferenceServer } from '../../examples/reference-server/server.mjs';

describe('Session over the reference HTTP protocol', () => {
  let server: ReturnType<typeof createReferenceServer>;
  let endpoint: string;
  const sessions: AgentSession[] = [];
  const requests: { url: string; method: string }[] = [];

  beforeEach(async () => {
    requests.length = 0;
    server = createReferenceServer({ stepDelay: 5 });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    endpoint = `http://127.0.0.1:${server.address().port}/api`;
  });
  afterEach(async () => {
    for (const session of sessions.splice(0)) session.dispose();
    await new Promise<void>((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
  });

  function adapter() {
    return createReferenceAdapter({ endpoint, fetch: (input, init) => {
      requests.push({ url: String(input), method: init?.method ?? 'GET' });
      return fetch(input, init);
    } });
  }
  function makeSession(transport = adapter(), initialSnapshot?: ReturnType<AgentSession['exportSnapshot']>, mode: 'live' | 'replay' = 'live') {
    const session = createAgentSession({ conversationId: 'http-test', adapter: transport, mode, ...(initialSnapshot ? { initialSnapshot } : {}) });
    sessions.push(session);
    return session;
  }
  async function until(session: AgentSession, predicate: (view: ReturnType<typeof projectAgentView>) => boolean) {
    await new Promise<void>((resolve, reject) => {
      let unsubscribe = () => {};
      const timer = setTimeout(() => { unsubscribe(); reject(new Error(`State timed out: ${JSON.stringify(projectAgentView(session.getSnapshot()))}`)); }, 4000);
      function check() {
        if (!predicate(projectAgentView(session.getSnapshot()))) return;
        clearTimeout(timer); unsubscribe(); resolve();
      }
      unsubscribe = session.subscribe(check);
      check();
    });
  }

  it('hands off one POST stream, restores both approvals and finishes without duplicate text', async () => {
    const original = makeSession();
    expect(requests).toHaveLength(0);
    const first = original.dispatch({ type: 'send', input: { text: 'Build a report' } });
    expect((await first.delivery).status).toBe('delivered');
    await until(original, view => view.pendingInteractions.length === 2);
    const before = original.getSnapshot();
    const executionId = Object.keys(before.executions)[0]!;
    const archive = original.exportSnapshot();
    original.dispose();
    const restored = makeSession(adapter(), archive);
    expect(projectAgentView(restored.getSnapshot()).pendingInteractions).toHaveLength(2);
    expect(requests.filter(item => item.method === 'POST')).toHaveLength(1);
    expect((await restored.dispatch({ type: 'resume', executionId }).delivery).status).toBe('delivered');
    const approvals = projectAgentView(restored.getSnapshot()).pendingInteractions;
    await restored.dispatch({ type: 'respond', interactionId: approvals[0]!.id, response: { approved: true } }).delivery;
    await until(restored, view => view.pendingInteractions.length === 1);
    await restored.dispatch({ type: 'respond', interactionId: approvals[1]!.id, response: { approved: false } }).delivery;
    await until(restored, view => view.executions[0]?.status === 'completed');
    const result = projectAgentView(restored.getSnapshot());
    expect(result.artifacts).toHaveLength(1);
    expect(result.interactions.every(interaction => interaction.status === 'resolved')).toBe(true);
    expect(result.messages.filter(message => message.role === 'assistant')).toHaveLength(1);
    expect(result.messages.find(message => message.role === 'assistant')!.text.match(/我会先整理任务/g)).toHaveLength(1);
    expect(Object.keys(restored.getSnapshot().turns)).toHaveLength(1);
    expect(requests.filter(item => item.method === 'POST')).toHaveLength(3);
    expect(requests.some(item => item.url.includes('/events?cursor=') && !item.url.endsWith('cursor='))).toBe(true);
  });

  it('queries an accepted operation after a lost acknowledgement and keeps its original identity', async () => {
    const transport = adapter();
    const session = makeSession(transport);
    await session.dispatch({ type: 'send', input: { text: 'Lost ACK test' } }).delivery;
    await until(session, view => view.pendingInteractions.length === 2);
    const view = projectAgentView(session.getSnapshot());
    const executionId = view.executions[0]!.id;
    await session.dispatch({ type: 'disconnect', executionId }).delivery;
    transport.loseNextAcknowledgement();
    const attempt = session.dispatch({ type: 'respond', interactionId: view.pendingInteractions[0]!.id, response: { approved: true } });
    expect((await attempt.delivery).status).toBe('uncertain');
    expect(session.getSnapshot().operations[attempt.operationId]?.acceptance).toBe('unknown');
    const retry = session.dispatch({ type: 'retryOperation', operationId: attempt.operationId });
    expect(retry.operationId).toBe(attempt.operationId);
    expect(retry.attemptId).not.toBe(attempt.attemptId);
    expect((await retry.delivery).status).toBe('delivered');
    await until(session, state => state.pendingInteractions.length === 1);
    expect(requests.some(request => request.url.endsWith(`/operations/${attempt.operationId}`))).toBe(true);
    expect(requests.filter(request => request.method === 'POST')).toHaveLength(2);
    expect(session.getSnapshot().operations[attempt.operationId]?.acceptance).toBe('accepted');
    expect(projectAgentView(session.getSnapshot()).executions[0]!.id).toBe(executionId);
  });

  it('replay is passive and cancellation requires a distinct confirmed backend action', async () => {
    const session = makeSession();
    await session.dispatch({ type: 'send', input: { text: 'Cancel test' } }).delivery;
    await until(session, view => view.pendingInteractions.length === 2);
    const executionId = projectAgentView(session.getSnapshot()).executions[0]!.id;
    const replay = makeSession(adapter(), session.exportSnapshot(), 'replay');
    const count = requests.length;
    expect((await replay.dispatch({ type: 'send', input: { text: 'Never execute' } }).delivery).status).toBe('failed');
    expect(requests).toHaveLength(count);
    const beforeDisconnect = session.getSnapshot().executions[executionId]?.status;
    await session.dispatch({ type: 'disconnect', executionId }).delivery;
    expect(session.getSnapshot().executions[executionId]?.status).toBe(beforeDisconnect);
    await session.dispatch({ type: 'cancelExecution', executionId }).delivery;
    await until(session, view => view.executions[0]?.status === 'cancelled');
    expect(projectAgentView(session.getSnapshot()).pendingInteractions).toHaveLength(0);
    expect(requests.filter(request => request.method === 'POST')).toHaveLength(2);
  });
});
