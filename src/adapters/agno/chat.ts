import type { MaybeRefOrGetter } from 'vue';
import type { FetchTransportSource } from '../../runtime/transports';
import type { BridgeHooks } from '../../runtime/types';
import type { EventActionRegistryResult } from '../../runtime/eventActions';
import type { RunSurfaceOptions } from '../../surface/types';
import {
  createFrameworkChatIds,
  type FrameworkChatAssistantActionsOptions,
  type FrameworkChatDevtoolsOptions,
  type FrameworkChatIds,
  type FrameworkChatSessionIdOptions,
  type FrameworkChatSessionResult,
  type FrameworkChatUserMessageOptions,
  useFrameworkChatSession
} from '../shared/chatFactory';
import { createAgnoAdapter } from './adapter';
import { createAgnoSseTransport, type AgnoSseTransportOptions } from './transport';
import type {
  AgnoAdapterOptions,
  AgnoEvent,
  AgnoProtocolOptions
} from './types';

/**
 * 一轮聊天请求里会用到的稳定语义 id 集合。
 */
export interface AgnoChatIds extends FrameworkChatIds {}

/**
 * 自定义生成聊天语义 id 的回调签名。
 */
export type AgnoChatIdFactory = (input: {
  /** 当前对话 id。 */
  conversationId: string;
  /** 本次发出的用户输入。 */
  text: string;
  /** 本次发送的时间戳。 */
  at: number;
}) => AgnoChatIds;

/**
 * Agno chat helper 对 sessionId 抓取逻辑的配置。
 */
export interface AgnoChatSessionIdOptions extends FrameworkChatSessionIdOptions<AgnoEvent> {}

/**
 * Agno chat helper 对用户消息预插入行为的配置。
 */
export interface AgnoChatUserMessageOptions extends FrameworkChatUserMessageOptions {}

/**
 * Agno chat helper 对 assistant 操作栏的快捷配置。
 */
export interface AgnoChatAssistantActionsOptions extends FrameworkChatAssistantActionsOptions {}

/**
 * `useAgnoChatSession()` 的输入配置。
 *
 * 这个 helper 的目标是把最常见的 Agno 聊天接入压缩成一层：
 * - 自动创建 adapter
 * - 自动准备 Agno JSON SSE transport
 * - 自动预插入 user message
 * - 自动生成 turn / message 语义 id
 * - 自动把“重新生成”接回本次请求
 */
export interface UseAgnoChatSessionOptions<
  TSource = FetchTransportSource
> {
  /** 当前聊天真正要连接的 source，例如 `/api/stream/agno`。 */
  source: MaybeRefOrGetter<TSource | null | undefined>;
  /** 当前输入框里的文案。 */
  input?: MaybeRefOrGetter<string | undefined>;
  /** 当前整段聊天所属的 conversationId。 */
  conversationId: MaybeRefOrGetter<string>;
  /** Agno adapter 的 run 标题简写。 */
  title?: AgnoAdapterOptions<TSource>['title'];
  /** 传给 `createAgnoProtocol()` 的额外协议配置。 */
  protocolOptions?: Omit<AgnoProtocolOptions, 'conversationId' | 'turnId' | 'messageId'>;
  /** 按工具名映射 renderer 的 helper 产物。 */
  tools?: AgnoAdapterOptions<TSource>['tools'];
  /** 按事件名直接映射组件的 helper 产物。 */
  events?: AgnoAdapterOptions<TSource>['events'];
  /** 直接传给 RunSurface 的静态 surface 配置。 */
  surface?: RunSurfaceOptions;
  /** 透传给 Agno SSE transport 的配置。 */
  transport?: Omit<AgnoSseTransportOptions<TSource>, 'message'>;
  /** 自定义 turn / message 语义 id 的生成规则。 */
  createIds?: AgnoChatIdFactory;
  /** 额外桥接生命周期 hooks。 */
  hooks?: BridgeHooks<AgnoEvent>;
  /** 非 UI 事件的副作用通道。 */
  eventActions?: EventActionRegistryResult<AgnoEvent> | undefined;
  /** 是否启用当前聊天会话的内置 devtools。 */
  devtools?: false | FrameworkChatDevtoolsOptions<AgnoEvent>;
  /** 是否抓取后端 sessionId；默认开启。 */
  sessionId?: boolean | AgnoChatSessionIdOptions;
  /** 是否在真正连接前预插一条用户消息；默认开启。 */
  userMessage?: false | AgnoChatUserMessageOptions;
  /** assistant 默认消息操作栏的快捷配置；默认开启。 */
  assistantActions?: false | AgnoChatAssistantActionsOptions;
}

/**
 * `useAgnoChatSession()` 对外暴露的运行态结果。
 */
export interface UseAgnoChatSessionResult<
  TSource = FetchTransportSource
> extends FrameworkChatSessionResult<AgnoEvent, TSource, AgnoChatIds> {}

/**
 * 为一轮新请求生成默认聊天语义 id。
 */
export function createAgnoChatIds(input: {
  conversationId: string;
  at: number;
}): AgnoChatIds {
  return createFrameworkChatIds(input);
}

/**
 * 从 Agno 原始事件里读取最常见的 sessionId 字段。
 */
function resolveDefaultAgnoSessionId(event: AgnoEvent): string | undefined {
  if (typeof event.session_id === 'string' && event.session_id.length > 0) {
    return event.session_id;
  }

  if (typeof event.sessionId === 'string' && event.sessionId.length > 0) {
    return event.sessionId;
  }

  return undefined;
}

/**
 * 创建一个更短的 Agno 聊天接入入口。
 */
export function useAgnoChatSession<
  TSource = FetchTransportSource
>(
  options: UseAgnoChatSessionOptions<TSource>
): UseAgnoChatSessionResult<TSource> {
  return useFrameworkChatSession<
    AgnoEvent,
    TSource,
    AgnoChatIds,
    AgnoProtocolOptions,
    AgnoAdapterOptions<TSource>,
    AgnoSseTransportOptions<TSource>
  >({
    frameworkName: 'Agno',
    options,
    createAdapter: createAgnoAdapter,
    createTransport: createAgnoSseTransport,
    resolveSessionId: resolveDefaultAgnoSessionId
  }) as UseAgnoChatSessionResult<TSource>;
}
