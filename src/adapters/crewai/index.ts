/**
 * CrewAI 官方 SSE 适配层入口。
 *
 * 对外暴露：
 * 1. `createCrewAIProtocol()` / `defineCrewAIPreset()` 接入入口
 * 2. `parseCrewAISseMessage()` 这个 CrewAI 专用 SSE 解析辅助函数
 * 3. 用户在接入时会用到的公共类型
 */

export { parseCrewAISseMessage } from './packet';
export { createCrewAIProtocol, defineCrewAIPreset } from './protocol';
export { defineCrewAIEventComponents } from './eventComponents';
export { defineCrewAIToolComponents } from './toolComponents';
export type {
  CrewAIBlockIdResolver,
  CrewAIChunkType,
  CrewAIEvent,
  CrewAIGroupIdResolver,
  CrewAIMessage,
  CrewAIMessageToolCall,
  CrewAIMessageToolFunction,
  CrewAIPresetOptions,
  CrewAIProtocolOptions,
  CrewAIRunTitleResolver,
  CrewAIStreamIdResolver,
  CrewAIStreamingToolCall,
  CrewAITaskOutput,
  CrewAIToolPayload,
  CrewAIToolRendererContext,
  CrewAIToolRendererResolver
} from './types';
