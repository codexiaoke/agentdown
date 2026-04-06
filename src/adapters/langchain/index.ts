/**
 * LangChain 官方事件适配层入口。
 *
 * 对外只暴露两类能力：
 * 1. `createLangChainProtocol()` / `defineLangChainPreset()` 这两个接入入口
 * 2. 用户在接入时会用到的公共类型
 */

export { createLangChainProtocol, defineLangChainPreset } from './protocol';
export { defineLangChainEventComponents } from './eventComponents';
export { defineLangChainToolComponents } from './toolComponents';
export type {
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
