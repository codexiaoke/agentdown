import type { AgentAction, DomainEvent, JsonValue, SessionArchive, SessionSnapshot } from './types.js';

export function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function id(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !['__proto__', 'constructor', 'prototype'].includes(value);
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function integer(value: unknown): value is number { return finite(value) && Number.isInteger(value) && value >= 0; }
export function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
export function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** Reject mutable or executable objects before they enter snapshots or archives. */
export function assertJson(value: unknown): asserts value is JsonValue {
  const path = new Set<object>();
  function visit(item: unknown, depth: number): void {
    assert(depth <= 100, 'JSON nesting exceeds 100 levels');
    if (item === null || typeof item === 'string' || typeof item === 'boolean' || finite(item)) return;
    assert(typeof item === 'object' && item !== null, 'Value must be serializable JSON');
    assert(!path.has(item), 'JSON must not contain circular references');
    assert(Array.isArray(item) || Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null, 'JSON must not contain class instances');
    path.add(item);
    if (Array.isArray(item)) for (const child of item) visit(child, depth + 1);
    else for (const [key, child] of Object.entries(item)) { assert(id(key), 'JSON object contains a reserved key'); visit(child, depth + 1); }
    path.delete(item);
  }
  visit(value, 0);
}
export function cloneJson<T>(value: T): T { assertJson(value); return JSON.parse(JSON.stringify(value)) as T; }
function optionalId(value: unknown): boolean { return value === undefined || id(value); }
function resource(value: unknown): boolean {
  return object(value) && typeof value.uri === 'string' && value.uri.length > 0 && (value.filename === undefined || typeof value.filename === 'string') && (value.mime === undefined || typeof value.mime === 'string') && (value.size === undefined || (finite(value.size) && value.size >= 0));
}
function input(value: unknown): boolean {
  return object(value) && typeof value.text === 'string' && (value.attachments === undefined || (Array.isArray(value.attachments) && value.attachments.every(resource))) && (value.text.trim().length > 0 || (Array.isArray(value.attachments) && value.attachments.length > 0));
}
export function validateAction(value: unknown): asserts value is AgentAction {
  assertJson(value);
  assert(object(value), 'Action must be an object');
  switch (value.type) {
    case 'send': assert(input(value.input) && optionalId(value.parentExecutionId), 'send requires nonempty input and valid parent execution'); break;
    case 'respond': assert(id(value.interactionId) && value.response !== undefined, 'respond requires interactionId and JSON response'); break;
    case 'regenerate': assert(id(value.turnId) && optionalId(value.fromExecutionId), 'regenerate requires turnId'); break;
    case 'cancelExecution': case 'resume': assert(id(value.executionId), 'Action requires executionId'); break;
    case 'disconnect': assert(optionalId(value.executionId), 'disconnect executionId is invalid'); break;
    case 'retryOperation': assert(id(value.operationId), 'retryOperation requires operationId'); break;
    case 'surfaceAction': assert(id(value.surfaceId) && value.action !== undefined, 'surfaceAction requires surfaceId and JSON action'); break;
    case 'updateAgentState': assert(value.update !== undefined, 'updateAgentState requires JSON update'); break;
    default: throw new Error('Unknown action type');
  }
}
const statuses = ['pending', 'running', 'waiting', 'completed', 'failed', 'cancelled'];
function entity(value: unknown, executionId: string): value is Record<string, unknown> { return object(value) && id(value.id) && value.executionId === executionId; }
function status(value: unknown): boolean { return typeof value === 'string' && statuses.includes(value); }
function ownedRun(value: Record<string, unknown>, snapshot: SessionSnapshot, executionId: string): boolean {
  return value.runId === undefined || (id(value.runId) && snapshot.runs[value.runId]?.executionId === executionId);
}
export function validateEvent(value: unknown, executionId: string, snapshot: SessionSnapshot): asserts value is DomainEvent {
  assertJson(value);
  assert(object(value), 'Event must be an object');
  switch (value.type) {
    case 'execution.updated': assert(status(value.status) && (value.error === undefined || typeof value.error === 'string'), 'Invalid execution update'); break;
    case 'run.upsert': {
      const run = value.run;
      assert(entity(run, executionId) && status(run.status) && optionalId(run.parentRunId) && (run.title === undefined || typeof run.title === 'string'), 'Invalid run');
      assert(run.parentRunId === undefined || (snapshot.runs[run.parentRunId as string]?.executionId === executionId && run.parentRunId !== run.id), 'Run parent must belong to execution');
      assert(!snapshot.runs[run.id as string] || snapshot.runs[run.id as string]?.executionId === executionId, 'Run identity belongs to another execution');
      break;
    }
    case 'message.upsert': {
      const message = value.message;
      assert(entity(message, executionId) && message.turnId === snapshot.executions[executionId]?.turnId && ownedRun(message, snapshot, executionId) && ['user', 'assistant', 'system', 'tool'].includes(message.role as string) && typeof message.text === 'string' && ['streaming', 'complete', 'failed'].includes(message.status as string) && finite(message.createdAt), 'Invalid message');
      assert(!snapshot.messages[message.id as string] || snapshot.messages[message.id as string]?.executionId === executionId, 'Message identity belongs to another execution');
      break;
    }
    case 'message.delta': case 'message.completed': assert(id(value.messageId) && snapshot.messages[value.messageId]?.executionId === executionId && (value.type !== 'message.delta' || typeof value.delta === 'string'), 'Message event requires an existing owned message'); break;
    case 'step.upsert': {
      const step = value.step;
      assert(entity(step, executionId) && ownedRun(step, snapshot, executionId) && typeof step.title === 'string' && status(step.status) && optionalId(step.parentStepId), 'Invalid step');
      assert(step.parentStepId === undefined || snapshot.steps[step.parentStepId as string]?.executionId === executionId, 'Step parent must belong to execution');
      assert(!snapshot.steps[step.id as string] || snapshot.steps[step.id as string]?.executionId === executionId, 'Step identity belongs to another execution');
      break;
    }
    case 'tool.upsert': {
      const tool = value.tool;
      assert(entity(tool, executionId) && ownedRun(tool, snapshot, executionId) && typeof tool.name === 'string' && status(tool.status), 'Invalid tool');
      assert(!snapshot.tools[tool.id as string] || snapshot.tools[tool.id as string]?.executionId === executionId, 'Tool identity belongs to another execution');
      break;
    }
    case 'interaction.upsert': {
      const interaction = value.interaction;
      assert(entity(interaction, executionId) && ownedRun(interaction, snapshot, executionId) && ['approval', 'input', 'form', 'handoff'].includes(interaction.kind as string) && typeof interaction.prompt === 'string' && integer(interaction.revision) && ['pending', 'submitting', 'awaitingConfirmation', 'resolved', 'expired', 'failed'].includes(interaction.status as string) && optionalId(interaction.operationId) && optionalId(interaction.toolCallId) && (interaction.responseSchema === undefined || object(interaction.responseSchema)), 'Invalid interaction');
      assert(interaction.toolCallId === undefined || snapshot.tools[interaction.toolCallId as string]?.executionId === executionId, 'Interaction tool must belong to execution');
      assert(!snapshot.interactions[interaction.id as string] || snapshot.interactions[interaction.id as string]?.executionId === executionId, 'Interaction identity belongs to another execution');
      break;
    }
    case 'interaction.resolved': assert(id(value.interactionId) && snapshot.interactions[value.interactionId]?.executionId === executionId && value.response !== undefined && integer(value.revision), 'Interaction resolution requires existing owned interaction'); break;
    case 'artifact.upsert': {
      const artifact = value.artifact;
      assert(entity(artifact, executionId) && typeof artifact.title === 'string' && typeof artifact.kind === 'string' && integer(artifact.revision) && ['building', 'ready', 'failed', 'removed'].includes(artifact.status as string) && (artifact.resource === undefined || resource(artifact.resource)), 'Invalid artifact');
      assert(!snapshot.artifacts[artifact.id as string] || snapshot.artifacts[artifact.id as string]?.executionId === executionId, 'Artifact identity belongs to another execution');
      break;
    }
    case 'operation.accepted': case 'operation.rejected': assert(id(value.operationId) && snapshot.operations[value.operationId]?.executionId === executionId && (value.type !== 'operation.rejected' || (object(value.error) && ['unsupported', 'invalidInput', 'conflict', 'expired', 'disposed', 'transport'].includes(value.error.code as string) && typeof value.error.message === 'string')) && (value.remoteId === undefined || typeof value.remoteId === 'string'), 'Operation confirmation requires existing owned operation'); break;
    default: throw new Error('Unknown domain event');
  }
}
/** Import is a versioned transaction, never an unchecked cast of stored data. */
export function validateArchive(value: unknown, conversationId: string, adapterId: string, adapterVersion: string): asserts value is SessionArchive {
  assertJson(value);
  assert(object(value) && value.schemaVersion === 1 && value.conversationId === conversationId && object(value.adapter) && value.adapter.id === adapterId && value.adapter.version === adapterVersion, 'Archive schema, conversation or adapter version mismatch');
  const snapshot = value.snapshot;
  assert(object(snapshot) && snapshot.conversationId === conversationId && integer(snapshot.revision) && ['live', 'replay'].includes(snapshot.mode as string) && typeof snapshot.disposed === 'boolean' && object(snapshot.capabilities), 'Invalid archived snapshot');
  const maps = ['turns', 'executions', 'runs', 'messages', 'steps', 'tools', 'interactions', 'artifacts', 'operations', 'connections'] as const;
  for (const map of maps) {
    assert(object(snapshot[map]), `Archive ${map} must be a record`);
    for (const [key, item] of Object.entries(snapshot[map])) assert(id(key) && object(item) && (map === 'connections' ? item.streamId : item.id) === key, `Archive ${map} identity mismatch`);
  }
  const typed = snapshot as unknown as SessionSnapshot;
  for (const key of ['respond', 'regenerate', 'cancelExecution', 'resume', 'operationIdempotency', 'operationQuery', 'surfaceAction', 'updateAgentState']) assert(snapshot.capabilities[key] === undefined || typeof snapshot.capabilities[key] === 'boolean', 'Invalid archived capabilities');
  assert(snapshot.capabilities.maxConcurrentExecutions === undefined || (integer(snapshot.capabilities.maxConcurrentExecutions) && snapshot.capabilities.maxConcurrentExecutions > 0), 'Invalid archived concurrency capability');
  for (const turn of Object.values(typed.turns)) {
    assert(input(turn.input) && id(turn.inputMessageId) && Array.isArray(turn.executionIds) && turn.executionIds.every((executionId) => typed.executions[executionId]?.turnId === turn.id) && optionalId(turn.parentExecutionId) && (turn.parentExecutionId === undefined || typed.executions[turn.parentExecutionId]), 'Invalid archived turn');
    assert(typed.messages[turn.inputMessageId]?.turnId === turn.id && typed.messages[turn.inputMessageId]?.role === 'user', 'Archived turn must own its user message');
  }
  for (const execution of Object.values(typed.executions)) {
    assert(id(execution.turnId) && typed.turns[execution.turnId]?.executionIds.includes(execution.id) && status(execution.status) && Array.isArray(execution.runIds) && execution.runIds.every((runId) => typed.runs[runId]?.executionId === execution.id) && optionalId(execution.previousExecutionId) && (execution.previousExecutionId === undefined || typed.executions[execution.previousExecutionId]?.turnId === execution.turnId), 'Invalid archived execution');
  }
  for (const [map, field, type] of [['runs', 'run', 'run.upsert'], ['messages', 'message', 'message.upsert'], ['steps', 'step', 'step.upsert'], ['tools', 'tool', 'tool.upsert'], ['interactions', 'interaction', 'interaction.upsert'], ['artifacts', 'artifact', 'artifact.upsert']] as const) {
    for (const item of Object.values(typed[map])) { assert(id(item.executionId) && typed.executions[item.executionId], `Archive ${map} owner missing`); validateEvent({ type, [field]: item }, item.executionId, typed); if (map === 'runs') assert(typed.executions[item.executionId]!.runIds.includes(item.id), 'Archive execution must list its run'); }
  }
  assert(Array.isArray(typed.messageOrder) && typed.messageOrder.length === new Set(typed.messageOrder).size && typed.messageOrder.every((messageId) => id(messageId) && typed.messages[messageId]) && typed.messageOrder.length === Object.keys(typed.messages).length, 'Invalid archived message order');
  for (const operation of Object.values(typed.operations)) {
    validateAction(operation.action);
    assert(id(operation.attemptId) && integer(operation.attemptCount) && operation.attemptCount > 0 && finite(operation.createdAt) && ['queued', 'sending', 'delivered', 'uncertain', 'failed'].includes(operation.status) && ['unknown', 'accepted', 'rejected'].includes(operation.acceptance) && optionalId(operation.executionId) && optionalId(operation.turnId) && (operation.executionId === undefined || typed.executions[operation.executionId]) && (operation.turnId === undefined || typed.turns[operation.turnId]), 'Invalid archived operation');
    if (operation.executionId !== undefined && operation.turnId !== undefined) assert(typed.executions[operation.executionId]?.turnId === operation.turnId, 'Archived operation execution/turn mismatch');
    assert(operation.interactionRevision === undefined || integer(operation.interactionRevision), 'Invalid archived interaction revision');
    assert(operation.retryable === undefined || typeof operation.retryable === 'boolean', 'Invalid archived retry status');
    if (operation.action.type === 'respond' && operation.executionId !== undefined) assert(integer(operation.interactionRevision) && typed.interactions[operation.action.interactionId]?.executionId === operation.executionId, 'Archived response operation requires its interaction and frozen revision');
  }
  for (const connection of Object.values(typed.connections)) assert(id(connection.executionId) && typed.executions[connection.executionId] && integer(connection.epoch) && ['idle', 'connecting', 'connected', 'reconnecting', 'disconnected', 'error'].includes(connection.status) && (connection.cursor === undefined || typeof connection.cursor === 'string'), 'Invalid archived connection');
  assert(object(value.dedupe) && object(value.cursors), 'Archive requires dedupe and cursor maps');
  for (const [streamId, entries] of Object.entries(value.dedupe)) assert(id(streamId) && typed.connections[streamId] && Array.isArray(entries) && entries.every((entry) => typeof entry === 'string') && new Set(entries).size === entries.length, 'Invalid archived dedupe information');
  for (const [streamId, cursor] of Object.entries(value.cursors)) assert(id(streamId) && typeof cursor === 'string' && typed.connections[streamId]?.cursor === cursor, 'Archive cursor must match committed connection');
  for (const connection of Object.values(typed.connections)) assert(connection.cursor === undefined || value.cursors[connection.streamId] === connection.cursor, 'Archive omits a committed cursor');
}
