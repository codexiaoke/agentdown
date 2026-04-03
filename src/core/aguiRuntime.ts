import { computed, shallowRef, type ComputedRef, type InjectionKey, type ShallowRef } from 'vue';
import type {
  AguiBinding,
  AguiNodePatch,
  AguiRuntime,
  AguiRuntimeEvent,
  AguiRuntimeReducerResult,
  AgentNodeState,
  CreateAguiRuntimeOptions,
  StatePatch
} from './types';

export const AGUI_RUNTIME_KEY: InjectionKey<AguiRuntime | null> = Symbol('AGUI_RUNTIME_KEY');

/** 把内部可写 ref 包装成对外只读引用。 */
function asReadonlyRef<T>(value: ShallowRef<T>): Readonly<ShallowRef<T>> {
  return value as Readonly<ShallowRef<T>>;
}

/** 为首次出现的节点生成一份默认状态。 */
function createDefaultNodeState(id: string): AgentNodeState {
  return {
    id,
    kind: 'agent',
    status: 'idle',
    title: id,
    childrenIds: [],
    meta: {}
  };
}

/** 去掉 patch 中的 undefined，兼容 exactOptionalPropertyTypes。 */
function compactPatch<T extends object>(patch: StatePatch<T>): Partial<T> {
  // exactOptionalPropertyTypes 下，未提供的字段要直接省掉，而不是写成 undefined。
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<T>;
}

/** 合并默认 patch 和用户 patch，并保留 meta 的增量合并语义。 */
function mergeNodePatches(basePatch: AguiNodePatch, overridePatch?: AguiNodePatch | null): AguiNodePatch {
  if (!overridePatch) {
    return basePatch;
  }

  return compactPatch({
    ...basePatch,
    ...overridePatch,
    childrenIds: overridePatch.childrenIds ?? basePatch.childrenIds,
    meta:
      basePatch.meta || overridePatch.meta
        ? {
            ...(basePatch.meta ?? {}),
            ...(overridePatch.meta ?? {})
          }
        : undefined
  }) as AguiNodePatch;
}

/** 判断 reducer 返回值是否是带控制字段的结果对象。 */
function isReducerResult(value: unknown): value is AguiRuntimeReducerResult {
  return typeof value === 'object' && value !== null && ('patch' in value || 'replaceDefault' in value);
}

