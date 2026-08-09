import { getCurrentScope, onScopeDispose, shallowRef } from 'vue';
import type { FrameworkChatTransportContext } from '../shared/chatFactory';
import { useFrameworkChatSession } from '../shared/chatFactory';
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

/**
 * 页面级 AG-UI chat helper：接入标准请求、恢复和 shared state。
 */
export function useAgUiChatSession<TSource = RequestInfo | URL>(
  options: UseAgUiChatSessionOptions<TSource>
): UseAgUiChatSessionResult<TSource> {
  const base = useFrameworkChatSession<
    AgUiEvent,
    TSource,
    import('../shared/chatFactory').FrameworkChatIds,
    AgUiProtocolOptions,
    AgUiAdapterOptions<TSource>,
    AgUiSseTransportOptions<TSource, FrameworkChatTransportContext>
  >({
    frameworkName: 'AG-UI',
    options,
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

  return {
    ...base,
    agUiState
  };
}
