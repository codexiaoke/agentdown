import type { MaybeRefOrGetter, ShallowRef } from 'vue';
import type { A2UiClientEnvelope, A2UiSecurityPolicy, A2UiVersion, A2UiVueCatalog } from '../../a2ui';
import type { AgUiAdapterOptions, AgUiEvent, AgUiProtocolOptions, UseAgUiChatSessionOptions, UseAgUiChatSessionResult } from '../../adapters/agui';
import type { FrameworkChatTransportContext } from '../../adapters/shared/chatFactory';
import type { RuntimeProtocol } from '../../runtime/types';
import type { FetchTransportSource } from '../../runtime/transports';
import type { AgUiA2UiProtocol, AgUiA2UiProtocolOptions } from './protocol';

export interface AgUiA2UiRendererOptions {
  catalogs?: ReadonlyArray<A2UiVueCatalog>;
  version?: A2UiVersion;
  includeInlineCatalogs?: boolean;
  securityPolicy?: Partial<A2UiSecurityPolicy>;
}

export interface AgUiA2UiAdapterOptions<
  TSource = AsyncIterable<AgUiEvent> | Iterable<AgUiEvent>
> extends Omit<AgUiAdapterOptions<TSource>, 'protocol'> {
  /** 完整覆写组合协议。 */
  protocol?: RuntimeProtocol<AgUiEvent>;
  /** 覆写 A2UI 扩展协议实例。 */
  a2uiProtocol?: AgUiA2UiProtocol;
  a2uiProtocolOptions?: AgUiA2UiProtocolOptions;
  a2uiRenderer?: AgUiA2UiRendererOptions;
}

export interface AgUiA2UiSerializeContext<TSource = unknown> {
  envelope: A2UiClientEnvelope;
  forwardedProps: unknown;
  source: TSource;
  transportContext: FrameworkChatTransportContext | undefined;
}

/** 返回完整的 RunAgentInput.forwardedProps。 */
export type AgUiA2UiClientSerializer<TSource = unknown> = (
  context: AgUiA2UiSerializeContext<TSource>
) => unknown | Promise<unknown>;

export interface UseAgUiA2UiChatSessionOptions<TSource = FetchTransportSource>
  extends UseAgUiChatSessionOptions<TSource> {
  a2uiProtocol?: AgUiA2UiProtocol;
  a2uiProtocolOptions?: AgUiA2UiProtocolOptions;
  a2uiRenderer?: AgUiA2UiRendererOptions;
  serializeA2UiClient?: AgUiA2UiClientSerializer<TSource>;
  onA2UiClientError?: (error: Error, envelope: A2UiClientEnvelope) => void;
}

export interface UseAgUiA2UiChatSessionResult<TSource = FetchTransportSource>
  extends UseAgUiChatSessionResult<TSource> {
  sendA2UiClient: (envelope: A2UiClientEnvelope, source?: TSource) => Promise<void>;
  a2uiClientError: ShallowRef<Error | null>;
}

export type {
  AgUiA2UiProtocol,
  AgUiA2UiProtocolOptions,
  AgUiEvent,
  AgUiProtocolOptions,
  A2UiClientEnvelope,
  MaybeRefOrGetter
};
