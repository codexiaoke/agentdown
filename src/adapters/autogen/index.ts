/**
 * AutoGen 官方事件适配层入口。
 *
 * 对外只暴露两类能力：
 * 1. `createAutoGenProtocol()` / `defineAutoGenPreset()` 这两个接入入口
 * 2. 用户在接入时会用到的公共类型
 */

export { createAutoGenProtocol, defineAutoGenPreset } from './protocol';
export { defineAutoGenEventComponents } from './eventComponents';
export { defineAutoGenToolComponents } from './toolComponents';
export type {
  AutoGenBlockIdResolver,
  AutoGenEvent,
  AutoGenGroupIdResolver,
  AutoGenPresetOptions,
  AutoGenProtocolOptions,
  AutoGenRunTitleResolver,
  AutoGenStreamIdResolver,
  AutoGenToolCall,
  AutoGenToolPayload,
  AutoGenToolRendererContext,
  AutoGenToolRendererResolver,
  AutoGenToolResult
} from './types';
