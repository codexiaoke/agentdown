import type {
  A2uiClientError,
  A2uiClientMessage,
  A2uiMessage,
  ComponentApi,
  Subscription,
  SurfaceModel
} from '@a2ui/web_core/v0_9';
import { createA2UiProcessor, type A2UiProcessor } from './processor';
import type {
  A2UiClientEnvelope,
  A2UiSecurityPolicy,
  A2UiVersion,
  A2UiVueCatalog
} from './types';

export interface CreateA2UiSurfaceControllerOptions<T extends ComponentApi = ComponentApi> {
  surfaceId: string;
  catalogs: ReadonlyArray<A2UiVueCatalog<T>>;
  version?: A2UiVersion;
  policy?: Partial<A2UiSecurityPolicy>;
  /** 为自定义 Catalog 同时发送内联 schema；默认只发送 Catalog ID。 */
  includeInlineCatalogs?: boolean;
  onChange?: (surface: SurfaceModel<T> | undefined) => void;
  onClientMessage?: (envelope: A2UiClientEnvelope) => void | Promise<void>;
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
  createClientEnvelope: (message: A2uiClientMessage) => A2UiClientEnvelope;
  dispose: () => void;
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

  function createClientEnvelope(message: A2uiClientMessage): A2UiClientEnvelope {
    const dataModel = processor.getClientDataModel();
    return {
      message,
      capabilities: processor.getClientCapabilities(
        options.includeInlineCatalogs === undefined
          ? undefined
          : { includeInlineCatalogs: options.includeInlineCatalogs }
      ),
      ...(dataModel ? { dataModel } : {})
    };
  }

  async function emitClientMessage(message: A2uiClientMessage) {
    await options.onClientMessage?.(createClientEnvelope(message));
  }

  function createProcessor(): A2UiProcessor<T> {
    let next: A2UiProcessor<T>;
    next = createA2UiProcessor<T>({
      catalogs: options.catalogs,
      ...(options.version ? { version: options.version } : {}),
      ...(options.policy ? { policy: options.policy } : {}),
      onAction(action): Promise<void> {
        return emitClientMessage({ version: next.version, action });
      },
      onError(error: A2uiClientError): Promise<void> {
        return emitClientMessage({ version: next.version, error });
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
      rebuild([]);
    },
    getSurface() {
      return processor.getSurface(options.surfaceId);
    },
    createClientEnvelope,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearSubscriptions(surfaceSubscriptions);
      clearSubscriptions(processorSubscriptions);
      processor.dispose();
    }
  };
}
