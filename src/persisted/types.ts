import { cloneValue } from '../runtime/utils';

/**
 * records 渲染模型里默认支持的角色类型。
 *
 * 这里保留 `(string & {})`，是为了允许不同后端继续扩展自己的角色名，
 * 例如某些多代理框架可能会补充 `tool` / `planner` / `critic` 之类的角色。
 */
export type AgentdownRenderRole =
  | 'assistant'
  | 'system'
  | 'user'
  | (string & {});

/**
 * 后端返回给前端的最小渲染记录。
 *
 * 页面首次加载时直接渲染这份 records，
 * SSE 实时追加时也继续维护同一份 records 列表。
 */
export interface AgentdownRenderRecord<
  TEvent extends string = string,
  TContent = unknown,
  TRole extends string = AgentdownRenderRole
> {
  /** 当前记录的语义事件名，例如 `message` / `tool` / `approval`。 */
  event: TEvent;
  /** 当前记录所属角色。 */
  role: TRole;
  /** 当前记录真正的业务内容；结构由具体适配器决定。 */
  content: TContent;
  /** 当前记录在后端被创建的时间戳。 */
  created_at: number;
}

/**
 * 后端存储或接口返回的一份完整归档外壳。
 *
 * 适配器真正恢复页面时通常只需要 `records`，
 * 但外层元信息对查询、筛选、会话管理依然有价值。
 */
export interface AgentdownRenderArchive<
  TFramework extends string = string,
  TRecord extends AgentdownRenderRecord = AgentdownRenderRecord,
  TStatus extends string = string
> {
  /** 当前归档协议版本。 */
  format: 'agentdown.session/v1';
  /** 当前归档所属框架，例如 `agno` / `springai`。 */
  framework: TFramework;
  /** 当前会话级 conversation id。 */
  conversation_id?: string;
  /** 当前后端 session id。 */
  session_id?: string;
  /** 当前 run id。 */
  run_id?: string;
  /** 当前归档状态，例如 `completed` / `failed`。 */
  status: TStatus;
  /** 当前 run 启动时间。 */
  started_at?: number;
  /** 当前归档最近一次更新时间。 */
  updated_at: number;
  /** 当前 run 结束时间。 */
  completed_at?: number;
  /** 真正给前端恢复页面使用的 records 列表。 */
  records: TRecord[];
}

/**
 * 判断一个未知值是否为普通对象。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 判断一个未知值是否为合法时间戳。
 */
function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * 轻量判断一条记录是否符合公共 envelope 结构。
 */
export function isAgentdownRenderRecord(value: unknown): value is AgentdownRenderRecord {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.event === 'string'
    && value.event.length > 0
    && typeof value.role === 'string'
    && value.role.length > 0
    && isTimestamp(value.created_at)
    && 'content' in value;
}

/**
 * 轻量判断一份归档外壳是否符合公共结构。
 */
export function isAgentdownRenderArchive(value: unknown): value is AgentdownRenderArchive {
  if (!isRecord(value)) {
    return false;
  }

  return value.format === 'agentdown.session/v1'
    && typeof value.framework === 'string'
    && value.framework.length > 0
    && typeof value.status === 'string'
    && value.status.length > 0
    && isTimestamp(value.updated_at)
    && Array.isArray(value.records)
    && value.records.every((record) => isAgentdownRenderRecord(record));
}

/**
 * 解析后端返回的 archive JSON，并规范成一份可安全复用的对象副本。
 */
export function parseAgentdownRenderArchive<
  TArchive extends AgentdownRenderArchive = AgentdownRenderArchive
>(
  input: string | TArchive | Record<string, unknown>
): TArchive {
  let value: unknown = input;

  if (typeof input === 'string') {
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      throw new Error('Render archive JSON 解析失败。');
    }
  }

  if (!isAgentdownRenderArchive(value)) {
    throw new Error('Invalid Agentdown render archive payload.');
  }

  return cloneValue(value) as TArchive;
}

/**
 * 规范化一组外部 records，方便页面首次恢复时复用。
 */
export function normalizeAgentdownRenderRecords<
  TRecord extends AgentdownRenderRecord = AgentdownRenderRecord
>(
  records: readonly TRecord[]
): TRecord[] {
  if (!records.every((record) => isAgentdownRenderRecord(record))) {
    throw new Error('Invalid Agentdown render records payload.');
  }

  return cloneValue([...records]);
}
