import type {
  A2uiClientAction,
  A2uiClientError,
  A2uiClientMessage,
  A2uiMessage,
  ComponentApi,
  Subscription,
  SurfaceModel
} from '@a2ui/web_core/v0_9';
import { createA2UiProcessor, type A2UiProcessor } from './processor';
import type {
  A2UiActionDeliveryState,
  A2UiActionHandlerMap,
  A2UiActionExecutionSnapshot,
  A2UiActionExecutionState,
  A2UiActionState,
  A2UiActionStateMap,
  A2UiActionStateSnapshot,
  A2UiActionStateSource,
  A2UiClientEnvelope,
  A2UiSecurityPolicy,
  A2UiVersion,
  A2UiVueCatalog
} from './types';
import { createA2UiActionStateKey } from './types';

export interface CreateA2UiSurfaceControllerOptions<T extends ComponentApi = ComponentApi> {
  surfaceId: string;
  catalogs: ReadonlyArray<A2UiVueCatalog<T>>;
  version?: A2UiVersion;
  policy?: Partial<A2UiSecurityPolicy>;
  /** 为自定义 Catalog 同时发送内联 schema；默认只发送 Catalog ID。 */
  includeInlineCatalogs?: boolean;
  onChange?: (surface: SurfaceModel<T> | undefined) => void;
  onClientMessage?: (envelope: A2UiClientEnvelope) => void | Promise<void>;
  /**
   * 按 action name 拦截客户端动作。未注册动作仍交给 onClientMessage。
   * handler 可调用 context.forward() 组合前端更新与远端执行。
   */
  actionHandlers?: A2UiActionHandlerMap<T>;
  /** 宿主拥有的业务 action 状态源；未提供时只展示 transport delivery 状态。 */
  actionStateSource?: A2UiActionStateSource;
  /** 宿主允许业务失败重试时负责重新执行；Agentdown 不推断执行策略。 */
  retryExecution?: (state: A2UiActionExecutionState) => void | Promise<void>;
  onActionStateChange?: (snapshot: A2UiActionStateSnapshot) => void;
  /** 测试或宿主需要接管 id 规则时使用；默认生成随机稳定 id。 */
  createClientRequestId?: () => string;
}

export type A2UiSurfaceSyncMode = 'unchanged' | 'append' | 'rebuild';

export interface A2UiSurfaceSyncResult {
  mode: A2UiSurfaceSyncMode;
  processed: number;
  messages: A2uiMessage[];
}

export interface A2UiSurfaceController<T extends ComponentApi = ComponentApi> {
  readonly version: A2UiVersion;
  readonly policy: A2UiSecurityPolicy;
  sync: (messages: ReadonlyArray<unknown>) => A2UiSurfaceSyncResult;
  reset: () => void;
  getSurface: () => SurfaceModel<T> | undefined;
  createClientEnvelope: (
    message: A2uiClientMessage,
    requestId?: string
  ) => A2UiClientEnvelope;
  getActionState: (sourceComponentId: string) => A2UiActionState | undefined;
  getActionStates: () => A2UiActionStateMap;
  getActionStateSnapshot: () => A2UiActionStateSnapshot;
  retryAction: (sourceComponentId: string) => Promise<boolean>;
  dispose: () => void;
}

interface A2UiActionRecord {
  state: A2UiActionDeliveryState;
  envelope: A2UiClientEnvelope;
}

