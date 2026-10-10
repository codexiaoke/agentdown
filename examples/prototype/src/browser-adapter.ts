import { AdapterDeliveryError } from '@agentdown/core';
import type { ActionError, AdapterContext, AdapterOperation, AdapterReceipt, AgentAdapter, DomainEvent, EventEnvelope, EventSubscription, ExecutionStatus, Interaction, JsonValue, UserInput } from '@agentdown/core';

export interface BrowserFixtureStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface BrowserReferenceOptions { readonly storage?: BrowserFixtureStorage; readonly storageKey?: string; readonly stepDelay?: number }
export interface BrowserReferenceAdapter extends AgentAdapter { loseNextAcknowledgement(): void }

type Phase = 'planning' | 'waiting' | 'finishing' | 'terminal';
interface Execution {
  id: string; conversationId: string; turnId: string; input: UserInput; runId: string; messageId: string;
  status: ExecutionStatus; phase: Phase; events: EventEnvelope[]; interactions: Record<string, Interaction>;
}
interface FixtureState {
  schemaVersion: 1; executions: Record<string, Execution>;
  turns: Record<string, { conversationId: string; input: UserInput }>;
  operations: Record<string, { fingerprint: string; executionId: string }>;
}
const approvals = [
  { key: 'save', name: 'save_report', prompt: '允许保存这份演示报告吗？' },
  { key: 'publish', name: 'publish_summary', prompt: '允许公开报告摘要吗？' },
] as const;
const terminal = new Set(['completed', 'failed', 'cancelled']);
const fresh = (): FixtureState => ({ schemaVersion: 1, executions: {}, turns: {}, operations: {} });
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
}
function reject(code: ActionError['code'], message: string): never {
  throw new AdapterDeliveryError({ status: 'failed', error: { code, message }, retryable: false });
}
function require(condition: unknown, code: ActionError['code'], message: string): asserts condition { if (!condition) reject(code, message); }
function validId(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && !['__proto__', 'constructor', 'prototype'].includes(value); }
function cursorNumber(value: string | undefined, latest: number): number {
  if (value === undefined) return 0;
  require(/^(0|[1-9]\d*)$/.test(value), 'invalidInput', '演示游标格式无效。');
  const cursor = Number(value);
  require(Number.isSafeInteger(cursor) && cursor <= latest, 'conflict', '演示游标超出了已保存的事件。');
  return cursor;
}

/**
 * Browser-only, no-model fixture for the public static preview. It performs no
 * HTTP requests. Its local backend log is separate from the core/UI archive.
 * Construction is passive: storage and timers are first used by an action.
 */
