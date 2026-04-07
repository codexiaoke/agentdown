import type { MaybeRefOrGetter } from 'vue';
import type { FetchTransportSource } from '../../runtime/transports';
import type { BridgeHooks, RuntimeData } from '../../runtime/types';
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
import { createCrewAIAdapter } from './adapter';
import { createCrewAISseTransport, type CrewAISseTransportOptions } from './transport';
import type {
  CrewAIAdapterOptions,
  CrewAIEvent,
  CrewAIProtocolOptions
} from './types';

/**
 * 一轮聊天请求里会用到的稳定语义 id 集合。
 */
export interface CrewAIChatIds extends FrameworkChatIds {}

/**
 * 自定义生成聊天语义 id 的回调签名。
 */
export type CrewAIChatIdFactory = (input: {
  /** 当前对话 id。 */
  conversationId: string;
  /** 本次发出的用户输入。 */
  text: string;
  /** 本次发送的时间戳。 */
  at: number;
}) => CrewAIChatIds;

/**
 * CrewAI chat helper 对 sessionId 抓取逻辑的配置。
 */
export interface CrewAIChatSessionIdOptions extends FrameworkChatSessionIdOptions<CrewAIEvent> {}

/**
 * CrewAI chat helper 对用户消息预插入行为的配置。
 */
export interface CrewAIChatUserMessageOptions extends FrameworkChatUserMessageOptions {}

/**
 * CrewAI chat helper 对 assistant 操作栏的快捷配置。
 */
export interface CrewAIChatAssistantActionsOptions extends FrameworkChatAssistantActionsOptions {}

/**
 * `useCrewAIChatSession()` 的输入配置。
 */
export interface UseCrewAIChatSessionOptions<
  TSource = FetchTransportSource
> {
  /** 当前聊天真正要连接的 source，例如 `/api/stream/crewai`。 */
  source: MaybeRefOrGetter<TSource | null | undefined>;
  /** 当前输入框里的文案。 */
  input?: MaybeRefOrGetter<string | undefined>;
  /** 当前整段聊天所属的 conversationId。 */
  conversationId: MaybeRefOrGetter<string>;
  /** CrewAI adapter 的 run 标题简写。 */
  title?: CrewAIAdapterOptions<TSource>['title'];
  /** 传给 `createCrewAIProtocol()` 的额外协议配置。 */
  protocolOptions?: Omit<CrewAIProtocolOptions, 'conversationId' | 'turnId' | 'messageId'>;
  /** 按工具名映射 renderer 的 helper 产物。 */
  tools?: CrewAIAdapterOptions<TSource>['tools'];
  /** 按事件名直接映射组件的 helper 产物。 */
  events?: CrewAIAdapterOptions<TSource>['events'];
  /** 直接传给 RunSurface 的静态 surface 配置。 */
  surface?: RunSurfaceOptions;
  /** 透传给 CrewAI SSE transport 的配置。 */
  transport?: Omit<CrewAISseTransportOptions<TSource>, 'message'>;
  /** 自定义 turn / message 语义 id 的生成规则。 */
  createIds?: CrewAIChatIdFactory;
  /** 额外桥接生命周期 hooks。 */
  hooks?: BridgeHooks<CrewAIEvent>;
  /** 非 UI 事件的副作用通道。 */
  eventActions?: EventActionRegistryResult<CrewAIEvent> | undefined;
  /** 是否启用当前聊天会话的内置 devtools。 */
  devtools?: false | FrameworkChatDevtoolsOptions<CrewAIEvent>;
  /** 是否抓取后端 sessionId。 */
  sessionId?: boolean | CrewAIChatSessionIdOptions;
  /** 是否在真正连接前预插一条用户消息；默认开启。 */
  userMessage?: false | CrewAIChatUserMessageOptions;
  /** assistant 默认消息操作栏的快捷配置；默认开启。 */
  assistantActions?: false | CrewAIChatAssistantActionsOptions;
}

/**
 * `useCrewAIChatSession()` 对外暴露的运行态结果。
 */
export interface UseCrewAIChatSessionResult<
  TSource = FetchTransportSource
> extends FrameworkChatSessionResult<CrewAIEvent, TSource, CrewAIChatIds> {}

/**
 * 为一轮新请求生成默认聊天语义 id。
 */
export function createCrewAIChatIds(input: {
  conversationId: string;
  at: number;
}): CrewAIChatIds {
  return createFrameworkChatIds(input);
}

/**
 * 从未知值中读取普通对象。
 */
function readCrewAIRecord(value: unknown): RuntimeData | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as RuntimeData;
  }

  return undefined;
}

/**
 * 从 CrewAI 原始事件里读取最常见的 sessionId 字段。
 */
function resolveDefaultCrewAISessionId(event: CrewAIEvent): string | undefined {
  if (typeof event.session_id === 'string' && event.session_id.length > 0) {
    return event.session_id;
  }

  if (typeof event.sessionId === 'string' && event.sessionId.length > 0) {
    return event.sessionId;
  }

  const error = readCrewAIRecord(event.error);

  if (typeof error?.session_id === 'string' && error.session_id.length > 0) {
    return error.session_id;
  }

  if (typeof error?.sessionId === 'string' && error.sessionId.length > 0) {
    return error.sessionId;
  }

  return undefined;
}

/**
 * 创建一个更短的 CrewAI 聊天接入入口。
 */
export function useCrewAIChatSession<
  TSource = FetchTransportSource
>(
  options: UseCrewAIChatSessionOptions<TSource>
): UseCrewAIChatSessionResult<TSource> {
  return useFrameworkChatSession<
    CrewAIEvent,
    TSource,
    CrewAIChatIds,
    CrewAIProtocolOptions,
    CrewAIAdapterOptions<TSource>,
    CrewAISseTransportOptions<TSource>
  >({
    frameworkName: 'CrewAI',
    options,
    createAdapter: createCrewAIAdapter,
    createTransport: createCrewAISseTransport,
    resolveSessionId: resolveDefaultCrewAISessionId
  }) as UseCrewAIChatSessionResult<TSource>;
}
