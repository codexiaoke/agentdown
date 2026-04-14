import type { RuntimeCommand } from '../runtime/types';
import type { AgentdownRenderRecord } from './types';

/**
 * records-only 模式下的最小适配器接口。
 *
 * - `restoreRecords()`：把后端返回的历史 records 恢复成 runtime 命令
 * - `reduceEvent()`：把一条实时原始事件合并回同一份 records 列表
 */
export interface AgentdownRecordsAdapter<
  TRecord extends AgentdownRenderRecord = AgentdownRenderRecord,
  TRawEvent = unknown
> {
  /** 首屏加载时，把历史 records 恢复成 runtime 命令。 */
  restoreRecords: (records: readonly TRecord[]) => RuntimeCommand[];
  /**
   * 运行中可选的实时 reducer。
   *
   * 如果某个框架只想把 records 作为结束态恢复协议，也可以不实现这一项。
   */
  reduceEvent?: (
    records: readonly TRecord[],
    rawEvent: TRawEvent
  ) => TRecord[];
}

/**
 * 定义一个 records-only 适配器。
 *
 * 单独抽这个 helper，主要是为了后续适配器实现时更容易拿到泛型推断。
 */
export function defineAgentdownRecordsAdapter<
  TRecord extends AgentdownRenderRecord = AgentdownRenderRecord,
  TRawEvent = unknown
>(
  adapter: AgentdownRecordsAdapter<TRecord, TRawEvent>
): AgentdownRecordsAdapter<TRecord, TRawEvent> {
  return adapter;
}
