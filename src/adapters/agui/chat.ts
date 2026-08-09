import type { A2UiAction } from '../../a2ui';
import { A2UI_SURFACE_RENDERER, A2UiSurface } from '../../a2ui';
import { computed, getCurrentScope, onScopeDispose, shallowRef } from 'vue';
import type { FrameworkChatTransportContext } from '../shared/chatFactory';
import { useFrameworkChatSession } from '../shared/chatFactory';
import type { FrameworkJsonTransportResolvable } from '../shared/jsonSseTransportFactory';
import type { RunSurfaceRendererContext } from '../../surface/types';
import { createAgUiAdapter } from './adapter';
import { createAgUiSseTransport } from './transport';
import type {
  AgUiAdapterOptions,
  AgUiEvent,
  AgUiProtocol,
  AgUiProtocolOptions,
  AgUiSseTransportOptions,
  UseAgUiChatSessionOptions,
  UseAgUiChatSessionResult
} from './types';

async function resolveTransportValue<TSource, TValue>(
  source: TSource,
  value: FrameworkJsonTransportResolvable<TSource, TValue, FrameworkChatTransportContext> | undefined,
  context: FrameworkChatTransportContext | undefined
): Promise<TValue | undefined> {
  if (value === undefined) return undefined;
  if (typeof value === 'function') {
    return await (value as (
      source: TSource,
      context: FrameworkChatTransportContext | undefined
    ) => Promise<TValue> | TValue)(source, context);
  }
  return value;
}

function mergeA2UiForwardedProps(base: unknown, action: A2UiAction | null): unknown {
  if (!action) return base;
  const a2ui = { version: 'v0.9', action };
  if (base && typeof base === 'object' && !Array.isArray(base)) {
    return { ...base, a2ui };
  }
  return base === undefined ? { a2ui } : { value: base, a2ui };
}

/**
 * 页面级 AG-UI chat helper：标准请求、恢复、shared state 和 A2UI action 回传一次接好。
 */
export function useAgUiChatSession<TSource = RequestInfo | URL>(
  options: UseAgUiChatSessionOptions<TSource>
): UseAgUiChatSessionResult<TSource> {
  const pendingA2UiAction = shallowRef<A2UiAction | null>(null);
  const configuredForwardedProps = options.transport?.forwardedProps;
  const transportOptions: Omit<
    AgUiSseTransportOptions<TSource, FrameworkChatTransportContext>,
    'message'
  > = {
    ...(options.transport ?? {}),
    forwardedProps: async (
      source: TSource,
      context: FrameworkChatTransportContext | undefined
    ) => mergeA2UiForwardedProps(
      await resolveTransportValue(source, configuredForwardedProps, context),
      pendingA2UiAction.value
    )
  };

  const base = useFrameworkChatSession<
    AgUiEvent,
    TSource,
    import('../shared/chatFactory').FrameworkChatIds,
    AgUiProtocolOptions,
    AgUiAdapterOptions<TSource>,
    AgUiSseTransportOptions<TSource, FrameworkChatTransportContext>
  >({
    frameworkName: 'AG-UI',
    options: {
      ...options,
      transport: transportOptions
    },
    createAdapter: createAgUiAdapter,
    createTransport: createAgUiSseTransport,
    resolveSessionId(event) {
      return event.type === 'RUN_STARTED' ? event.threadId : undefined;
    }
  });

  const protocol = base.protocol as AgUiProtocol;
  const agUiState = shallowRef(protocol.store.snapshot);
  const unsubscribe = protocol.store.subscribe((snapshot) => {
    agUiState.value = snapshot;
  });
  if (getCurrentScope()) {
    onScopeDispose(unsubscribe);
  }

  async function sendA2UiAction(action: A2UiAction, source?: TSource) {
    pendingA2UiAction.value = action;
    try {
      await base.send('', source);
    } finally {
      pendingA2UiAction.value = null;
    }
  }

  const surface = computed(() => ({
    ...base.surface.value,
    renderers: {
      ...(base.surface.value.renderers ?? {}),
      [A2UI_SURFACE_RENDERER]: {
        component: A2UiSurface,
        mode: 'context' as const,
        props: (context: RunSurfaceRendererContext) => ({
          ...context,
          onAction(action: A2UiAction) {
            void sendA2UiAction(action).catch(() => undefined);
          }
        })
      }
    }
  }));

  return {
    ...base,
    surface,
    agUiState,
    sendA2UiAction
  };
}
