/**
 * CrewAI 官方 SSE 适配层入口。
 *
 * 对外暴露三层能力：
 * 1. `createCrewAIProtocol()` / `defineCrewAIPreset()` 这类底层接入入口
 * 2. `createCrewAIAdapter()` / `createCrewAISseTransport()` 这类 starter helper
 * 3. `useCrewAIChatSession()` 这类更贴近聊天产品的高阶入口
 */

export { createCrewAIAdapter } from './adapter';
export { createCrewAIChatIds, useCrewAIChatSession } from './chat';
export { parseCrewAISseMessage } from './packet';
export { createCrewAIProtocol, defineCrewAIPreset } from './protocol';
export { createCrewAISseTransport } from './transport';
export { defineCrewAIEventComponents } from './eventComponents';
export { defineCrewAIToolComponents } from './toolComponents';
export type {
  CrewAIChatAssistantActionsOptions,
  CrewAIChatIdFactory,
  CrewAIChatIds,
  CrewAIChatSessionIdOptions,
  CrewAIChatUserMessageOptions,
  UseCrewAIChatSessionOptions,
  UseCrewAIChatSessionResult
} from './chat';
export type { CrewAIRequestBody, CrewAISseTransportOptions } from './transport';
export type {
  CrewAIAdapterOptions,
  CrewAIBlockIdResolver,
  CrewAIChunkType,
  CrewAIConversationIdResolver,
  CrewAIEvent,
  CrewAIGroupIdResolver,
  CrewAIMessageIdResolver,
  CrewAIMessage,
  CrewAIMessageToolCall,
  CrewAIMessageToolFunction,
  CrewAIPresetOptions,
  CrewAIProtocolOptions,
  CrewAIRunTitleResolver,
  CrewAIStreamIdResolver,
  CrewAITurnIdResolver,
  CrewAIStreamingToolCall,
  CrewAITaskOutput,
  CrewAIToolPayload,
  CrewAIToolRendererContext,
  CrewAIToolRendererResolver
} from './types';