/** 把事件特有字段补进默认 meta，便于内建卡片和自定义 UI 直接消费。 */
function buildEventMeta(event: AguiRuntimeEvent): Record<string, unknown> | undefined {
  const merged: Record<string, unknown> = {
    ...(event.meta ?? {})
  };

  if ('artifactId' in event && typeof event.artifactId === 'string') {
    merged.artifactId = event.artifactId;
  }

  if ('artifactKind' in event && typeof event.artifactKind === 'string') {
    merged.artifactKind = event.artifactKind;
  }

  if ('label' in event && typeof event.label === 'string') {
    merged.label = event.label;
  }

  if ('href' in event && typeof event.href === 'string') {
    merged.href = event.href;
  }

  if ('approvalId' in event && typeof event.approvalId === 'string') {
    merged.approvalId = event.approvalId;
  }

  if ('decision' in event && typeof event.decision === 'string') {
    merged.decision = event.decision;
  }

  if ('target' in event && typeof event.target === 'string') {
    merged.target = event.target;
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** 为内置事件类型生成默认状态补丁。 */
function getDefaultEventPatch(event: AguiRuntimeEvent, at: number): AguiNodePatch {
  switch (event.type) {
    case 'user.message.created':
      return compactPatch({
        kind: 'user',
        status: 'done',
        title: event.title ?? 'User message',
        parentId: event.parentId,
        message: event.message,
        startedAt: at,
        endedAt: at,
        meta: buildEventMeta(event)
      }) as AguiNodePatch;
    case 'run.started':
      return compactPatch({
        kind: 'run',
        status: 'running',
        title: event.title ?? 'Run',
        parentId: event.parentId,
        message: event.message,
        startedAt: at,
        meta: buildEventMeta(event)
      }) as AguiNodePatch;
    case 'agent.assigned':
      return compactPatch({
        kind: event.kind ?? 'agent',
        status: 'assigned',
        title: event.title ?? event.nodeId,
        parentId: event.parentId,
        message: event.message,
        startedAt: at,
        meta: buildEventMeta(event)
      }) as AguiNodePatch;
    case 'agent.started':
      return compactPatch({
        kind: event.kind ?? 'agent',
        status: event.kind === 'leader' ? 'running' : 'thinking',
        title: event.title ?? event.nodeId,
        parentId: event.parentId,
        message: event.message,
        startedAt: at,
        meta: buildEventMeta(event)
      }) as AguiNodePatch;
    case 'agent.thinking':
      return compactPatch({
        kind: event.kind ?? 'agent',
        status: 'thinking',
        title: event.title ?? event.nodeId,
        parentId: event.parentId,
        message: event.message,
        meta: buildEventMeta(event)
      }) as AguiNodePatch;
    case 'tool.started':
      return compactPatch({
        kind: 'tool',
        status: 'running',
        title: event.title ?? event.toolName ?? event.nodeId,
        parentId: event.parentId,
        message: event.message,
        toolName: event.toolName,
        startedAt: at,
        meta: buildEventMeta(event)
      }) as AguiNodePatch;
    case 'tool.finished':
    case 'agent.finished':
    case 'team.finished':
    case 'run.finished':
      return compactPatch({
        kind: event.type === 'run.finished' ? 'run' : event.kind ?? (event.type === 'tool.finished' ? 'tool' : 'agent'),
        status: 'done',
        title: event.title ?? event.nodeId,
        parentId: event.parentId,
        message: event.message,
        toolName: event.toolName,
        endedAt: at,
        meta: buildEventMeta(event)
      }) as AguiNodePatch;
    case 'node.error':
      return compactPatch({
        kind: event.kind ?? 'agent',
        status: 'error',
        title: event.title ?? event.nodeId,
        parentId: event.parentId,
        message: event.message,
        toolName: event.toolName,
        endedAt: at,
        meta: buildEventMeta(event)
      }) as AguiNodePatch;
    default:
      return compactPatch({
        kind: event.kind ?? 'agent',
        title: event.title ?? event.nodeId,
        parentId: event.parentId,
        message: event.message,
        toolName: event.toolName,
        meta: buildEventMeta(event)
      }) as AguiNodePatch;
  }
}

/** 创建一份响应式 AGUI runtime。 */
export function createAguiRuntime(options: CreateAguiRuntimeOptions = {}): AguiRuntime {
  const stateRefs = new Map<string, ShallowRef<unknown | null>>();
  const eventRefs = new Map<string, ShallowRef<AguiRuntimeEvent[]>>();
  const childrenRefs = new Map<string, ComputedRef<unknown[]>>();
  const bindings = new Map<string, AguiBinding<unknown>>();
  const childIdsByParent = new Map<string, Set<string>>();
  const structureVersion = shallowRef(0);
  const globalEvents = shallowRef<AguiRuntimeEvent[]>([]);
  const reducer = options.reducer ?? null;

  /** 为节点创建或复用状态 ref。 */
  function ensureStateRef<TState = unknown>(id: string): ShallowRef<TState | null> {
    const existing = stateRefs.get(id);

    if (existing) {
      return existing as ShallowRef<TState | null>;
    }

    const created = shallowRef<TState | null>(null);
    stateRefs.set(id, created as ShallowRef<unknown | null>);
    return created;
  }

  /** 为节点创建或复用事件列表 ref。 */
  function ensureEventRef(id: string): ShallowRef<AguiRuntimeEvent[]> {
    const existing = eventRefs.get(id);

    if (existing) {
      return existing;
    }

    const created = shallowRef<AguiRuntimeEvent[]>([]);
    eventRefs.set(id, created);
    return created;
  }

  /** 把节点 patch 折叠成一份完整状态并写回。 */
  function patchAgentNode(id: string, patch: AguiNodePatch): AgentNodeState {
    const stateRef = ensureStateRef<AgentNodeState>(id);
    const previous = stateRef.value ?? createDefaultNodeState(id);
    const safePatch = compactPatch(patch);

    const next: AgentNodeState = {
      ...previous,
      ...safePatch,
      id,
      childrenIds: patch.childrenIds ?? previous.childrenIds,
      meta: {
        ...previous.meta,
        ...(patch.meta ?? {})
      }
    };

    stateRef.value = next;
    return next;
  }

  /** 注册父子关系，并同步更新父节点的 childrenIds。 */
  function registerChild(parentId: string, childId: string) {
    const children = childIdsByParent.get(parentId) ?? new Set<string>();
    const sizeBefore = children.size;

    children.add(childId);
    childIdsByParent.set(parentId, children);

    if (children.size !== sizeBefore) {
      const parentRef = ensureStateRef<AgentNodeState>(parentId);
      const previous = parentRef.value ?? createDefaultNodeState(parentId);

      parentRef.value = {
        ...previous,
        id: parentId,
        childrenIds: [...children]
      };

      structureVersion.value += 1;
    }
  }

  /** 记录事件并把它归约成节点状态。 */
  function applyEvent(event: AguiRuntimeEvent) {
    const at = event.at ?? Date.now();
    const normalized: AguiRuntimeEvent = {
      ...event,
      at
    };

    globalEvents.value = [...globalEvents.value, normalized];

    const scopedEvents = ensureEventRef(normalized.nodeId);
    scopedEvents.value = [...scopedEvents.value, normalized];

    if (normalized.parentId) {
      registerChild(normalized.parentId, normalized.nodeId);
    }

    // reducer 拿到的是“默认语义 + 上一份状态”，这样用户既能追加也能覆盖。
    const previousState = ensureStateRef<AgentNodeState>(normalized.nodeId).value;
    const defaultPatch = getDefaultEventPatch(normalized, at);

    if (!reducer) {
      patchAgentNode(normalized.nodeId, defaultPatch);
      return;
    }

    const reducerResult = reducer({
      event: normalized,
      at,
      previousState,
      defaultPatch
    });

    if (!reducerResult) {
      patchAgentNode(normalized.nodeId, defaultPatch);
      return;
    }

    const customPatch = (isReducerResult(reducerResult) ? reducerResult.patch : reducerResult) ?? null;
    const shouldReplaceDefault = isReducerResult(reducerResult) ? reducerResult.replaceDefault === true : false;
    const finalPatch = shouldReplaceDefault
      ? compactPatch(customPatch ?? {}) as AguiNodePatch
      : mergeNodePatches(defaultPatch, customPatch);

    patchAgentNode(normalized.nodeId, finalPatch);
  }

  /** 对外暴露某个节点的只读状态 ref。 */
  function ref<TState = unknown>(id: string): Readonly<ShallowRef<TState | null>> {
    return asReadonlyRef(ensureStateRef<TState>(id));
  }

  /** 返回某个父节点的响应式子节点列表。 */
  function children<TState = unknown>(parentId: string): Readonly<ComputedRef<TState[]>> {
    const existing = childrenRefs.get(parentId);

    if (existing) {
      return existing as Readonly<ComputedRef<TState[]>>;
    }

    /** 结构版本变化时重新收集当前父节点下的子状态。 */
    const created = computed(() => {
      structureVersion.value;

      const ids = childIdsByParent.get(parentId);

      if (!ids) {
        return [] as TState[];
      }

      return [...ids]
        .map((id) => ensureStateRef<TState>(id).value)
        .filter((state): state is TState => state !== null);
    });

    childrenRefs.set(parentId, created as ComputedRef<unknown[]>);
    return created as Readonly<ComputedRef<TState[]>>;
  }

  /** 读取全局事件流或某个节点下的事件流。 */
  function events(id?: string): Readonly<ShallowRef<AguiRuntimeEvent[]>> {
    if (!id) {
      return asReadonlyRef(globalEvents);
    }

    return asReadonlyRef(ensureEventRef(id));
  }

  /** 为指定节点创建一份绑定对象，方便组件一次性拿到状态、子节点和事件。 */
  function binding<TState = unknown, TEvent = AguiRuntimeEvent>(id: string): AguiBinding<TState, TEvent> {
    const existing = bindings.get(id);

    if (existing) {
      return existing as AguiBinding<TState, TEvent>;
    }

    const created: AguiBinding<TState, TEvent> = {
      id,
      stateRef: ref<TState>(id),
      childrenRef: children<TState>(id),
      eventsRef: events(id) as Readonly<ShallowRef<TEvent[]>>
    };

    bindings.set(id, created as AguiBinding<unknown>);
    return created;
  }

  /** 直接写入某个节点的完整状态值。 */
  function set<TState>(id: string, value: TState) {
    ensureStateRef<TState>(id).value = value;
  }

  /** 以浅合并的方式更新某个节点状态。 */
  function patch<TState extends object>(id: string, nextPatch: StatePatch<TState>) {
    const stateRef = ensureStateRef<TState>(id);
    const previous = (stateRef.value ?? {}) as TState;

    stateRef.value = {
      ...previous,
      ...compactPatch(nextPatch as Record<string, unknown>)
    };
  }

  /** 清空 runtime 内部保存的所有状态和事件。 */
  function reset() {
    for (const stateRef of stateRefs.values()) {
      stateRef.value = null;
    }

    for (const eventRef of eventRefs.values()) {
      eventRef.value = [];
    }

    globalEvents.value = [];
    childIdsByParent.clear();
    structureVersion.value += 1;
  }

  return {
    ref,
    binding,
    set,
    patch,
    emit: applyEvent,
    children,
    events,
    reset
  };
}
