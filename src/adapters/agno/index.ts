/**
 * Agno 官方事件适配层入口。
 *
 * 对外只暴露两类能力：
 * 1. `createAgnoProtocol()` / `defineAgnoPreset()` 这两个接入入口
 * 2. 用户在接入时会用到的公共类型
 */

export { createAgnoProtocol, defineAgnoPreset } from './protocol';
export type {
  AgnoBlockIdResolver,
  AgnoEvent,
  AgnoGroupIdResolver,
  AgnoPresetOptions,
  AgnoProtocolOptions,
  AgnoRunTitleResolver,
  AgnoStreamIdResolver,
  AgnoToolPayload,
  AgnoToolRendererContext,
  AgnoToolRendererResolver
} from './types';
