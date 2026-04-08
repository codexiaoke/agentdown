/**
 * AutoGen 官方事件适配层入口。
 *
 * 对外暴露三层能力：
 * 1. `createAutoGenProtocol()` / `defineAutoGenPreset()` 这类底层接入入口
 * 2. `createAutoGenAdapter()` / `createAutoGenSseTransport()` 这类 starter helper
 * 3. `useAutoGenChatSession()` 这类更贴近聊天产品的高阶入口
 */

export { createAutoGenAdapter } from './adapter';
export { createAutoGenChatIds, useAutoGenChatSession } from './chat';
export { defineAutoGenEventActions } from './eventActions';
export { createAutoGenProtocol, defineAutoGenPreset } from './protocol';
export { createAutoGenSseTransport } from './transport';
export { defineAutoGenEventComponents } from './eventComponents';
export { defineAutoGenToolComponents } from './toolComponents';
export type {
  AutoGenChatAssistantActionsOptions,
  AutoGenChatIdFactory,
  AutoGenChatIds,
  AutoGenChatSessionIdOptions,
  AutoGenChatUserMessageOptions,
  UseAutoGenChatSessionOptions,
  UseAutoGenChatSessionResult
} from './chat';
export type { AutoGenRequestBody, AutoGenSseTransportOptions } from './transport';
export type { AutoGenResumeRequestBody } from './transport';
export type {
  AutoGenAdapterOptions,
  AutoGenBlockIdResolver,
  AutoGenConversationIdResolver,
  AutoGenEvent,
  AutoGenGroupIdResolver,
  AutoGenMessageIdResolver,
  AutoGenPresetOptions,
  AutoGenProtocolOptions,
  AutoGenRunTitleResolver,
  AutoGenStreamIdResolver,
  AutoGenTurnIdResolver,
  AutoGenToolCall,
  AutoGenToolPayload,
  AutoGenToolRendererContext,
  AutoGenToolRendererResolver,
  AutoGenToolResult
} from './types';
