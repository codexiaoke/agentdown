import { describe, expect, it, vi } from 'vitest';
import { createAgentSession, projectAgentView } from '@agentdown/core';
import type { AdapterContext, AdapterOperation, AgentSession } from '@agentdown/core';
import { createBrowserReferenceAdapter } from '../../examples/prototype/src/browser-adapter.js';

function storage() {
  const values = new Map<string, string>();
  return { getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value); }), values };
}
function view(session: AgentSession) { return projectAgentView(session.getSnapshot()); }
async function approvals(session: AgentSession) { await expect.poll(() => view(session).pendingInteractions.length).toBe(2); return view(session).pendingInteractions; }
async function complete(session: AgentSession) { await expect.poll(() => view(session).executions.at(-1)?.status).toBe('completed'); }

describe('static preview browser fixture', () => {
  it('constructs passively without storage access or HTTP', () => {
    const local = storage(); const adapter = createBrowserReferenceAdapter({ storage: local, stepDelay: 0 });
    const session = createAgentSession({ conversationId: 'passive', adapter });
    const unsubscribe = session.subscribe(() => {});
    expect(local.getItem).not.toHaveBeenCalled(); expect(local.setItem).not.toHaveBeenCalled();
    unsubscribe(); session.dispose();
  });

  it('runs progress, two independent approvals and a compatible final report', async () => {
    const local = storage(); const adapter = createBrowserReferenceAdapter({ storage: local, stepDelay: 0 });
    const session = createAgentSession({ conversationId: 'full-flow', adapter });
    expect(await session.dispatch({ type: 'send', input: { text: 'Review agentdown' } }).delivery).toMatchObject({ status: 'delivered', confirmation: 'backend' });
    const pending = await approvals(session);
    expect(view(session).tools.map(tool => tool.name)).toEqual(['save_report', 'publish_summary']);
    await session.dispatch({ type: 'respond', interactionId: pending[0]!.id, response: { approved: true } }).delivery;
    await expect.poll(() => view(session).pendingInteractions.length).toBe(1);
    await session.dispatch({ type: 'respond', interactionId: pending[1]!.id, response: { approved: false } }).delivery;
    await complete(session);
    expect(view(session).artifacts[0]?.content).toEqual({ summary: '这是浏览器无模型演示生成的报告。', input: 'Review agentdown', decisions: [{ action: 'save_report', approved: true }, { action: 'publish_summary', approved: false }] });
    expect(view(session).messages.filter(message => message.role === 'assistant')).toHaveLength(1);
    expect(local.values.has('agentdown-next:browser-reference:v1')).toBe(true);
    session.dispose();
  });

  it('restores separate backend logs, resumes saved cursors and completes after a refresh', async () => {
    const local = storage(); const adapter = createBrowserReferenceAdapter({ storage: local, stepDelay: 40 });
    const session = createAgentSession({ conversationId: 'refresh', adapter });
    await session.dispatch({ type: 'send', input: { text: 'Refresh test' } }).delivery;
    const pending = await approvals(session);
    await session.dispatch({ type: 'respond', interactionId: pending[0]!.id, response: { approved: true } }).delivery;
    await expect.poll(() => view(session).interactions[0]?.status).toBe('resolved');
    const archive = session.exportSnapshot(); session.dispose();
    const reloadedAdapter = createBrowserReferenceAdapter({ storage: local, stepDelay: 0 });
    const reads = local.getItem.mock.calls.length;
    const restored = createAgentSession({ conversationId: 'refresh', adapter: reloadedAdapter, initialSnapshot: archive });
    expect(local.getItem.mock.calls.length).toBe(reads);
    const executionId = view(restored).executions[0]!.id;
    await restored.dispatch({ type: 'resume', executionId }).delivery;
    await restored.dispatch({ type: 'respond', interactionId: pending[1]!.id, response: { approved: false } }).delivery;
    await complete(restored);
    const answer = view(restored).messages.find(message => message.role === 'assistant')!;
    expect(answer.text.split('我会先整理任务').length).toBe(2);
    expect(view(restored).artifacts).toHaveLength(1);
    expect(view(restored).interactions.every(interaction => interaction.status === 'resolved')).toBe(true);
    restored.dispose();
  });

  it('loses an accepted decision ACK and safely retries without applying the decision twice', async () => {
    const local = storage(); const adapter = createBrowserReferenceAdapter({ storage: local, stepDelay: 0 });
    const session = createAgentSession({ conversationId: 'lost-ack', adapter });
    await session.dispatch({ type: 'send', input: { text: 'Do once' } }).delivery;
    const pending = await approvals(session); const executionId = view(session).executions[0]!.id;
    await session.dispatch({ type: 'disconnect', executionId }).delivery;
    adapter.loseNextAcknowledgement();
    await session.dispatch({ type: 'resume', executionId }).delivery;
    // Recovery is observational; it must not consume a simulation armed for a business decision.
    await session.dispatch({ type: 'disconnect', executionId }).delivery;
    const decision = session.dispatch({ type: 'respond', interactionId: pending[0]!.id, response: { approved: true } });
    expect(await decision.delivery).toMatchObject({ status: 'uncertain' });
    const retry = session.dispatch({ type: 'retryOperation', operationId: decision.operationId });
    expect(retry.operationId).toBe(decision.operationId);
    expect(await retry.delivery).toMatchObject({ status: 'delivered', confirmation: 'backend' });
    await expect.poll(() => view(session).interactions[0]?.status).toBe('resolved');
    const backend = JSON.parse(local.getItem('agentdown-next:browser-reference:v1')!);
    const events = backend.executions[executionId].events;
    expect(events.filter((envelope: { event: { type: string; interactionId?: string } }) => envelope.event.type === 'interaction.resolved' && envelope.event.interactionId === pending[0]!.id)).toHaveLength(1);
    expect(view(session).interactions[0]?.revision).toBe(2);
    session.dispose();
  });

  it('rejects stale decision revisions and reused operation IDs with changed business intent', async () => {
    const local = storage(); const adapter = createBrowserReferenceAdapter({ storage: local, stepDelay: 0 });
    const session = createAgentSession({ conversationId: 'conditional', adapter });
    await session.dispatch({ type: 'send', input: { text: 'Revision test' } }).delivery;
    const pending = await approvals(session); const execution = view(session).executions[0]!;
    const operation: AdapterOperation = { operationId: 'manual-decision', attemptId: 'attempt-one', conversationId: 'conditional', executionId: execution.id, turnId: execution.turnId, action: { type: 'respond', interactionId: pending[0]!.id, response: { approved: true } }, interactionRevision: 0, cursors: {} };
    const context: AdapterContext = { conversationId: 'conditional', snapshot: session.getSnapshot(), signal: new AbortController().signal };
    await expect(adapter.execute(operation, context)).rejects.toMatchObject({ outcome: { status: 'failed', error: { code: 'conflict' } } });
    await adapter.execute({ ...operation, interactionRevision: 1 }, context);
    await expect(adapter.execute({ ...operation, interactionRevision: 1, attemptId: 'attempt-two', action: { type: 'respond', interactionId: pending[0]!.id, response: { approved: false } } }, context)).rejects.toMatchObject({ outcome: { status: 'failed', error: { code: 'conflict' } } });
    session.dispose();
  });

  it('cancels with authoritative events and regenerates the same turn as a new execution', async () => {
    const adapter = createBrowserReferenceAdapter({ storage: storage(), stepDelay: 0 });
    const session = createAgentSession({ conversationId: 'cancel', adapter });
    await session.dispatch({ type: 'send', input: { text: 'Cancel and regenerate' } }).delivery;
    const first = view(session).executions[0]!;
    await session.dispatch({ type: 'cancelExecution', executionId: first.id }).delivery;
    await expect.poll(() => view(session).executions[0]!.status).toBe('cancelled');
    await session.dispatch({ type: 'regenerate', turnId: first.turnId, fromExecutionId: first.id }).delivery;
    const pending = await approvals(session);
    expect(view(session).executions).toHaveLength(2);
    expect(view(session).executions[1]!.turnId).toBe(first.turnId);
    expect(pending[0]!.executionId).not.toBe(first.id);
    session.dispose();
  });
});
