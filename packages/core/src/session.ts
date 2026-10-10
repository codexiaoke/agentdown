import type { AgentAction, AgentCapabilities, AgentSession, AgentSessionOptions, AdapterOperation, BackendAction, Connection, DeliveryOutcome, EventEnvelope, EventSubscription, Operation, OperationHandle, SessionArchive, SessionSnapshot } from './types.js';
import { AdapterDeliveryError } from './errors.js';
import { projectAgentView } from './projection.js';
import { reduceEvent } from './reducer.js';
import { assert, cloneJson, freeze, id, object, validateAction, validateArchive, validateEvent } from './validation.js';

interface Attempt {
  readonly operationId: string; readonly attemptId: string; readonly handle: OperationHandle;
  readonly controller: AbortController; readonly resolve: (outcome: DeliveryOutcome) => void;
  started: boolean; settled: boolean;
}
interface Stream { readonly executionId: string; readonly epoch: number; readonly controller: AbortController }
const terminal = new Set(['completed', 'failed', 'cancelled']);
function failure(code: 'unsupported' | 'invalidInput' | 'conflict' | 'expired' | 'disposed' | 'transport', message: string, retryable = false): DeliveryOutcome {
  return freeze({ status: 'failed', error: { code, message }, retryable });
}
function validCapabilities(value: unknown): asserts value is AgentCapabilities {
  assert(object(value), 'Adapter capabilities must be an object');
  assert(value.maxConcurrentExecutions === undefined || (typeof value.maxConcurrentExecutions === 'number' && Number.isInteger(value.maxConcurrentExecutions) && value.maxConcurrentExecutions > 0), 'Invalid concurrency capability');
  for (const key of ['respond', 'regenerate', 'cancelExecution', 'resume', 'operationIdempotency', 'operationQuery', 'surfaceAction', 'updateAgentState']) assert(value[key] === undefined || typeof value[key] === 'boolean', `Invalid ${key} capability`);
}