export function createBrowserReferenceAdapter(options: BrowserReferenceOptions = {}): BrowserReferenceAdapter {
  const storageKey = options.storageKey ?? 'agentdown-next:browser-reference:v1';
  const delay = options.stepDelay ?? 350;
  let memory = fresh();
  let loseAcknowledgement = false;
  const scheduled = new Map<string, ReturnType<typeof setTimeout>>();
  const observers = new Map<string, Set<() => void>>();
  function storage(): BrowserFixtureStorage | undefined {
    if (options.storage) return options.storage;
    try { return typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage; }
    catch { return undefined; }
  }
  function load(): FixtureState {
    const target = storage();
    if (!target) return memory;
    let raw: string | null;
    try { raw = target.getItem(storageKey); } catch { reject('transport', '浏览器无法读取演示任务存储。'); }
    if (!raw) return memory;
    try {
      const value = JSON.parse(raw) as FixtureState;
      require(value.schemaVersion === 1 && value.executions && value.operations && value.turns && !Array.isArray(value.executions), 'invalidInput', '浏览器演示任务存储已损坏。');
      memory = value;
      return value;
    } catch { reject('transport', '浏览器演示任务存储已损坏，请清除演示存储后重新开始。'); }
  }
  function save(state: FixtureState): void {
    memory = state;
    try { storage()?.setItem(storageKey, JSON.stringify(state)); }
    catch { throw new AdapterDeliveryError({ status: 'uncertain', reason: '演示操作已处理，但浏览器任务存储无法写入。' }); }
    for (const callbacks of observers.values()) for (const callback of [...callbacks]) callback();
  }
  function emit(execution: Execution, event: DomainEvent): void {
    const cursor = String(execution.events.length + 1);
    execution.events.push({ streamId: execution.id, executionId: execution.id, eventId: cursor, cursor, event: clone(event) });
  }
  function status(execution: Execution, value: ExecutionStatus): void { execution.status = value; emit(execution, { type: 'execution.updated', status: value }); }
  function run(execution: Execution, value: ExecutionStatus): void {
    emit(execution, { type: 'run.upsert', run: { id: execution.runId, executionId: execution.id, title: '浏览器演示任务', status: value } });
  }
  function step(execution: Execution, key: string, title: string, value: ExecutionStatus): void {
    emit(execution, { type: 'step.upsert', step: { id: `${execution.id}:step:${key}`, executionId: execution.id, runId: execution.runId, title, status: value } });
  }
  function tool(execution: Execution, approval: (typeof approvals)[number], value: ExecutionStatus, output?: JsonValue): void {
    emit(execution, { type: 'tool.upsert', tool: { id: `${execution.id}:tool:${approval.key}`, executionId: execution.id, runId: execution.runId, name: approval.name, status: value, input: { text: execution.input.text }, ...(output === undefined ? {} : { output }) } });
  }
  function schedule(execution: Execution): void {
    if (!['planning', 'finishing'].includes(execution.phase) || scheduled.has(execution.id)) return;
    const phase = execution.phase;
    scheduled.set(execution.id, setTimeout(() => {
      scheduled.delete(execution.id);
      try {
        const state = load(); const current = state.executions[execution.id];
        // Phase guards make a restored tab and an older local timer idempotent.
        if (!current || current.phase !== phase || terminal.has(current.status)) return;
        if (phase === 'planning') {
          emit(current, { type: 'message.delta', messageId: current.messageId, delta: '我会先整理任务，再分别请求保存报告和公开摘要的许可。' });
          for (const approval of approvals) {
            tool(current, approval, 'waiting');
            const interaction: Interaction = { id: `${current.id}:approval:${approval.key}`, executionId: current.id, runId: current.runId, toolCallId: `${current.id}:tool:${approval.key}`, kind: 'approval', prompt: approval.prompt, revision: 1, status: 'pending', responseSchema: { type: 'object', required: ['approved'], properties: { approved: { type: 'boolean' } }, additionalProperties: false } };
            current.interactions[interaction.id] = interaction;
            emit(current, { type: 'interaction.upsert', interaction });
          }
          current.phase = 'waiting'; run(current, 'waiting'); status(current, 'waiting');
        } else {
          const decisions = approvals.map(approval => ({ action: approval.name, approved: (current.interactions[`${current.id}:approval:${approval.key}`]!.response as { approved: boolean }).approved }));
          emit(current, { type: 'artifact.upsert', artifact: { id: `${current.id}:report`, executionId: current.id, title: '任务报告', kind: 'report', revision: 1, status: 'ready', content: { summary: '这是浏览器无模型演示生成的报告。', input: current.input.text, decisions } } });
          emit(current, { type: 'message.delta', messageId: current.messageId, delta: '\n\n报告已生成。被拒绝的操作已跳过；你的决定会保留在报告中。' });
          emit(current, { type: 'message.completed', messageId: current.messageId });
          step(current, 'result', '生成最终报告', 'completed'); run(current, 'completed'); status(current, 'completed'); current.phase = 'terminal';
        }
        save(state);
      } catch { /* The next explicit resume reports inaccessible fixture storage. */ }
    }, delay));
  }
  function receipt(operation: AdapterOperation, execution: Execution): AdapterReceipt {
    const cursor = operation.cursors[execution.id] ?? operation.cursor;
    cursorNumber(cursor, execution.events.length);
    return { confirmation: 'backend', remoteId: operation.operationId, subscription: { streamId: execution.id, executionId: execution.id, ...(cursor === undefined ? {} : { cursor }) } };
  }
  async function execute(operation: AdapterOperation, context: AdapterContext): Promise<AdapterReceipt> {
    if (context.signal.aborted) throw new AdapterDeliveryError({ status: 'failed', error: { code: 'transport', message: '演示请求尚未开始。' }, retryable: true });
    for (const identity of [operation.operationId, operation.attemptId, operation.conversationId, operation.turnId, operation.executionId]) require(validId(identity), 'invalidInput', '演示操作身份无效。');
    require(context.conversationId === operation.conversationId, 'invalidInput', '演示操作会话身份不匹配。');
    const action = operation.action;
    require(['send', 'respond', 'regenerate', 'resume', 'cancelExecution'].includes(action.type), 'unsupported', '浏览器演示不支持这个操作。');
    const intent = canonical({ conversationId: operation.conversationId, executionId: operation.executionId, turnId: operation.turnId, interactionRevision: operation.interactionRevision ?? null, action });
    const state = load();
    const previous = state.operations[operation.operationId];
    if (previous) {
      require(previous.fingerprint === intent, 'conflict', '同一操作身份不能更改业务内容。');
      const execution = state.executions[previous.executionId]!;
      const result = receipt(operation, execution); schedule(execution); return result;
    }
    let execution: Execution;
    if (action.type === 'send' || action.type === 'regenerate') {
      require(!state.executions[operation.executionId], 'conflict', '演示执行身份已经存在。');
      require(Object.values(state.executions).filter(item => item.conversationId === operation.conversationId && !terminal.has(item.status)).length < 1, 'conflict', '请先完成或取消当前演示任务。');
      let input: UserInput;
      if (action.type === 'send') {
        require(typeof action.input?.text === 'string' && action.input.text.trim(), 'invalidInput', '请输入演示任务。');
        require(!state.turns[operation.turnId], 'conflict', '演示输入身份已经存在。'); input = clone(action.input);
      } else {
        const turn = state.turns[action.turnId];
        require(turn && turn.conversationId === operation.conversationId && action.turnId === operation.turnId, 'invalidInput', '找不到重新生成所需的原始输入。');
        if (action.fromExecutionId !== undefined) require(state.executions[action.fromExecutionId]?.turnId === action.turnId && state.executions[action.fromExecutionId]?.conversationId === operation.conversationId, 'invalidInput', '上次执行不属于此输入。');
        input = clone(turn.input);
      }
      execution = { id: operation.executionId, conversationId: operation.conversationId, turnId: operation.turnId, input, runId: `${operation.executionId}:run`, messageId: `${operation.executionId}:assistant`, status: 'pending', phase: 'planning', events: [], interactions: {} };
    } else {
      const existing = state.executions[operation.executionId];
      require(existing && existing.conversationId === operation.conversationId && existing.turnId === operation.turnId, 'invalidInput', '找不到此会话的演示执行。'); execution = existing;
      if (action.type === 'resume' || action.type === 'cancelExecution') require(action.executionId === execution.id, 'invalidInput', '演示执行目标不匹配。');
      if (action.type === 'respond') {
        const interaction = execution.interactions[action.interactionId];
        require(!terminal.has(execution.status), 'expired', '此演示执行已经结束。');
        require(interaction && interaction.status === 'pending', 'conflict', '这项决定已经确认或不存在。');
        require(operation.interactionRevision === interaction.revision, 'conflict', '待确认事项的版本已经改变。');
        require(action.response && typeof action.response === 'object' && !Array.isArray(action.response) && 'approved' in action.response && typeof action.response.approved === 'boolean' && Object.keys(action.response).length === 1, 'invalidInput', '演示审批仅接受 approved 布尔值。');
      }
      if (action.type === 'cancelExecution') require(!terminal.has(execution.status), 'conflict', '演示执行已经结束。');
    }
    const result = receipt(operation, execution); // Validate the cursor before mutating business state.
    state.executions[execution.id] = execution;
    if (action.type === 'send') state.turns[operation.turnId] = { conversationId: operation.conversationId, input: execution.input };
    state.operations[operation.operationId] = { fingerprint: intent, executionId: execution.id };
    if (action.type !== 'resume') emit(execution, { type: 'operation.accepted', operationId: operation.operationId, remoteId: operation.operationId });
    if (action.type === 'send' || action.type === 'regenerate') {
      status(execution, 'running'); run(execution, 'running');
      emit(execution, { type: 'message.upsert', message: { id: execution.messageId, executionId: execution.id, turnId: execution.turnId, runId: execution.runId, role: 'assistant', text: '', status: 'streaming', createdAt: Date.now() } });
      step(execution, 'prepare', '整理计划与需要确认的操作', 'running');
    }
    if (action.type === 'respond') {
      const interaction = execution.interactions[action.interactionId]!;
      const response = clone(action.response) as { approved: boolean };
      const resolved: Interaction = { ...interaction, status: 'resolved', revision: interaction.revision + 1, response };
      execution.interactions[interaction.id] = resolved;
      emit(execution, { type: 'interaction.resolved', interactionId: interaction.id, revision: resolved.revision, response });
      const approval = approvals.find(item => interaction.toolCallId === `${execution.id}:tool:${item.key}`)!;
      tool(execution, approval, response.approved ? 'completed' : 'cancelled', response);
      if (Object.values(execution.interactions).every(item => item.status === 'resolved')) {
        execution.phase = 'finishing'; run(execution, 'running'); status(execution, 'running');
        step(execution, 'prepare', '整理计划与需要确认的操作', 'completed'); step(execution, 'result', '生成最终报告', 'running');
        emit(execution, { type: 'message.delta', messageId: execution.messageId, delta: '\n\n两项决定均已确认，正在生成结果。' });
      }
    }
    if (action.type === 'cancelExecution') {
      for (const interaction of Object.values(execution.interactions)) if (interaction.status === 'pending') {
        const expired: Interaction = { ...interaction, status: 'expired', revision: interaction.revision + 1 };
        execution.interactions[interaction.id] = expired; emit(execution, { type: 'interaction.upsert', interaction: expired });
        tool(execution, approvals.find(item => interaction.toolCallId === `${execution.id}:tool:${item.key}`)!, 'cancelled');
      }
      step(execution, execution.phase === 'finishing' ? 'result' : 'prepare', execution.phase === 'finishing' ? '生成最终报告' : '整理计划与需要确认的操作', 'cancelled');
      emit(execution, { type: 'message.completed', messageId: execution.messageId }); run(execution, 'cancelled'); status(execution, 'cancelled'); execution.phase = 'terminal';
    }
    save(state); schedule(execution);
    if (loseAcknowledgement && action.type !== 'resume') {
      loseAcknowledgement = false;
      throw new AdapterDeliveryError({ status: 'uncertain', reason: '浏览器演示已处理操作，但故意丢失了这次确认。可沿原操作身份重试。' });
    }
    return result;
  }
  async function* events(subscription: EventSubscription, context: AdapterContext): AsyncIterable<EventEnvelope> {
    const first = load().executions[subscription.executionId];
    require(first && first.conversationId === context.conversationId && subscription.streamId === first.id, 'invalidInput', '找不到此会话的演示事件流。');
    let after = cursorNumber(subscription.cursor, first.events.length);
    while (!context.signal.aborted) {
      const execution = load().executions[subscription.executionId]!;
      for (const envelope of execution.events.slice(after)) {
        if (context.signal.aborted) return;
        after = Number(envelope.cursor); yield clone(envelope);
      }
      if (terminal.has(execution.status)) return;
      await new Promise<void>((resolve) => {
        const callbacks = observers.get(execution.id) ?? new Set<() => void>();
        observers.set(execution.id, callbacks);
        let timer: ReturnType<typeof setTimeout>;
        const wake = (): void => { clearTimeout(timer); callbacks.delete(wake); context.signal.removeEventListener('abort', wake); resolve(); };
        callbacks.add(wake); context.signal.addEventListener('abort', wake, { once: true });
        // Poll only while an explicit connection is active, to observe another tab's local fixture writes.
        timer = setTimeout(wake, Math.max(20, Math.min(delay, 250)));
        if (context.signal.aborted) wake();
      });
    }
  }
  return {
    id: 'agentdown-browser-reference', version: '1',
    capabilities: { maxConcurrentExecutions: 1, respond: true, regenerate: true, cancelExecution: true, resume: true, operationIdempotency: true },
    execute, events,
    loseNextAcknowledgement(): void { loseAcknowledgement = true; },
  };
}
