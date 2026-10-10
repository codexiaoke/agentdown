import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
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

  it('refreshes backend authorization for send, restored resume and lost-ACK query without archiving credentials', async () => {
    const credentials = ['fixture-send-token', 'fixture-resume-token', 'fixture-decision-token', 'fixture-query-token'];
    let token = credentials[0]!;
    const authenticatedRequests: { url: string; method: string; authorization: string | undefined }[] = [];
    // Observe the actual HTTP request received by the fixture, not only fetch options.
    server.on('request', (request: IncomingMessage) => {
      authenticatedRequests.push({
        url: request.url ?? '', method: request.method ?? 'GET', authorization: request.headers.authorization,
      });
    });
    const identity = { id: 'custom-backend', version: '2026-10' };
    const authenticatedAdapter = () => createReferenceAdapter({
      endpoint, ...identity, headers: () => ({ Authorization: `Bearer ${token}` }),
    });
    const original = makeSession(authenticatedAdapter());
    const send = original.dispatch({ type: 'send', input: { text: 'Authenticated recovery test' } });
    expect((await send.delivery).status).toBe('delivered');
    await until(original, view => view.pendingInteractions.length === 2);
    expect(authenticatedRequests).toEqual([
      { url: '/api/operations', method: 'POST', authorization: `Bearer ${credentials[0]}` },
    ]);
    const archive = original.exportSnapshot();
    expect(archive.adapter).toEqual(identity);
    const executionId = projectAgentView(original.getSnapshot()).executions[0]!.id;
    original.dispose();

    token = credentials[1]!;
    const transport = authenticatedAdapter();
    const restored = makeSession(transport, archive);
    expect(authenticatedRequests).toHaveLength(1);
    expect((await restored.dispatch({ type: 'resume', executionId }).delivery).status).toBe('delivered');
    await expect.poll(() => authenticatedRequests.find(request => request.url.includes('/events?cursor='))).toEqual({
      url: expect.stringContaining(`/api/executions/${executionId}/events?cursor=`),
      method: 'GET', authorization: `Bearer ${credentials[1]}`,
    });

    await restored.dispatch({ type: 'disconnect', executionId }).delivery;
    token = credentials[2]!;
    transport.loseNextAcknowledgement();
    const decision = restored.dispatch({
      type: 'respond', interactionId: projectAgentView(restored.getSnapshot()).pendingInteractions[0]!.id,
      response: { approved: true },
    });
    expect((await decision.delivery).status).toBe('uncertain');
    token = credentials[3]!;
    const retry = restored.dispatch({ type: 'retryOperation', operationId: decision.operationId });
    expect(retry.operationId).toBe(decision.operationId);
    expect((await retry.delivery).status).toBe('delivered');
    await until(restored, view => view.pendingInteractions.length === 1);
    expect(authenticatedRequests.filter(request => request.method === 'POST').map(request => request.authorization)).toEqual([
      `Bearer ${credentials[0]}`, `Bearer ${credentials[2]}`,
    ]);
    expect(authenticatedRequests.find(request => request.url.endsWith(`/operations/${decision.operationId}`))).toEqual({
      url: `/api/operations/${decision.operationId}`, method: 'GET', authorization: `Bearer ${credentials[3]}`,
    });
    expect(authenticatedRequests.filter(request => request.url.includes('/events?cursor=')).map(request => request.authorization)).toEqual([
      `Bearer ${credentials[1]}`, `Bearer ${credentials[3]}`,
    ]);
    expect(restored.getSnapshot().operations[decision.operationId]?.acceptance).toBe('accepted');
    expect(restored.exportSnapshot().adapter).toEqual(identity);
    for (const saved of [archive, restored.exportSnapshot()]) {
      const serialized = JSON.stringify(saved);
      for (const credential of credentials) expect(serialized).not.toContain(credential);
      expect(serialized).not.toContain('Authorization');
      expect(serialized).not.toContain('Bearer');
      expect(serialized).not.toContain('headers');
    }
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
