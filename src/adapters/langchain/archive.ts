import type { AgentdownRecordsAdapter } from '../../persisted/adapter';
import type { AgentdownRenderArchive, AgentdownRenderRecord } from '../../persisted/types';
import type {
  LangChainEvent,
  LangChainInterruptPayload,
  LangChainToolPayload
} from './types';

/**
 * LangChain tool record 里的常见内容结构。
 */
export interface LangChainToolRecordContent {
  tool?: LangChainToolPayload;
  rawEvent?: LangChainEvent;
}

/**
 * LangChain interrupt / approval record 里的常见内容结构。
 */
export interface LangChainApprovalRecordContent {
  interrupt?: LangChainInterruptPayload;
  rawEvent?: LangChainEvent;
}

/**
 * LangChain / LangGraph 推荐使用的 records 骨架。
 */
export type LangChainRenderRecord =
  | AgentdownRenderRecord<'message', string, 'assistant' | 'system' | 'user'>
  | AgentdownRenderRecord<'tool', LangChainToolRecordContent, 'assistant'>
  | AgentdownRenderRecord<'approval', LangChainApprovalRecordContent, 'assistant'>
  | AgentdownRenderRecord<'error', string | Record<string, unknown>, 'assistant' | 'system'>;

/**
 * LangChain / LangGraph 渲染归档外壳。
 */
export type LangChainRenderArchive = AgentdownRenderArchive<'langchain', LangChainRenderRecord>;

/**
 * LangChain / LangGraph records-only 适配器类型。
 */
export type LangChainRecordsAdapter<TRawEvent = LangChainEvent> = AgentdownRecordsAdapter<
  LangChainRenderRecord,
  TRawEvent
>;
