import { getCurrentScope, onScopeDispose, shallowRef, watch } from 'vue';
import {
  A2UI_SURFACE_RENDERER,
  A2UiSurface,
  createA2UiClientCapabilities,
  defaultA2UiBasicCatalog,
  type A2UiActionState,
  type A2UiActionStateMap,
  type A2UiClientEnvelope,
  type A2UiClientTransportEnvelope
} from '../../a2ui';
import { createAgUiSseTransport, type AgUiEvent, type AgUiProtocolOptions, type AgUiSseTransportOptions } from '../../adapters/agui';
import type { FrameworkChatTransportContext } from '../../adapters/shared/chatFactory';
import { useFrameworkChatSession } from '../../adapters/shared/chatFactory';
import type { FrameworkJsonTransportResolvable } from '../../adapters/shared/jsonSseTransportFactory';
import type { RunSurfaceRendererContext } from '../../surface/types';
import { createAgUiA2UiAdapter } from './adapter';
import type { AgUiA2UiCombinedProtocol } from './protocol';
import type {
  AgUiA2UiAdapterOptions,
  AgUiA2UiSerializeContext,
  UseAgUiA2UiChatSessionOptions,
  UseAgUiA2UiChatSessionResult
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

/** 默认的 AG-UI forwardedProps 载荷；业务可通过 serializeA2UiClient 完整替换。 */
export function serializeAgUiA2UiForwardedProps<TSource>(
  context: AgUiA2UiSerializeContext<TSource>
): unknown {
  const a2ui = {
    ...(context.client.requestId ? { requestId: context.client.requestId } : {}),
    ...(context.client.message ? { clientMessage: context.client.message } : {}),
    clientCapabilities: context.client.capabilities,
    ...(context.client.dataModel
      ? { clientDataModel: context.client.dataModel }
      : {})
  };
  const base = context.forwardedProps;
  if (base && typeof base === 'object' && !Array.isArray(base)) {
    return { ...base, a2ui };
  }
  return base === undefined ? { a2ui } : { value: base, a2ui };
}

/** 页面级 helper：显式组合 AG-UI transport 与 A2UI 双向客户端协议。 */
export function useAgUiA2UiChatSession<TSource = RequestInfo | URL>(
  options: UseAgUiA2UiChatSessionOptions<TSource>
): UseAgUiA2UiChatSessionResult<TSource> {
  const pendingEnvelope = shallowRef<A2UiClientEnvelope | null>(null);
  const a2uiClientError = shallowRef<Error | null>(null);
  const a2uiActionStates = shallowRef<A2UiActionStateMap>({});
  const a2uiTransportBusy = shallowRef(false);
  const a2uiRecoveryInitializing = shallowRef(
    options.recovery !== undefined && options.recovery !== false
  );
  const configuredForwardedProps = options.transport?.forwardedProps;
  const serializeClient = options.serializeA2UiClient ?? serializeAgUiA2UiForwardedProps;
  const rendererOptions = options.a2uiRenderer;
  const catalogs = rendererOptions?.catalogs ?? [defaultA2UiBasicCatalog];
  const initialClient: A2UiClientTransportEnvelope = {
    capabilities: createA2UiClientCapabilities({
      catalogs,
      ...(rendererOptions?.version ? { version: rendererOptions.version } : {}),
      ...(rendererOptions?.includeInlineCatalogs !== undefined
        ? { includeInlineCatalogs: rendererOptions.includeInlineCatalogs }
        : {})
    })
  };
  let sendQueue: Promise<void> = Promise.resolve();
  const inFlightRequests = new Map<string, Promise<void>>();

  const transportOptions: Omit<
    AgUiSseTransportOptions<TSource, FrameworkChatTransportContext>,
    'message'
  > = {
    ...(options.transport ?? {}),
    forwardedProps: async (
      source: TSource,
      context: FrameworkChatTransportContext | undefined
    ) => {
      const forwardedProps = await resolveTransportValue(
        source,
        configuredForwardedProps,
        context
      );
      return await serializeClient({
        client: pendingEnvelope.value ?? initialClient,
        forwardedProps,
        source,
        transportContext: context
      });
    }
  };

  const surface = {
    ...(options.surface ?? {}),
    renderers: {
      ...(options.surface?.renderers ?? {}),
      [A2UI_SURFACE_RENDERER]: {
        component: A2UiSurface,
        mode: 'context' as const,
        props: (context: RunSurfaceRendererContext) => ({
          ...context,
          catalogs,
          ...(rendererOptions?.version ? { version: rendererOptions.version } : {}),
          ...(rendererOptions?.includeInlineCatalogs !== undefined
            ? { includeInlineCatalogs: rendererOptions.includeInlineCatalogs }
            : {}),
          ...(rendererOptions?.securityPolicy
            ? { securityPolicy: rendererOptions.securityPolicy }
            : {}),
          interactionDisabled: a2uiTransportBusy.value,
          sendClientMessage(envelope: A2UiClientEnvelope) {
            return sendA2UiClient(envelope);
          },
          onActionStateChange(state: A2UiActionState, states: A2UiActionStateMap) {
            a2uiActionStates.value = {
              ...a2uiActionStates.value,
              [state.key]: state
            };
            rendererOptions?.onActionStateChange?.(state, states);
          }
        })
      }
    }
  };

  const base = useFrameworkChatSession<
    AgUiEvent,
    TSource,
    import('../../adapters/shared/chatFactory').FrameworkChatIds,
    AgUiProtocolOptions,
    AgUiA2UiAdapterOptions<TSource>,
    AgUiSseTransportOptions<TSource, FrameworkChatTransportContext>
  >({
    frameworkName: 'AG-UI+A2UI',
    options: {
      ...options,
      surface,
      transport: transportOptions
    },
    createAdapter(adapterOptions) {
      return createAgUiA2UiAdapter({
        ...adapterOptions,
        ...(options.a2uiProtocol ? { a2uiProtocol: options.a2uiProtocol } : {}),
        ...(options.a2uiProtocolOptions
          ? { a2uiProtocolOptions: options.a2uiProtocolOptions }
          : {}),
        ...(options.a2uiRenderer ? { a2uiRenderer: options.a2uiRenderer } : {})
      });
    },
    createTransport: createAgUiSseTransport,
    resolveSessionId(event) {
      return event.type === 'RUN_STARTED' ? event.threadId : undefined;
    }
  });

  const protocol = base.protocol as AgUiA2UiCombinedProtocol;
  const agUiState = shallowRef(protocol.store.snapshot);
  const unsubscribe = protocol.store.subscribe((snapshot) => {
    agUiState.value = snapshot;
  });
  const updateA2UiTransportBusy = () => {
    const connection = base.connectionState.value;
    a2uiTransportBusy.value = (
      a2uiRecoveryInitializing.value
      || base.busy.value
      || connection === 'recovering'
      || connection === 'connecting'
      || connection === 'reconnecting'
    );
  };
  const stopBusyWatch = watch(
    [base.busy, base.connectionState],
    updateA2UiTransportBusy,
    { immediate: true }
  );
  void base.recoveryReady.finally(() => {
    a2uiRecoveryInitializing.value = false;
    updateA2UiTransportBusy();
  }).catch(() => undefined);
  if (getCurrentScope()) {
    onScopeDispose(() => {
      unsubscribe();
      stopBusyWatch();
    });
  }

  function sendA2UiClient(
    envelope: A2UiClientEnvelope,
    source?: TSource
  ): Promise<void> {
    const active = inFlightRequests.get(envelope.requestId);
    if (active) {
      return active;
    }

    const task = sendQueue.then(async () => {
      pendingEnvelope.value = envelope;
      a2uiClientError.value = null;
      try {
        await base.continueConversation(source, {
          clientRequestId: envelope.requestId,
          reportErrorToRuntime: false
        });
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        a2uiClientError.value = error;
        options.onA2UiClientError?.(error, envelope);
        throw error;
      } finally {
        pendingEnvelope.value = null;
      }
    });
    inFlightRequests.set(envelope.requestId, task);
    sendQueue = task.catch(() => undefined);
    void task.finally(() => {
      if (inFlightRequests.get(envelope.requestId) === task) {
        inFlightRequests.delete(envelope.requestId);
      }
    }).catch(() => undefined);
    return task;
  }

  return {
    ...base,
    agUiState,
    sendA2UiClient,
    a2uiClientError,
    a2uiActionStates
  };
}