/** A single-conversation external store. Construction and subscriptions are passive. */
export function createAgentSession(options: AgentSessionOptions): AgentSession {
  assert(id(options.conversationId), 'conversationId must be a nonempty stable identity');
  assert(id(options.adapter.id) && id(options.adapter.version), 'Adapter identity and version are required');
  assert(options.mode === undefined || options.mode === 'live' || options.mode === 'replay', 'Unknown Session mode');
  const clock = options.clock ?? Date.now;
  let sequence = 0;
  const instanceId = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const createId = (kind: Parameters<NonNullable<AgentSessionOptions['createId']>>[0]): string => {
    const result = options.createId ? options.createId(kind) : `${kind}-${instanceId}-${++sequence}`;
    assert(id(result), 'ID generator must return a stable nonempty identity');
    return result;
  };
  const empty = Object.freeze({});
  let snapshot: SessionSnapshot = freeze({
    revision: 0, conversationId: options.conversationId, mode: options.mode ?? 'live', disposed: false,
    capabilities: {}, turns: empty, executions: empty, runs: empty, messages: empty, steps: empty, tools: empty,
    interactions: empty, artifacts: empty, operations: empty, connections: empty, messageOrder: [],
  });
  const cursors: Record<string, string> = Object.create(null) as Record<string, string>;
  const dedupe: Record<string, Set<string>> = Object.create(null) as Record<string, Set<string>>;
  if (options.initialSnapshot !== undefined) {
    validateArchive(options.initialSnapshot, options.conversationId, options.adapter.id, options.adapter.version);
    const archive = cloneJson(options.initialSnapshot);
    // A restored client has no physical connections or in-flight requests.
    const connections = Object.fromEntries(Object.entries(archive.snapshot.connections).map(([streamId, connection]) => [streamId, { ...connection, status: 'disconnected' as const, epoch: connection.epoch + 1 }]));
    const operations = Object.fromEntries(Object.entries(archive.snapshot.operations).map(([operationId, operation]) => [operationId, ['queued', 'sending'].includes(operation.status) ? { ...operation, status: 'uncertain' as const } : operation]));
    const interactions = Object.fromEntries(Object.entries(archive.snapshot.interactions).map(([interactionId, interaction]) => [interactionId, interaction.status === 'submitting' ? { ...interaction, status: 'awaitingConfirmation' as const } : interaction]));
    snapshot = freeze({ ...archive.snapshot, revision: archive.snapshot.revision + 1, mode: options.mode ?? 'live', disposed: false, connections, operations, interactions });
    Object.assign(cursors, archive.cursors);
    for (const [streamId, entries] of Object.entries(archive.dedupe)) dedupe[streamId] = new Set(entries);
  }
  const listeners = new Set<() => void>();
  const attempts = new Map<string, Attempt>();
  const handles = new Map<string, OperationHandle>();
  const streams = new Map<string, Stream>();
  function commit(patch: Partial<SessionSnapshot>): void {
    if (Object.keys(patch).length === 0) return;
    snapshot = freeze({ ...snapshot, ...patch, revision: snapshot.revision + 1 });
    for (const listener of [...listeners]) {
      // Subscriber exceptions cannot roll back a committed event or interrupt other subscribers.
      try { listener(); } catch { /* host observers own their errors */ }
    }
  }
  function capabilities(): AgentCapabilities {
    const source = typeof options.adapter.capabilities === 'function' ? options.adapter.capabilities({ conversationId: options.conversationId, snapshot }) : options.adapter.capabilities;
    validCapabilities(source);
    const next = freeze(cloneJson(source));
    if (JSON.stringify(next) !== JSON.stringify(snapshot.capabilities)) commit({ capabilities: next });
    return next;
  }
  capabilities();
  function newAttempt(operationId: string): Attempt {
    const attemptId = createId('attempt');
    let resolve!: (outcome: DeliveryOutcome) => void;
    const delivery = new Promise<DeliveryOutcome>((finish) => { resolve = finish; });
    const handle = Object.freeze({ operationId, attemptId, delivery });
    const attempt: Attempt = { operationId, attemptId, handle, resolve, controller: new AbortController(), started: false, settled: false };
    attempts.set(attemptId, attempt);
    handles.set(operationId, handle);
    return attempt;
  }
  function settle(attempt: Attempt, outcome: DeliveryOutcome): void {
    if (attempt.settled) return;
    attempt.settled = true;
    attempts.delete(attempt.attemptId);
    const operation = snapshot.operations[attempt.operationId];
    if (operation && operation.attemptId === attempt.attemptId) {
      const { error: _error, retryable: _retryable, ...rest } = operation;
      const next: Operation = freeze({
        ...rest, status: outcome.status,
        ...(outcome.status === 'failed' ? { error: outcome.error, retryable: outcome.retryable } : {}),
        ...(outcome.status === 'delivered' && outcome.confirmation === 'backend' ? { acceptance: 'accepted' } : {}),
        ...(outcome.status === 'delivered' && outcome.remoteId !== undefined ? { remoteId: outcome.remoteId } : {}),
      });
      const interaction = operation.action.type === 'respond' ? snapshot.interactions[operation.action.interactionId] : undefined;
      const execution = operation.executionId === undefined ? undefined : snapshot.executions[operation.executionId];
      let interactions: Partial<SessionSnapshot> = {};
      if (interaction?.operationId === operation.id && !['resolved', 'expired'].includes(interaction.status)) {
        if (outcome.status === 'failed') {
          const { operationId: _operationId, response: _response, ...remaining } = interaction;
          interactions = { interactions: { ...snapshot.interactions, [interaction.id]: freeze({ ...remaining, status: 'pending' }) } };
        } else interactions = { interactions: { ...snapshot.interactions, [interaction.id]: freeze({ ...interaction, status: 'awaitingConfirmation' }) } };
      }
      commit({
        operations: { ...snapshot.operations, [operation.id]: next }, ...interactions,
        ...(outcome.status === 'failed' && execution && ['send', 'regenerate'].includes(operation.action.type) && !terminal.has(execution.status)
          ? { executions: { ...snapshot.executions, [execution.id]: freeze({ ...execution, status: 'failed', error: outcome.error.message }) } }
          : {}),
      });
    }
    attempt.resolve(freeze(outcome));
  }
  function rejectAction(action: AgentAction, outcome: DeliveryOutcome): OperationHandle {
    const operationId = createId('operation');
    const attempt = newAttempt(operationId);
    commit({ operations: { ...snapshot.operations, [operationId]: freeze({ id: operationId, action, attemptId: attempt.attemptId, attemptCount: 1, status: 'queued', acceptance: 'unknown', createdAt: clock() }) } });
    settle(attempt, outcome);
    return attempt.handle;
  }
  function passiveFailure(outcome: DeliveryOutcome): OperationHandle {
    return Object.freeze({ operationId: createId('operation'), attemptId: createId('attempt'), delivery: Promise.resolve(freeze(outcome)) });
  }
  function isCurrent(streamId: string, stream: Stream): boolean {
    return !snapshot.disposed && !stream.controller.signal.aborted && streams.get(streamId) === stream;
  }
  async function consume(subscription: EventSubscription, stream: Stream): Promise<void> {
    try {
      const context = { conversationId: options.conversationId, snapshot, signal: stream.controller.signal };
      for await (const raw of options.adapter.events(subscription, context)) {
        if (!isCurrent(subscription.streamId, stream)) return;
        assert(object(raw) && raw.streamId === subscription.streamId && raw.executionId === subscription.executionId && (raw.eventId === undefined || id(raw.eventId)) && (raw.cursor === undefined || typeof raw.cursor === 'string'), 'Event envelope does not belong to this subscription');
        const envelope: EventEnvelope = cloneJson(raw);
        const eventKey = envelope.eventId === undefined ? (envelope.cursor === undefined ? undefined : `cursor:${envelope.cursor}`) : `event:${envelope.eventId}`;
        const seen = dedupe[subscription.streamId] ?? new Set<string>();
        if (eventKey !== undefined && seen.has(eventKey)) continue;
        validateEvent(envelope.event, envelope.executionId, snapshot);
        const patch = reduceEvent(snapshot, envelope.executionId, freeze(envelope.event));
        const current = snapshot.connections[subscription.streamId]!;
        // State, dedupe and cursor are committed before observers can export an archive.
        if (eventKey !== undefined) seen.add(eventKey);
        dedupe[subscription.streamId] = seen;
        if (envelope.cursor !== undefined) cursors[subscription.streamId] = envelope.cursor;
        commit({ ...patch, connections: { ...snapshot.connections, [subscription.streamId]: freeze({ ...current, ...(envelope.cursor === undefined ? {} : { cursor: envelope.cursor }) }) } });
      }
      if (isCurrent(subscription.streamId, stream)) {
        streams.delete(subscription.streamId);
        const current = snapshot.connections[subscription.streamId]!;
        commit({ connections: { ...snapshot.connections, [subscription.streamId]: freeze({ ...current, status: 'disconnected' }) } });
      }
    } catch {
      if (isCurrent(subscription.streamId, stream)) {
        streams.delete(subscription.streamId);
        stream.controller.abort();
        const current = snapshot.connections[subscription.streamId]!;
        commit({ connections: { ...snapshot.connections, [subscription.streamId]: freeze({ ...current, status: 'error', error: 'Event stream failed or produced an invalid event' }) } });
      }
    }
  }
  function resumeCursor(executionId: string): string | undefined {
    const connections = Object.values(snapshot.connections).filter((connection) => connection.executionId === executionId && connection.cursor !== undefined);
    // Never mix cursors from distinct streams. Multi-stream adapters use the full cursor map.
    return connections.length === 1 ? connections[0]!.cursor : undefined;
  }
  async function execute(attempt: Attempt): Promise<void> {
    if (attempt.settled || snapshot.disposed || attempt.controller.signal.aborted) return;
    const operation = snapshot.operations[attempt.operationId]!;
    const action = operation.action as BackendAction;
    const cursor = resumeCursor(operation.executionId!);
    const adapterOperation: AdapterOperation = freeze({ operationId: operation.id, attemptId: attempt.attemptId, conversationId: options.conversationId, action, executionId: operation.executionId!, turnId: operation.turnId!, cursors: { ...cursors }, ...(operation.interactionRevision === undefined ? {} : { interactionRevision: operation.interactionRevision }), ...(cursor === undefined ? {} : { cursor }) });
    attempt.started = true;
    commit({ operations: { ...snapshot.operations, [operation.id]: freeze({ ...operation, status: 'sending' }) } });
    if (attempt.settled || snapshot.disposed || attempt.controller.signal.aborted) return;
    try {
      const receipt = await options.adapter.execute(adapterOperation, { conversationId: options.conversationId, snapshot, signal: attempt.controller.signal });
      if (attempt.settled || snapshot.disposed || attempt.controller.signal.aborted) return;
      assert(object(receipt) && ['transport', 'backend'].includes(receipt.confirmation) && (receipt.remoteId === undefined || typeof receipt.remoteId === 'string'), 'Invalid adapter receipt');
      const subscription = receipt.subscription === undefined ? undefined : freeze(cloneJson(receipt.subscription));
      if (subscription !== undefined) {
        assert(id(subscription.streamId) && subscription.executionId === operation.executionId && (subscription.cursor === undefined || typeof subscription.cursor === 'string'), 'Receipt subscription belongs to another execution');
        assert(!snapshot.connections[subscription.streamId] || snapshot.connections[subscription.streamId]?.executionId === operation.executionId, 'Stream identity belongs to another execution');
        if (subscription.data !== undefined) cloneJson(subscription.data);
      }
      settle(attempt, { status: 'delivered', confirmation: receipt.confirmation, ...(receipt.remoteId === undefined ? {} : { remoteId: receipt.remoteId }) });
      if (snapshot.disposed || attempt.controller.signal.aborted || subscription === undefined) {
        attempt.controller.abort();
        return;
      }
      // A receipt cursor is a requested start point, never evidence that events were committed.
      const old = streams.get(subscription.streamId);
      old?.controller.abort();
      const current = snapshot.connections[subscription.streamId];
      const epoch = (current?.epoch ?? 0) + 1;
      const stream: Stream = { executionId: operation.executionId!, epoch, controller: attempt.controller };
      streams.set(subscription.streamId, stream);
      commit({ connections: { ...snapshot.connections, [subscription.streamId]: freeze({ streamId: subscription.streamId, executionId: operation.executionId!, epoch, status: 'connected', ...(cursors[subscription.streamId] === undefined ? {} : { cursor: cursors[subscription.streamId] }) }) } });
      if (isCurrent(subscription.streamId, stream)) void consume(subscription, stream);
    } catch (error) {
      if (attempt.settled || snapshot.disposed || attempt.controller.signal.aborted) return;
      attempt.controller.abort();
      settle(attempt, error instanceof AdapterDeliveryError ? error.outcome : { status: 'uncertain', reason: 'The request was issued but delivery could not be confirmed' });
    }
  }
  function close(executionId?: string): void {
    const next = { ...snapshot.connections };
    for (const [streamId, stream] of streams) {
      if (executionId === undefined || stream.executionId === executionId) {
        streams.delete(streamId);
        stream.controller.abort();
        next[streamId] = freeze({ ...next[streamId]!, epoch: stream.epoch + 1, status: 'disconnected' });
      }
    }
    for (const attempt of [...attempts.values()]) {
      if (executionId === undefined || snapshot.operations[attempt.operationId]?.executionId === executionId) {
        attempt.controller.abort();
        settle(attempt, attempt.started ? { status: 'uncertain', reason: 'Client connection closed before delivery was confirmed' } : failure('transport', 'Client connection closed before the request was issued', true));
      }
    }
    commit({ connections: next });
  }
  function prepare(action: AgentAction, caps: AgentCapabilities): DeliveryOutcome | undefined {
    if (snapshot.disposed) return failure('disposed', 'Session has been disposed');
    if (snapshot.mode === 'replay') return failure('unsupported', 'Replay sessions cannot dispatch operations');
    if (action.type === 'surfaceAction' || action.type === 'updateAgentState') return failure('unsupported', 'This content extension is not implemented in the contract prototype');
    if (action.type === 'send' || action.type === 'regenerate') {
      if (!projectAgentView(snapshot).canSend) return failure('conflict', 'Maximum concurrent executions reached');
    }
    if (action.type === 'send' && action.parentExecutionId !== undefined && !snapshot.executions[action.parentExecutionId]) return failure('invalidInput', 'Parent execution does not exist');
    if (action.type === 'regenerate') {
      if (caps.regenerate !== true) return failure('unsupported', 'Adapter does not support regeneration');
      if (!snapshot.turns[action.turnId] || (action.fromExecutionId !== undefined && snapshot.executions[action.fromExecutionId]?.turnId !== action.turnId)) return failure('invalidInput', 'Regeneration turn or previous execution does not exist');
    }
    if (action.type === 'respond') {
      if (caps.respond !== true) return failure('unsupported', 'Adapter does not support interactions');
      const interaction = snapshot.interactions[action.interactionId];
      if (!interaction) return failure('invalidInput', 'Interaction does not exist');
      if (interaction.status === 'expired') return failure('expired', 'Interaction has expired');
      if (interaction.status !== 'pending') return failure('conflict', 'Interaction already has a pending or final decision');
      if (interaction.kind === 'approval' && (!object(action.response) || typeof action.response.approved !== 'boolean')) return failure('invalidInput', 'Approval response requires approved: boolean');
    }
    if (action.type === 'cancelExecution' || action.type === 'resume') {
      if (caps[action.type] !== true) return failure('unsupported', `Adapter does not support ${action.type}`);
      const execution = snapshot.executions[action.executionId];
      if (!execution) return failure('invalidInput', 'Execution does not exist');
      if (terminal.has(execution.status)) return failure('conflict', 'Execution has already reached a terminal outcome');
      if (action.type === 'resume' && (Object.values(snapshot.connections).some((connection) => connection.executionId === action.executionId && ['connecting', 'connected', 'reconnecting'].includes(connection.status)) || [...attempts.values()].some((attempt) => snapshot.operations[attempt.operationId]?.executionId === action.executionId))) return failure('conflict', 'Execution already has a live connection or pending request');
    }
    if (action.type === 'disconnect' && action.executionId !== undefined && !snapshot.executions[action.executionId]) return failure('invalidInput', 'Execution does not exist');
    return undefined;
  }
  function dispatch(rawAction: AgentAction): OperationHandle {
    if (snapshot.disposed) return passiveFailure(failure('disposed', 'Session has been disposed'));
    if (snapshot.mode === 'replay') return passiveFailure(failure('unsupported', 'Replay sessions cannot dispatch operations'));
    let action: AgentAction;
    try { validateAction(rawAction); action = freeze(cloneJson(rawAction)); }
    catch { return rejectAction(freeze({ type: 'updateAgentState', update: null }), failure('invalidInput', 'Action is invalid or is not serializable JSON')); }
    let caps: AgentCapabilities;
    try { caps = capabilities(); } catch { return rejectAction(action, failure('unsupported', 'Adapter capabilities are invalid')); }
    if (action.type === 'respond') {
      const interaction = snapshot.interactions[action.interactionId];
      const operation = interaction?.operationId === undefined ? undefined : snapshot.operations[interaction.operationId];
      const handle = operation === undefined ? undefined : handles.get(operation.id);
      if (operation && handle && ['queued', 'sending', 'delivered', 'uncertain'].includes(operation.status) && operation.acceptance !== 'rejected' && JSON.stringify(operation.action) === JSON.stringify(action)) return handle;
    }
    if (action.type === 'retryOperation') {
      const original = snapshot.operations[action.operationId];
      if (!original) return rejectAction(action, failure('invalidInput', 'Operation does not exist'));
      if (original.acceptance !== 'unknown') return rejectAction(action, failure('conflict', 'Backend has already confirmed this operation'));
      const existing = handles.get(original.id);
      if (['queued', 'sending'].includes(original.status) && existing) return existing;
      if (original.status === 'uncertain' && caps.operationIdempotency !== true) return rejectAction(action, failure('unsupported', 'Uncertain delivery requires backend operation idempotency before retry'));
      if (original.status !== 'uncertain' && !(original.status === 'failed' && original.retryable === true)) return rejectAction(action, failure('conflict', 'Operation is not eligible for retry'));
      if (['disconnect', 'retryOperation', 'surfaceAction', 'updateAgentState'].includes(original.action.type) || !original.executionId || !original.turnId) return rejectAction(action, failure('unsupported', 'Operation cannot be retried'));
      if (original.action.type === 'respond') {
        const interaction = snapshot.interactions[original.action.interactionId];
        if (caps.respond !== true) return rejectAction(action, failure('unsupported', 'Adapter no longer supports interactions'));
        if (!interaction || interaction.revision !== original.interactionRevision || ['resolved', 'expired'].includes(interaction.status)) return rejectAction(action, failure('conflict', 'Interaction changed or ended before retry'));
        if (interaction.operationId !== undefined && interaction.operationId !== original.id) return rejectAction(action, failure('conflict', 'Interaction already has another decision'));
      }
      if (original.status === 'failed' && ['send', 'regenerate'].includes(original.action.type) && !projectAgentView(snapshot).canSend) return rejectAction(action, failure('conflict', 'Maximum concurrent executions reached'));
      const attempt = newAttempt(original.id);
      const { error: _error, retryable: _retryable, ...rest } = original;
      const execution = snapshot.executions[original.executionId]!;
      const { error: _executionError, ...executionRest } = execution;
      commit({
        operations: { ...snapshot.operations, [original.id]: freeze({ ...rest, attemptId: attempt.attemptId, attemptCount: original.attemptCount + 1, status: 'queued' }) },
        ...(original.status === 'failed' && ['send', 'regenerate'].includes(original.action.type)
          ? { executions: { ...snapshot.executions, [execution.id]: freeze({ ...executionRest, status: 'pending' }) } }
          : {}),
      });
      void Promise.resolve().then(() => execute(attempt));
      return attempt.handle;
    }
    const invalid = prepare(action, caps);
    if (invalid) return rejectAction(action, invalid);
    const operationId = createId('operation');
    const attempt = newAttempt(operationId);
    let executionId: string | undefined;
    let turnId: string | undefined;
    let interactionRevision: number | undefined;
    let patch: Partial<SessionSnapshot> = {};
    if (action.type === 'send') {
      turnId = createId('turn'); executionId = createId('execution'); const messageId = createId('message');
      patch = {
        turns: { ...snapshot.turns, [turnId]: freeze({ id: turnId, input: action.input, inputMessageId: messageId, executionIds: [executionId], ...(action.parentExecutionId === undefined ? {} : { parentExecutionId: action.parentExecutionId }) }) },
        executions: { ...snapshot.executions, [executionId]: freeze({ id: executionId, turnId, status: 'pending', runIds: [] }) },
        messages: { ...snapshot.messages, [messageId]: freeze({ id: messageId, turnId, executionId, role: 'user', text: action.input.text, status: 'complete', createdAt: clock() }) },
        messageOrder: [...snapshot.messageOrder, messageId],
      };
    } else if (action.type === 'regenerate') {
      turnId = action.turnId; executionId = createId('execution');
      const turn = snapshot.turns[turnId]!;
      patch = { turns: { ...snapshot.turns, [turnId]: freeze({ ...turn, executionIds: [...turn.executionIds, executionId] }) }, executions: { ...snapshot.executions, [executionId]: freeze({ id: executionId, turnId, status: 'pending', runIds: [], ...(action.fromExecutionId === undefined ? {} : { previousExecutionId: action.fromExecutionId }) }) } };
    } else if (action.type === 'respond') {
      const interaction = snapshot.interactions[action.interactionId]!;
      executionId = interaction.executionId; turnId = snapshot.executions[executionId]!.turnId;
      interactionRevision = interaction.revision;
      patch = { interactions: { ...snapshot.interactions, [interaction.id]: freeze({ ...interaction, status: 'submitting', operationId, response: action.response }) } };
    } else if (action.type === 'resume' || action.type === 'cancelExecution') {
      executionId = action.executionId; turnId = snapshot.executions[executionId]!.turnId;
    } else if (action.type === 'disconnect') {
      executionId = action.executionId; turnId = executionId === undefined ? undefined : snapshot.executions[executionId]!.turnId;
    }
    commit({ ...patch, operations: { ...snapshot.operations, [operationId]: freeze({ id: operationId, action, attemptId: attempt.attemptId, attemptCount: 1, status: 'queued', acceptance: 'unknown', createdAt: clock(), ...(executionId === undefined ? {} : { executionId }), ...(turnId === undefined ? {} : { turnId }), ...(interactionRevision === undefined ? {} : { interactionRevision }) }) } });
    if (action.type === 'disconnect') {
      // Exclude this local operation from requests closed by its own command.
      attempts.delete(attempt.attemptId);
      close(action.executionId);
      settle(attempt, { status: 'delivered', confirmation: 'transport' });
    } else void Promise.resolve().then(() => execute(attempt));
    return attempt.handle;
  }
  return Object.freeze({
    conversationId: options.conversationId,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void): () => void {
      if (snapshot.disposed) return () => {};
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispatch,
    exportSnapshot(): SessionArchive {
      return freeze({ schemaVersion: 1, conversationId: options.conversationId, adapter: { id: options.adapter.id, version: options.adapter.version }, snapshot, dedupe: Object.fromEntries(Object.entries(dedupe).map(([streamId, entries]) => [streamId, [...entries]])), cursors: { ...cursors } });
    },
    dispose(): void {
      if (snapshot.disposed) return;
      // Mark terminal before aborting to isolate late asynchronous callbacks.
      commit({ disposed: true });
      for (const stream of streams.values()) stream.controller.abort();
      streams.clear();
      for (const attempt of [...attempts.values()]) {
        attempt.controller.abort();
        settle(attempt, attempt.started ? { status: 'uncertain', reason: 'Session disposed before delivery was confirmed' } : failure('disposed', 'Session disposed before request was issued'));
      }
      commit({ connections: Object.fromEntries(Object.entries(snapshot.connections).map(([streamId, connection]) => [streamId, freeze({ ...connection, epoch: connection.epoch + 1, status: 'disconnected' as const })])) });
      listeners.clear();
    },
  });
}
