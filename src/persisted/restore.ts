import type { RuntimeCommand } from '../runtime/types';
import type { AgentdownRecordsAdapter } from './adapter';
import {
  createDefaultAgentdownRecordsAdapter,
  resolveBuiltinAgentdownLastUserMessage,
  type BuiltinAgentdownRenderArchive,
  type BuiltinAgentdownRenderRecord
} from './builtin';
import {
  normalizeAgentdownRenderRecords,
  parseAgentdownRenderArchive,
  type AgentdownRenderArchive,
  type AgentdownRenderRecord
} from './types';

/**
 * restore helper 支持的输入类型。
 */
export type AgentdownRenderInput<
  TRecord extends AgentdownRenderRecord = BuiltinAgentdownRenderRecord,
  TArchive extends AgentdownRenderArchive = BuiltinAgentdownRenderArchive
> =
  | string
  | TArchive
  | Record<string, unknown>
  | readonly TRecord[];

/**
 * restore helper 的可选参数。
 */
export interface RestoreAgentdownRenderArchiveOptions<
  TRecord extends AgentdownRenderRecord = BuiltinAgentdownRenderRecord
> {
  adapter?: AgentdownRecordsAdapter<TRecord>;
}

/**
 * restore helper 返回的结构化结果。
 */
export interface RestoredAgentdownRenderArchiveResult<
  TRecord extends AgentdownRenderRecord = BuiltinAgentdownRenderRecord,
  TArchive extends AgentdownRenderArchive = BuiltinAgentdownRenderArchive
> {
  archive: TArchive | null;
  records: TRecord[];
  commands: RuntimeCommand[];
  metadata: {
    format: TArchive['format'] | null;
    framework: TArchive['framework'] | null;
    conversationId: string;
    sessionId: string;
    runId: string;
    status: string;
    updatedAt: number | null;
    completedAt: number | null;
  };
  lastUserMessage: string;
}

/**
 * 判断未知值是否为普通对象。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 判断一个值是否看起来像 archive 外壳。
 */
function looksLikeArchive(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
    && value.format === 'agentdown.session/v1'
    && typeof value.framework === 'string'
    && Array.isArray(value.records);
}

/**
 * 从原始输入里解析出 archive 和 records。
 */
function resolveRenderInput<
  TRecord extends AgentdownRenderRecord,
  TArchive extends AgentdownRenderArchive<string, TRecord>
>(
  input: AgentdownRenderInput<TRecord, TArchive>
): {
  archive: TArchive | null;
  records: TRecord[];
} {
  if (typeof input === 'string') {
    let parsed: unknown;

    try {
      parsed = JSON.parse(input) as unknown;
    } catch {
      throw new Error('Render archive JSON 解析失败。');
    }

    return resolveRenderInput(parsed as AgentdownRenderInput<TRecord, TArchive>);
  }

  if (Array.isArray(input)) {
    return {
      archive: null,
      records: normalizeAgentdownRenderRecords(input)
    };
  }

  if (!looksLikeArchive(input)) {
    throw new Error('Invalid Agentdown render archive payload.');
  }

  const archive = parseAgentdownRenderArchive<TArchive>(input);

  return {
    archive,
    records: archive.records
  };
}

/**
 * 恢复一份 archive / records 输入，得到可直接应用到 runtime 的命令列表。
 *
 * - 使用推荐内置 records 结构时，不传 adapter 也可以直接恢复
 * - 如果后端用了自定义结构，则传入自己的 records adapter 即可
 */
export function restoreAgentdownRenderArchive(
  input: AgentdownRenderInput<BuiltinAgentdownRenderRecord, BuiltinAgentdownRenderArchive>,
  options?: RestoreAgentdownRenderArchiveOptions<BuiltinAgentdownRenderRecord>
): RestoredAgentdownRenderArchiveResult<BuiltinAgentdownRenderRecord, BuiltinAgentdownRenderArchive>;
export function restoreAgentdownRenderArchive<
  TRecord extends AgentdownRenderRecord,
  TArchive extends AgentdownRenderArchive<string, TRecord>
>(
  input: AgentdownRenderInput<TRecord, TArchive>,
  options: RestoreAgentdownRenderArchiveOptions<TRecord>
): RestoredAgentdownRenderArchiveResult<TRecord, TArchive>;
export function restoreAgentdownRenderArchive<
  TRecord extends AgentdownRenderRecord,
  TArchive extends AgentdownRenderArchive<string, TRecord>
>(
  input: AgentdownRenderInput<TRecord, TArchive>,
  options: RestoreAgentdownRenderArchiveOptions<TRecord> = {}
): RestoredAgentdownRenderArchiveResult<TRecord, TArchive> {
  const { archive, records } = resolveRenderInput(input);
  const defaultAdapter = createDefaultAgentdownRecordsAdapter(
    archive?.conversation_id
      ? {
          conversationId: archive.conversation_id
        }
      : {}
  );
  const adapter = (
    options.adapter
    ?? defaultAdapter as unknown as AgentdownRecordsAdapter<TRecord>
  );
  const commands = adapter.restoreRecords(records);

  return {
    archive,
    records,
    commands,
    metadata: {
      format: archive?.format ?? null,
      framework: archive?.framework ?? null,
      conversationId: archive?.conversation_id ?? '',
      sessionId: archive?.session_id ?? '',
      runId: archive?.run_id ?? '',
      status: archive?.status ?? '',
      updatedAt: archive?.updated_at ?? null,
      completedAt: archive?.completed_at ?? null
    },
    lastUserMessage: resolveBuiltinAgentdownLastUserMessage(records)
  };
}
