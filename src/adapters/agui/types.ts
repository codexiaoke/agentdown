import type {
  AGUIEvent,
  Context,
  Message,
  RunAgentInput,
  Tool
} from '@ag-ui/core';
import type { ComputedRef, MaybeRefOrGetter, ShallowRef } from 'vue';
import type { A2UiAction } from '../../a2ui';
import type { AgentdownAdapterOptions } from '../../runtime/defineAdapter';
import type { BridgeHooks, ProtocolContext, RuntimeProtocol, StreamAssembler } from '../../runtime/types';
import type { FetchTransportSource } from '../../runtime/transports';
import type { RunSurfaceOptions } from '../../surface/types';
import type {
  FrameworkChatAssistantActionsOptions,
  FrameworkChatDevtoolsOptions,
  FrameworkChatIds,
  FrameworkChatInputValue,
  FrameworkChatRecoveryOptions,
  FrameworkChatReconnectOptions,
  FrameworkChatSessionResult,
  FrameworkChatTransportContext,
  FrameworkChatUserMessageOptions
} from '../shared/chatFactory';
import type {
  FrameworkJsonSseTransportOptionsLike,
  FrameworkJsonTransportResolvable
} from '../shared/jsonSseTransportFactory';
import type { AgUiStateSnapshot, AgUiStateStore } from './state';

export type AgUiEvent = AGUIEvent;

export type AgUiValueResolver<TValue> =
  | TValue
  | ((event: AgUiEvent, context: ProtocolContext) => TValue);

export interface AgUiProtocolOptions {
  slot?: string;
  streamAssembler?: string;
  recordEvents?: boolean;
  defaultRunTitle?: AgUiValueResolver<string | undefined>;
  conversationId?: AgUiValueResolver<string | null | undefined>;
  turnId?: AgUiValueResolver<string | null | undefined>;
  messageId?: AgUiValueResolver<string | null | undefined>;
  groupId?: AgUiValueResolver<string | null | undefined>;
  toolRenderer?: string | ((input: {
    event: AgUiEvent;
    toolCallId: string;
    toolCallName?: string;
    context: ProtocolContext;
  }) => string | undefined);
  /** A2UI custom event 名 allowlist。 */
  a2uiEventNames?: ReadonlySet<string>;
}

export interface AgUiProtocol extends RuntimeProtocol<AgUiEvent> {
  readonly store: AgUiStateStore;
}

export interface AgUiAdapterOptions<
  TSource = AsyncIterable<AgUiEvent> | Iterable<AgUiEvent>
> extends Omit<AgentdownAdapterOptions<AgUiEvent, TSource>, 'name' | 'protocol' | 'assemblers'> {
  protocol?: RuntimeProtocol<AgUiEvent>;
  protocolOptions?: AgUiProtocolOptions;
  assemblers?: Record<string, StreamAssembler>;
  title?: AgUiProtocolOptions['defaultRunTitle'];
  surface?: RunSurfaceOptions;
}

export interface AgUiSseTransportOptions<
  TSource = FetchTransportSource,
  TContext = FrameworkChatTransportContext
> extends FrameworkJsonSseTransportOptionsLike<AgUiEvent, TSource, Record<string, unknown>, TContext> {
  /** 完整覆写标准 RunAgentInput；返回值会经过官方 schema 校验。 */
  runInput?: FrameworkJsonTransportResolvable<TSource, RunAgentInput | undefined, TContext>;
  messages?: FrameworkJsonTransportResolvable<TSource, Message[] | undefined, TContext>;
  tools?: FrameworkJsonTransportResolvable<TSource, Tool[] | undefined, TContext>;
  context?: FrameworkJsonTransportResolvable<TSource, Context[] | undefined, TContext>;
  state?: FrameworkJsonTransportResolvable<TSource, unknown, TContext>;
  forwardedProps?: FrameworkJsonTransportResolvable<TSource, unknown, TContext>;
  parentRunId?: FrameworkJsonTransportResolvable<TSource, string | undefined, TContext>;
}

export interface UseAgUiChatSessionOptions<TSource = FetchTransportSource> {
  source: MaybeRefOrGetter<TSource | null | undefined>;
  input?: MaybeRefOrGetter<FrameworkChatInputValue | undefined>;
  conversationId: MaybeRefOrGetter<string>;
  title?: AgUiAdapterOptions<TSource>['title'];
  protocolOptions?: Omit<AgUiProtocolOptions, 'conversationId' | 'turnId' | 'messageId'>;
  surface?: RunSurfaceOptions;
  transport?: Omit<AgUiSseTransportOptions<TSource, FrameworkChatTransportContext>, 'message'>;
  createIds?: (input: { conversationId: string; text: string; at: number }) => FrameworkChatIds;
  hooks?: BridgeHooks<AgUiEvent>;
  devtools?: false | FrameworkChatDevtoolsOptions<AgUiEvent>;
  sessionId?: boolean | { resolve?: (event: AgUiEvent) => string | undefined };
  userMessage?: false | FrameworkChatUserMessageOptions;
  reconnect?: false | FrameworkChatReconnectOptions<AgUiEvent, TSource>;
  recovery?: false | FrameworkChatRecoveryOptions<AgUiEvent, TSource>;
  assistantActions?: false | FrameworkChatAssistantActionsOptions;
}

export interface UseAgUiChatSessionResult<TSource = FetchTransportSource>
  extends FrameworkChatSessionResult<AgUiEvent, TSource, FrameworkChatIds> {
  /** AG-UI 的 shared state / messages / activities 响应式快照。 */
  agUiState: ShallowRef<AgUiStateSnapshot>;
  /** 把 A2UI client action 放进下一次标准 RunAgentInput.forwardedProps 并提交。 */
  sendA2UiAction: (action: A2UiAction, source?: TSource) => Promise<void>;
  /** 已自动接入 A2UI action 回传的最终 surface。 */
  surface: ComputedRef<RunSurfaceOptions>;
}

export type {
  AGUIEvent,
  Context,
  Message,
  RunAgentInput,
  Tool
};
