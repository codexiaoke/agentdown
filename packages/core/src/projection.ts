import type { AgentViewSnapshot, SessionSnapshot } from './types.js';

const cache = new WeakMap<SessionSnapshot, AgentViewSnapshot>();
const active = new Set(['pending', 'running', 'waiting']);

/** Pure projection. The same committed snapshot always produces the same view reference. */
export function projectAgentView(snapshot: SessionSnapshot): AgentViewSnapshot {
  const existing = cache.get(snapshot);
  if (existing) return existing;
  const executions = Object.freeze(Object.values(snapshot.executions));
  const activeExecutions = Object.freeze(executions.filter((execution) => active.has(execution.status)));
  const usable = !snapshot.disposed && snapshot.mode === 'live';
  const value: AgentViewSnapshot = Object.freeze({
    revision: snapshot.revision,
    conversationId: snapshot.conversationId,
    mode: snapshot.mode,
    disposed: snapshot.disposed,
    messages: Object.freeze(snapshot.messageOrder.map((id) => snapshot.messages[id]!).filter(Boolean)),
    executions,
    activeExecutions,
    runs: Object.freeze(Object.values(snapshot.runs)),
    steps: Object.freeze(Object.values(snapshot.steps)),
    tools: Object.freeze(Object.values(snapshot.tools)),
    interactions: Object.freeze(Object.values(snapshot.interactions)),
    pendingInteractions: Object.freeze(Object.values(snapshot.interactions).filter((interaction) => ['pending', 'submitting', 'awaitingConfirmation'].includes(interaction.status))),
    artifacts: Object.freeze(Object.values(snapshot.artifacts)),
    operations: Object.freeze(Object.values(snapshot.operations)),
    connections: Object.freeze(Object.values(snapshot.connections)),
    canSend: usable && activeExecutions.length < (snapshot.capabilities.maxConcurrentExecutions ?? 1),
    canResume: usable && snapshot.capabilities.resume === true && activeExecutions.some((execution) => !Object.values(snapshot.connections).some((connection) => connection.executionId === execution.id && ['connecting', 'connected', 'reconnecting'].includes(connection.status))),
    canCancel: usable && snapshot.capabilities.cancelExecution === true && activeExecutions.length > 0,
  });
  cache.set(snapshot, value);
  return value;
}
