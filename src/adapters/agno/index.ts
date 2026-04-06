/**
 * Agno 官方事件适配层入口。
 *
 * 对外只暴露两类能力：
 * 1. `createAgnoProtocol()` / `defineAgnoPreset()` 这两个接入入口
 * 2. 用户在接入时会用到的公共类型
 */

export { createAgnoAdapter } from './adapter';
export { createAgnoProtocol, defineAgnoPreset } from './protocol';
export { createAgnoSseTransport } from './transport';
export { defineAgnoEventComponents } from './eventComponents';
export { defineAgnoToolComponents } from './toolComponents';
export type { AgnoRequestBody, AgnoSseTransportOptions } from './transport';
export type {
  AgnoAdapterOptions,
  AgnoBlockIdResolver,
  AgnoConversationIdResolver,
  AgnoEvent,
  AgnoGroupIdResolver,
  AgnoMessageIdResolver,
  AgnoPresetOptions,
  AgnoProtocolOptions,
  AgnoRunTitleResolver,
  AgnoStreamIdResolver,
  AgnoTurnIdResolver,
  AgnoToolPayload,
  AgnoToolRendererContext,
  AgnoToolRendererResolver
} from './types';
