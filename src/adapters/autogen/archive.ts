import type { AgentdownRecordsAdapter } from '../../persisted/adapter';
import type { AgentdownRenderArchive, AgentdownRenderRecord } from '../../persisted/types';
import type { AutoGenEvent } from './types';

/**
 * AutoGen tool record 里的常见内容结构。
 */
export interface AutoGenToolRecordContent {
  tool_calls?: unknown;
  rawEvent?: AutoGenEvent;
}

/**
 * AutoGen handoff record 里的常见内容结构。
 */
export interface AutoGenHandoffRecordContent {
  target?: string;
  message?: string;
  context?: unknown;
  rawEvent?: AutoGenEvent;
}

/**
 * AutoGen 推荐使用的 records 骨架。
 */
export type AutoGenRenderRecord =
  | AgentdownRenderRecord<'message', string, 'assistant' | 'system' | 'user'>
  | AgentdownRenderRecord<'thought', string, 'assistant'>
  | AgentdownRenderRecord<'tool', AutoGenToolRecordContent, 'assistant'>
  | AgentdownRenderRecord<'handoff', AutoGenHandoffRecordContent, 'assistant'>
  | AgentdownRenderRecord<'error', string | Record<string, unknown>, 'assistant' | 'system'>;

/**
 * AutoGen 渲染归档外壳。
 */
export type AutoGenRenderArchive = AgentdownRenderArchive<'autogen', AutoGenRenderRecord>;

/**
 * AutoGen records-only 适配器类型。
 */
export type AutoGenRecordsAdapter<TRawEvent = AutoGenEvent> = AgentdownRecordsAdapter<
  AutoGenRenderRecord,
  TRawEvent
>;
