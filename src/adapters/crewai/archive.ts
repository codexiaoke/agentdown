import type { AgentdownRecordsAdapter } from '../../persisted/adapter';
import type { AgentdownRenderArchive, AgentdownRenderRecord } from '../../persisted/types';
import type { CrewAIEvent, CrewAIToolPayload } from './types';

/**
 * CrewAI 工具记录里常见的内容结构。
 */
export interface CrewAIToolRecordContent {
  tool?: CrewAIToolPayload;
  rawEvent?: CrewAIEvent;
}

/**
 * CrewAI 推荐使用的 records 骨架。
 */
export type CrewAIRenderRecord =
  | AgentdownRenderRecord<'message', string, 'assistant' | 'system' | 'user'>
  | AgentdownRenderRecord<'tool', CrewAIToolRecordContent, 'assistant'>
  | AgentdownRenderRecord<'error', string | Record<string, unknown>, 'assistant' | 'system'>;

/**
 * CrewAI 渲染归档外壳。
 */
export type CrewAIRenderArchive = AgentdownRenderArchive<'crewai', CrewAIRenderRecord>;

/**
 * CrewAI records-only 适配器类型。
 */
export type CrewAIRecordsAdapter<TRawEvent = CrewAIEvent> = AgentdownRecordsAdapter<
  CrewAIRenderRecord,
  TRawEvent
>;
