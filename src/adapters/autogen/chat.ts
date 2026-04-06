import type { MaybeRefOrGetter } from 'vue';
import type { FetchTransportSource } from '../../runtime/transports';
import type { BridgeHooks, RuntimeData } from '../../runtime/types';
import type { EventActionRegistryResult } from '../../runtime/eventActions';
import type { RunSurfaceOptions } from '../../surface/types';
import {
  createFrameworkChatIds,
  type FrameworkChatAssistantActionsOptions,
  type FrameworkChatIds,
  type FrameworkChatSessionIdOptions,
  type FrameworkChatSessionResult,
  type FrameworkChatUserMessageOptions,
  useFrameworkChatSession
} from '../shared/chatFactory';
import { createAutoGenAdapter } from './adapter';
import { createAutoGenSseTransport, type AutoGenSseTransportOptions } from './transport';
import type {
  AutoGenAdapterOptions,
  AutoGenEvent,
  AutoGenProtocolOptions
} from './types';

/**
 * 一轮聊天请求里会用到的稳定语义 id 集合。
 */
export interface AutoGenChatIds extends FrameworkChatIds {}

/**
 * 自定义生成聊天语义 id 的回调签名。
 */
export type AutoGenChatIdFactory = (input: {
  /** 当前对话 id。 */
  conversationId: string;
  /** 本次发出的用户输入。 */
  text: string;
  /** 本次发送的时间戳。 */
  at: number;
}) => AutoGenChatIds;

/**
 * AutoGen chat helper 对 sessionId 抓取逻辑的配置。
 */
export interface AutoGenChatSessionIdOptions extends FrameworkChatSessionIdOptions<AutoGenEvent> {}

/**
 * AutoGen chat helper 对用户消息预插入行为的配置。
 */
export interface AutoGenChatUserMessageOptions extends FrameworkChatUserMessageOptions {}

/**
 * AutoGen chat helper 对 assistant 操作栏的快捷配置。
 */
export interface AutoGenChatAssistantActionsOptions extends FrameworkChatAssistantActionsOptions {}

/**
 * `useAutoGenChatSession()` 的输入配置。
 */
export interface UseAutoGenChatSessionOptions<
  TSource = FetchTransportSource
> {
  /** 当前聊天真正要连接的 source，例如 `/api/stream/autogen`。 */
  source: MaybeRefOrGetter<TSource | null | undefined>;
  /** 当前输入框里的文案。 */
  input?: MaybeRefOrGetter<string | undefined>;
  /** 当前整段聊天所属的 conversationId。 */
  conversationId: MaybeRefOrGetter<string>;
  /** AutoGen adapter 的 run 标题简写。 */
  title?: AutoGenAdapterOptions<TSource>['title'];
  /** 传给 `createAutoGenProtocol()` 的额外协议配置。 */
  protocolOptions?: Omit<AutoGenProtocolOptions, 'conversationId' | 'turnId' | 'messageId'>;
  /** 按工具名映射 renderer 的 helper 产物。 */
  tools?: AutoGenAdapterOptions<TSource>['tools'];
  /** 按事件名直接映射组件的 helper 产物。 */
  events?: AutoGenAdapterOptions<TSource>['events'];
  /** 直接传给 RunSurface 的静态 surface 配置。 */
  surface?: RunSurfaceOptions;
  /** 透传给 AutoGen SSE transport 的配置。 */
  transport?: Omit<AutoGenSseTransportOptions<TSource>, 'message'>;
  /** 自定义 turn / message 语义 id 的生成规则。 */
  createIds?: AutoGenChatIdFactory;
  /** 额外桥接生命周期 hooks。 */
  hooks?: BridgeHooks<AutoGenEvent>;
  /** 非 UI 事件的副作用通道。 */
  eventActions?: EventActionRegistryResult<AutoGenEvent> | undefined;
  /** 是否抓取后端 sessionId。 */
  sessionId?: boolean | AutoGenChatSessionIdOptions;
  /** 是否在真正连接前预插一条用户消息；默认开启。 */
  userMessage?: false | AutoGenChatUserMessageOptions;
  /** assistant 默认消息操作栏的快捷配置；默认开启。 */
  assistantActions?: false | AutoGenChatAssistantActionsOptions;
}

/**
 * `useAutoGenChatSession()` 对外暴露的运行态结果。
 */
export interface UseAutoGenChatSessionResult<
  TSource = FetchTransportSource
> extends FrameworkChatSessionResult<AutoGenEvent, TSource, AutoGenChatIds> {}

/**
 * 为一轮新请求生成默认聊天语义 id。
 */
export function createAutoGenChatIds(input: {
  conversationId: string;
  at: number;
}): AutoGenChatIds {
  return createFrameworkChatIds(input);
}

/**
 * 从未知值中读取普通对象。
 */
function readAutoGenRecord(value: unknown): RuntimeData | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as RuntimeData;
  }

  return undefined;
}

/**
 * 从 AutoGen 原始事件里读取最常见的 sessionId 字段。
 */
function resolveDefaultAutoGenSessionId(event: AutoGenEvent): string | undefined {
  if (typeof event.session_id === 'string' && event.session_id.length > 0) {
    return event.session_id;
  }

  if (typeof event.sessionId === 'string' && event.sessionId.length > 0) {
    return event.sessionId;
  }

  const metadata = readAutoGenRecord(event.metadata);

  if (typeof metadata?.session_id === 'string' && metadata.session_id.length > 0) {
    return metadata.session_id;
  }

  if (typeof metadata?.sessionId === 'string' && metadata.sessionId.length > 0) {
    return metadata.sessionId;
  }

  return undefined;
}

/**
 * 创建一个更短的 AutoGen 聊天接入入口。
 */
export function useAutoGenChatSession<
  TSource = FetchTransportSource
>(
  options: UseAutoGenChatSessionOptions<TSource>
): UseAutoGenChatSessionResult<TSource> {
  return useFrameworkChatSession<
    AutoGenEvent,
    TSource,
    AutoGenChatIds,
    AutoGenProtocolOptions,
    AutoGenAdapterOptions<TSource>,
    AutoGenSseTransportOptions<TSource>
  >({
    frameworkName: 'AutoGen',
    options,
    createAdapter: createAutoGenAdapter,
    createTransport: createAutoGenSseTransport,
    resolveSessionId: resolveDefaultAutoGenSessionId
  }) as UseAutoGenChatSessionResult<TSource>;
}
