/**
 * Spring AI 官方事件适配层入口。
 *
 * 对外暴露三层能力：
 * 1. `createSpringAiProtocol()` / `defineSpringAiPreset()` 这类底层接入入口
 * 2. `createSpringAiAdapter()` / `createSpringAiSseTransport()` 这类 starter helper
 * 3. `useSpringAiChatSession()` 这类更贴近聊天产品的高阶入口
 */

export { createSpringAiAdapter } from './adapter';
export { createSpringAiChatIds, useSpringAiChatSession } from './chat';
export { defineSpringAiEventActions } from './eventActions';
export { defineSpringAiEventComponents } from './eventComponents';
export { createSpringAiProtocol, defineSpringAiPreset } from './protocol';
export { createSpringAiSseTransport } from './transport';
export { defineSpringAiToolComponents } from './toolComponents';
export type {
  SpringAiChatAssistantActionsOptions,
  SpringAiChatHitlActionContext,
  SpringAiChatHitlActionKey,
  SpringAiChatHitlOptions,
  SpringAiChatIdFactory,
  SpringAiChatIds,
  SpringAiChatReconnectOptions,
  SpringAiChatSessionIdOptions,
  SpringAiChatUserMessageOptions,
  UseSpringAiChatSessionOptions,
  UseSpringAiChatSessionResult
} from './chat';
export type {
  SpringAiRequestBody,
  SpringAiResumeRequestBody,
  SpringAiSseTransportOptions
} from './transport';
export type {
  SpringAiAdapterOptions,
  SpringAiApprovalActionRequest,
  SpringAiApprovalPayload,
  SpringAiBlockIdResolver,
  SpringAiConversationIdResolver,
  SpringAiEditedAction,
  SpringAiEvent,
  SpringAiEventMetadata,
  SpringAiGroupIdResolver,
  SpringAiHumanDecision,
  SpringAiMessageIdResolver,
  SpringAiPresetOptions,
  SpringAiProtocolOptions,
  SpringAiRunTitleResolver,
  SpringAiStreamIdResolver,
  SpringAiToolPayload,
  SpringAiToolRendererContext,
  SpringAiToolRendererResolver,
  SpringAiTurnIdResolver
} from './types';
