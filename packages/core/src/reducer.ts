import type { DomainEvent, Operation, SessionSnapshot } from './types.js';
import { freeze } from './validation.js';

const terminal = new Set(['completed', 'failed', 'cancelled']);
function acknowledged(operation: Operation, remoteId?: string): Operation {
  const { error: _error, retryable: _retryable, ...rest } = operation;
  return freeze({ ...rest, status: 'delivered', acceptance: 'accepted', ...(remoteId === undefined ? {} : { remoteId }) });
}
/** Only already validated canonical facts enter this deterministic reducer. */
export function reduceEvent(snapshot: SessionSnapshot, executionId: string, event: DomainEvent): Partial<SessionSnapshot> {
  switch (event.type) {
    case 'execution.updated': {
      const current = snapshot.executions[executionId]!;
      if (terminal.has(current.status) && current.status !== event.status) return {};
      return { executions: { ...snapshot.executions, [executionId]: freeze({ ...current, status: event.status, ...(event.error === undefined ? {} : { error: event.error }) }) } };
    }
    case 'run.upsert': {
      const current = snapshot.runs[event.run.id];
      if (current && terminal.has(current.status) && event.run.status !== current.status) return {};
      const execution = snapshot.executions[executionId]!;
      return {
        runs: { ...snapshot.runs, [event.run.id]: event.run },
        ...(execution.runIds.includes(event.run.id) ? {} : { executions: { ...snapshot.executions, [executionId]: freeze({ ...execution, runIds: [...execution.runIds, event.run.id] }) } }),
      };
    }
    case 'message.upsert': {
      const current = snapshot.messages[event.message.id];
      if (current?.status === 'complete' && event.message.status === 'streaming') return {};
      return { messages: { ...snapshot.messages, [event.message.id]: event.message }, ...(current ? {} : { messageOrder: [...snapshot.messageOrder, event.message.id] }) };
    }
    case 'message.delta': {
      const current = snapshot.messages[event.messageId]!;
      if (current.status !== 'streaming') return {};
      return { messages: { ...snapshot.messages, [current.id]: freeze({ ...current, text: current.text + event.delta }) } };
    }
    case 'message.completed': {
      const current = snapshot.messages[event.messageId]!;
      return { messages: { ...snapshot.messages, [current.id]: freeze({ ...current, status: 'complete' }) } };
    }
    case 'step.upsert': {
      const current = snapshot.steps[event.step.id];
      if (current && terminal.has(current.status) && event.step.status !== current.status) return {};
      return { steps: { ...snapshot.steps, [event.step.id]: event.step } };
    }
    case 'tool.upsert': {
      const current = snapshot.tools[event.tool.id];
      if (current && terminal.has(current.status) && event.tool.status !== current.status) return {};
      return { tools: { ...snapshot.tools, [event.tool.id]: event.tool } };
    }
    case 'interaction.upsert': {
      const current = snapshot.interactions[event.interaction.id];
      if (current && current.revision > event.interaction.revision) return {};
      if (current && current.revision === event.interaction.revision && ['resolved', 'expired'].includes(current.status) && event.interaction.status !== current.status) return {};
      const next = current && current.revision === event.interaction.revision && ['submitting', 'awaitingConfirmation'].includes(current.status) && event.interaction.status === 'pending'
        ? freeze({ ...event.interaction, status: current.status, ...(current.operationId === undefined ? {} : { operationId: current.operationId }), ...(current.response === undefined ? {} : { response: current.response }) })
        : event.interaction;
      return { interactions: { ...snapshot.interactions, [next.id]: next } };
    }
    case 'interaction.resolved': {
      const current = snapshot.interactions[event.interactionId]!;
      if (current.revision > event.revision) return {};
      const operation = current.operationId === undefined ? undefined : snapshot.operations[current.operationId];
      return {
        interactions: { ...snapshot.interactions, [current.id]: freeze({ ...current, revision: event.revision, status: 'resolved', response: event.response }) },
        ...(operation && operation.acceptance !== 'rejected' ? { operations: { ...snapshot.operations, [operation.id]: acknowledged(operation) } } : {}),
      };
    }
    case 'artifact.upsert': {
      const current = snapshot.artifacts[event.artifact.id];
      if (current && current.revision > event.artifact.revision) return {};
      return { artifacts: { ...snapshot.artifacts, [event.artifact.id]: event.artifact } };
    }
    case 'operation.accepted': {
      const current = snapshot.operations[event.operationId]!;
      if (current.acceptance === 'rejected') return {};
      return { operations: { ...snapshot.operations, [current.id]: acknowledged(current, event.remoteId) } };
    }
    case 'operation.rejected': {
      const current = snapshot.operations[event.operationId]!;
      if (current.acceptance === 'accepted') return {};
      const interaction = current.action.type === 'respond' ? snapshot.interactions[current.action.interactionId] : undefined;
      const { operationId: _operationId, response: _response, ...rest } = interaction ?? {};
      return {
        operations: { ...snapshot.operations, [current.id]: freeze({ ...current, acceptance: 'rejected', error: event.error, retryable: false }) },
        ...(['send', 'regenerate'].includes(current.action.type) && current.executionId && !terminal.has(snapshot.executions[current.executionId]!.status)
          ? { executions: { ...snapshot.executions, [current.executionId]: freeze({ ...snapshot.executions[current.executionId]!, status: 'failed', error: event.error.message }) } }
          : {}),
        ...(interaction && interaction.operationId === current.id && interaction.status !== 'resolved' ? { interactions: { ...snapshot.interactions, [interaction.id]: freeze({ ...rest, status: 'pending' }) as typeof interaction } } : {}),
      };
    }
  }
}