/** 为一次 A2UI 客户端消息生成可被后端直接用作幂等键的请求 id。 */
export function createA2UiClientRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `a2ui:${globalThis.crypto.randomUUID()}`;
  }

  return `a2ui:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function resolveActionError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fingerprint(message: unknown): string {
  const serialized = JSON.stringify(message);
  if (serialized === undefined) {
    throw new Error('A2UI messages must be JSON-serializable values.');
  }
  return serialized;
}

function isPrefix(previous: readonly string[], next: readonly string[]): boolean {
  return previous.length <= next.length
    && previous.every((entry, index) => entry === next[index]);
}

function copyExecutionSnapshot(
  snapshot: A2UiActionExecutionSnapshot,
  surfaceId: string
): A2UiActionExecutionSnapshot {
  if (snapshot.surfaceId !== surfaceId) {
    throw new Error(
      `A2UI action state source returned surface "${snapshot.surfaceId}" for "${surfaceId}".`
    );
  }

  return {
    surfaceId,
    interactionDisabled: snapshot.interactionDisabled === true,
    states: Object.freeze(Object.fromEntries(
      Object.entries(snapshot.states).map(([key, state]) => [key, { ...state }])
    ))
  };
}

/**
 * 持有一个长生命周期 A2UI Surface。
 *
 * 服务端追加消息时只处理增量，因此浏览器中的输入值不会因每次 stream 更新而被重放覆盖；
 * 只有历史被替换或回退时才完整重建。
 */
export function createA2UiSurfaceController<T extends ComponentApi = ComponentApi>(
  options: CreateA2UiSurfaceControllerOptions<T>
): A2UiSurfaceController<T> {
  let processor: A2UiProcessor<T>;
  let messageFingerprints: string[] = [];
  let processorSubscriptions: Subscription[] = [];
  let surfaceSubscriptions: Subscription[] = [];
  let disposed = false;
  const actionRecords = new Map<string, A2UiActionRecord>();
  let executionSnapshot: A2UiActionExecutionSnapshot = {
    surfaceId: options.surfaceId,
    interactionDisabled: false,
    states: {}
  };
  let unsubscribeActionStateSource: (() => void) | undefined;

  function clearSubscriptions(subscriptions: Subscription[]) {
    subscriptions.forEach((subscription) => subscription.unsubscribe());
    subscriptions.length = 0;
  }

  function notifyChange() {
    options.onChange?.(processor.getSurface(options.surfaceId));
  }

  function subscribeSurface(surface: SurfaceModel<T> | undefined) {
    clearSubscriptions(surfaceSubscriptions);
    if (!surface) {
      options.onChange?.(undefined);
      return;
    }

    const subscribeComponent = (component: { onUpdated: { subscribe: (listener: () => void) => Subscription } }) => {
      surfaceSubscriptions.push(component.onUpdated.subscribe(notifyChange));
    };

    surfaceSubscriptions.push(surface.componentsModel.onCreated.subscribe((component) => {
      subscribeComponent(component);
      notifyChange();
    }));
    surfaceSubscriptions.push(surface.componentsModel.onDeleted.subscribe(notifyChange));
    surfaceSubscriptions.push(surface.dataModel.subscribe('/', notifyChange));
    for (const [, component] of surface.componentsModel.entries) {
      subscribeComponent(component);
    }
    options.onChange?.(surface);
  }

  function createClientEnvelope(
    message: A2uiClientMessage,
    requestId = options.createClientRequestId?.() ?? createA2UiClientRequestId()
  ): A2UiClientEnvelope {
    const dataModel = processor.getClientDataModel();
    return {
      requestId,
      message,
      capabilities: processor.getClientCapabilities(
        options.includeInlineCatalogs === undefined
          ? undefined
          : { includeInlineCatalogs: options.includeInlineCatalogs }
      ),
      ...(dataModel ? { dataModel } : {})
    };
  }

  function getActionStates(): A2UiActionStateMap {
    const deliveryStates = Object.fromEntries(
      Array.from(actionRecords, ([key, record]) => [key, { ...record.state }])
    );
    return Object.freeze({
      ...deliveryStates,
      ...Object.fromEntries(
        Object.entries(executionSnapshot.states).map(([key, state]) => [key, {
          ...state,
          retryable: state.retryable === true && options.retryExecution !== undefined
        }])
      )
    });
  }

  function getActionStateSnapshot(): A2UiActionStateSnapshot {
    return Object.freeze({
      surfaceId: options.surfaceId,
      interactionDisabled: executionSnapshot.interactionDisabled === true,
      states: getActionStates()
    });
  }

  function notifyActionState() {
    options.onActionStateChange?.(getActionStateSnapshot());
  }

  async function deliverAction(record: A2UiActionRecord): Promise<void> {
    try {
      const action = record.state.action;
      const handler = options.actionHandlers?.[action.name];
      if (handler) {
        let forwarding: Promise<void> | undefined;
        const forward = () => {
          forwarding ??= Promise.resolve(options.onClientMessage?.(record.envelope));
          return forwarding;
        };
        await handler({
          action,
          envelope: record.envelope,
          surface: processor.getSurface(options.surfaceId),
          forward
        });
      } else {
        await options.onClientMessage?.(record.envelope);
      }
      record.state = {
        ...record.state,
        status: 'delivered',
        settledAt: Date.now()
      };
    } catch (error) {
      record.state = {
        ...record.state,
        status: 'failed',
        settledAt: Date.now(),
        error: resolveActionError(error),
        retryable: true
      };
    }
    notifyActionState();
  }

  async function emitAction(action: A2uiClientAction): Promise<void> {
    const key = createA2UiActionStateKey(action.surfaceId, action.sourceComponentId);
    const active = getActionStates()[key];
    if (
      (active?.phase === 'delivery' && active.status === 'sending')
      || (active?.phase === 'execution' && active.status === 'pending')
    ) {
      return;
    }

    const envelope = createClientEnvelope({ version: processor.version, action });
    const record: A2UiActionRecord = {
      envelope,
      state: {
        phase: 'delivery',
        key,
        requestId: envelope.requestId,
        surfaceId: action.surfaceId,
        sourceComponentId: action.sourceComponentId,
        action,
        status: 'sending',
        attempt: 1,
        startedAt: Date.now()
      }
    };
    actionRecords.set(key, record);
    notifyActionState();
    await deliverAction(record);
  }

  async function emitClientError(error: A2uiClientError): Promise<void> {
    await options.onClientMessage?.(createClientEnvelope({ version: processor.version, error }));
  }

  async function retryAction(sourceComponentId: string): Promise<boolean> {
    const key = createA2UiActionStateKey(options.surfaceId, sourceComponentId);
    const activeState = getActionStates()[key];
    if (
      activeState?.phase === 'execution'
      && activeState.status === 'failed'
      && activeState.retryable === true
      && options.retryExecution
    ) {
      await options.retryExecution({ ...activeState });
      return true;
    }

    const record = actionRecords.get(key);
    if (!record || record.state.status !== 'failed') {
      return false;
    }

    const {
      settledAt: _settledAt,
      error: _error,
      retryable: _retryable,
      ...deliveryState
    } = record.state;
    record.state = {
      ...deliveryState,
      status: 'sending',
      attempt: record.state.attempt + 1,
      startedAt: Date.now()
    };
    notifyActionState();
    await deliverAction(record);
    return record.state.status === 'delivered';
  }

  function createProcessor(): A2UiProcessor<T> {
    let next: A2UiProcessor<T>;
    next = createA2UiProcessor<T>({
      catalogs: options.catalogs,
      ...(options.version ? { version: options.version } : {}),
      ...(options.policy ? { policy: options.policy } : {}),
      onAction(action): Promise<void> {
        return emitAction(action);
      },
      onError(error: A2uiClientError): Promise<void> {
        return emitClientError(error);
      }
    });

    processorSubscriptions.push(next.processor.onSurfaceCreated((surface) => {
      if (surface.id === options.surfaceId) {
        subscribeSurface(surface);
      }
    }));
    processorSubscriptions.push(next.processor.onSurfaceDeleted((surfaceId) => {
      if (surfaceId === options.surfaceId) {
        subscribeSurface(undefined);
      }
    }));
    return next;
  }

  processor = createProcessor();

  if (options.actionStateSource) {
    executionSnapshot = copyExecutionSnapshot(
      options.actionStateSource.getSnapshot(options.surfaceId),
      options.surfaceId
    );
    unsubscribeActionStateSource = options.actionStateSource.subscribe(
      options.surfaceId,
      (snapshot) => {
        if (disposed) return;
        executionSnapshot = copyExecutionSnapshot(snapshot, options.surfaceId);
        notifyActionState();
      }
    );
  }
  notifyActionState();

  function rebuild(messages: ReadonlyArray<unknown>): A2UiSurfaceSyncResult {
    clearSubscriptions(surfaceSubscriptions);
    clearSubscriptions(processorSubscriptions);
    processor.dispose();
    processor = createProcessor();
    messageFingerprints = [];

    if (messages.length === 0) {
      options.onChange?.(undefined);
      return { mode: 'rebuild', processed: 0, messages: [] };
    }

    const parsed = processor.process(messages);
    messageFingerprints = messages.map(fingerprint);
    subscribeSurface(processor.getSurface(options.surfaceId));
    return { mode: 'rebuild', processed: parsed.length, messages: parsed };
  }

  return {
    get version() {
      return processor.version;
    },
    get policy() {
      return processor.policy;
    },
    sync(messages) {
      if (disposed) {
        throw new Error('A2UI surface controller is disposed.');
      }

      const nextFingerprints = messages.map(fingerprint);
      if (!isPrefix(messageFingerprints, nextFingerprints)) {
        return rebuild(messages);
      }

      const appended = messages.slice(messageFingerprints.length);
      if (appended.length === 0) {
        return { mode: 'unchanged', processed: 0, messages: [] };
      }

      const parsed = processor.process(appended);
      messageFingerprints = messages.map(fingerprint);
      subscribeSurface(processor.getSurface(options.surfaceId));
      return { mode: messageFingerprints.length === appended.length ? 'rebuild' : 'append', processed: parsed.length, messages: parsed };
    },
    reset() {
      actionRecords.clear();
      notifyActionState();
      rebuild([]);
    },
    getSurface() {
      return processor.getSurface(options.surfaceId);
    },
    createClientEnvelope,
    getActionState(sourceComponentId) {
      const state = getActionStates()[
        createA2UiActionStateKey(options.surfaceId, sourceComponentId)
      ];
      return state ? { ...state } : undefined;
    },
    getActionStates,
    getActionStateSnapshot,
    retryAction,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeActionStateSource?.();
      unsubscribeActionStateSource = undefined;
      clearSubscriptions(surfaceSubscriptions);
      clearSubscriptions(processorSubscriptions);
      processor.dispose();
    }
  };
}
