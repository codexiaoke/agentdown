/**
 * LangChain 官方事件适配层入口。
 *
 * 对外暴露三层能力：
 * 1. `createLangChainProtocol()` / `defineLangChainPreset()` 这类底层接入入口
 * 2. `createLangChainAdapter()` / `createLangChainSseTransport()` 这类 starter helper
 * 3. `useLangChainChatSession()` 这类更贴近聊天产品的高阶入口
 */

export { createLangChainAdapter } from './adapter';
export { createLangChainChatIds, useLangChainChatSession } from './chat';
export { defineLangChainEventActions } from './eventActions';
export { createLangChainProtocol, defineLangChainPreset } from './protocol';
export { createLangChainSseTransport } from './transport';
export { defineLangChainEventComponents } from './eventComponents';
export { defineLangChainToolComponents } from './toolComponents';
export type {
  LangChainChatAssistantActionsOptions,
  LangChainChatIdFactory,
  LangChainChatIds,
  LangChainChatSessionIdOptions,
  LangChainChatUserMessageOptions,
  UseLangChainChatSessionOptions,
  UseLangChainChatSessionResult
} from './chat';
export type { LangChainRequestBody, LangChainSseTransportOptions } from './transport';
export type {
  LangChainAdapterOptions,
  LangChainBlockIdResolver,
  LangChainConversationIdResolver,
  LangChainEvent,
  LangChainGroupIdResolver,
  LangChainMessageIdResolver,
  LangChainPresetOptions,
  LangChainProtocolOptions,
  LangChainRunTitleResolver,
  LangChainStreamIdResolver,
  LangChainTurnIdResolver,
  LangChainToolPayload,
  LangChainToolRendererContext,
  LangChainToolRendererResolver
} from './types';
