import type { AgentdownRecordsAdapter } from '../../persisted/adapter';
import type { AgentdownRenderArchive, AgentdownRenderRecord } from '../../persisted/types';
import type {
  SpringAiApprovalPayload,
  SpringAiEvent,
  SpringAiToolPayload
} from './types';

/**
 * Spring AI 工具记录里常见的内容结构。
 */
export interface SpringAiToolRecordContent {
  tool?: SpringAiToolPayload;
  rawEvent?: SpringAiEvent;
}

/**
 * Spring AI approval 记录里常见的内容结构。
 */
export interface SpringAiApprovalRecordContent {
  approval?: SpringAiApprovalPayload;
  rawEvent?: SpringAiEvent;
}

/**
 * Spring AI 推荐使用的 records 骨架。
 */
export type SpringAiRenderRecord =
  | AgentdownRenderRecord<'message', string, 'assistant' | 'system' | 'user'>
  | AgentdownRenderRecord<'tool', SpringAiToolRecordContent, 'assistant'>
  | AgentdownRenderRecord<'approval', SpringAiApprovalRecordContent, 'assistant'>
  | AgentdownRenderRecord<'error', string | Record<string, unknown>, 'assistant' | 'system'>;

/**
 * Spring AI 渲染归档外壳。
 */
export type SpringAiRenderArchive = AgentdownRenderArchive<'springai', SpringAiRenderRecord>;

/**
 * Spring AI records-only 适配器类型。
 */
export type SpringAiRecordsAdapter<TRawEvent = SpringAiEvent> = AgentdownRecordsAdapter<
  SpringAiRenderRecord,
  TRawEvent
>;
