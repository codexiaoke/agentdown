import type { AgentdownRecordsAdapter } from '../../persisted/adapter';
import type { AgentdownRenderArchive, AgentdownRenderRecord } from '../../persisted/types';
import type { AgnoEvent, AgnoRequirementPayload, AgnoToolExecutionPayload } from './types';

/**
 * Agno 结束态 records 里常见的工具内容结构。
 */
export interface AgnoToolRecordContent {
  tool?: AgnoToolExecutionPayload;
  rawEvent?: AgnoEvent;
}

/**
 * Agno 暂停确认或确认结果 records 里常见的审批内容结构。
 */
export interface AgnoApprovalRecordContent {
  requirement?: AgnoRequirementPayload;
  rawEvent?: AgnoEvent;
}

/**
 * Agno records 推荐使用的最小渲染结构。
 *
 * 这里只定义推荐骨架，不强制后端必须完整命中所有字段。
 */
export type AgnoRenderRecord =
  | AgentdownRenderRecord<'message', string, 'assistant' | 'system' | 'user'>
  | AgentdownRenderRecord<'tool', AgnoToolRecordContent, 'assistant'>
  | AgentdownRenderRecord<'approval', AgnoApprovalRecordContent, 'assistant'>
  | AgentdownRenderRecord<'error', string | Record<string, unknown>, 'assistant' | 'system'>;

/**
 * Agno 渲染归档外壳。
 */
export type AgnoRenderArchive = AgentdownRenderArchive<'agno', AgnoRenderRecord>;

/**
 * Agno records-only 适配器类型。
 */
export type AgnoRecordsAdapter<TRawEvent = AgnoEvent> = AgentdownRecordsAdapter<
  AgnoRenderRecord,
  TRawEvent
>;
