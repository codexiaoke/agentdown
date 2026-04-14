import { cmd } from '../runtime/defineProtocol';
import type { RuntimeCommand } from '../runtime/types';
import { defineAgentdownRecordsAdapter, type AgentdownRecordsAdapter } from './adapter';
import type { AgentdownRenderArchive, AgentdownRenderRecord } from './types';

/**
 * Agentdown 内置 records 渲染模型里默认支持的角色类型。
 */
export type BuiltinAgentdownRenderRole = 'assistant' | 'system' | 'user';

/**
 * 内置 tool 记录支持的状态集合。
 *
 * 这里保留 `(string & {})`，允许业务层扩展更多后端状态。
 */
export type BuiltinAgentdownRenderToolStatus =
  | 'pending'
  | 'waiting'
  | 'running'
  | 'done'
  | 'completed'
  | 'success'
  | 'failed'
  | 'rejected'
  | 'cancelled'
  | 'canceled'
  | 'changes_requested'
  | (string & {});

/**
 * 内置 approval 记录支持的状态集合。
 */
export type BuiltinAgentdownRenderApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'changes_requested'
  | (string & {});

/**
 * 内置 handoff 记录支持的状态集合。
 */
export type BuiltinAgentdownRenderHandoffStatus =
  | 'pending'
  | 'accepted'
  | 'completed'
  | 'declined'
  | (string & {});

/**
 * 内置 attachment 记录支持的附件类型。
 */
export type BuiltinAgentdownRenderAttachmentKind =
  | 'file'
  | 'image'
  | 'audio'
  | 'video'
  | 'json'
  | 'input'
  | (string & {});

/**
 * 内置 artifact 记录支持的产物类型。
 */
export type BuiltinAgentdownRenderArtifactKind =
  | 'file'
  | 'diff'
  | 'report'
  | 'image'
  | 'json'
  | 'table'
  | (string & {});

/**
 * 内置普通消息记录支持的内容结构。
 */
export type BuiltinAgentdownRenderMessageKind = 'text' | 'markdown';

export interface BuiltinAgentdownRenderMessageContent {
  text: string;
  kind?: BuiltinAgentdownRenderMessageKind;
}

/**
 * 内置 thought 记录支持的内容结构。
 */
export interface BuiltinAgentdownRenderThoughtContent {
  text: string;
  title?: string;
  status?: 'idle' | 'thinking' | 'done';
  durationText?: string;
  durationMs?: number;
}

/**
 * 内置 tool 记录支持的内容结构。
 */
export interface BuiltinAgentdownRenderToolContent {
  id?: string;
  name?: string;
  title?: string;
  status?: BuiltinAgentdownRenderToolStatus;
  args?: unknown;
  result?: unknown;
  message?: string;
  iconPath?: string;
  tool?: Record<string, unknown>;
}

/**
 * 内置 approval 记录支持的内容结构。
 */
export interface BuiltinAgentdownRenderApprovalContent {
  id?: string;
  title?: string;
  status?: BuiltinAgentdownRenderApprovalStatus;
  message?: string;
  refId?: string;
  approval?: Record<string, unknown>;
  requirement?: Record<string, unknown>;
  interrupt?: Record<string, unknown>;
}

/**
 * 内置 handoff 记录支持的内容结构。
 */
export interface BuiltinAgentdownRenderHandoffContent {
  id?: string;
  title?: string;
  status?: BuiltinAgentdownRenderHandoffStatus;
  targetType?: 'human' | 'team' | 'agent' | 'system';
  assignee?: string;
  message?: string;
  refId?: string;
}

/**
 * 内置 branch 记录支持的内容结构。
 */
export interface BuiltinAgentdownRenderBranchContent {
  id?: string;
  title?: string;
  status?: string;
  label?: string;
  message?: string;
  sourceRunId?: string;
  targetRunId?: string;
  refId?: string;
}

/**
 * 内置 artifact 记录支持的内容结构。
 */
export interface BuiltinAgentdownRenderArtifactContent {
  id?: string;
  title?: string;
  artifactKind?: BuiltinAgentdownRenderArtifactKind;
  label?: string;
  href?: string;
  message?: string;
  refId?: string;
}

/**
 * 内置 attachment 记录支持的内容结构。
 */
export interface BuiltinAgentdownRenderAttachmentContent {
  id?: string;
  title?: string;
  attachmentKind?: BuiltinAgentdownRenderAttachmentKind;
  label?: string;
  href?: string;
  mimeType?: string;
  sizeText?: string;
  previewSrc?: string;
  status?: string;
  message?: string;
  refId?: string;
}

/**
 * 内置 error 记录支持的内容结构。
 */
export interface BuiltinAgentdownRenderErrorContent {
  title?: string;
  message?: string;
  code?: string;
  refId?: string;
}

/**
 * Agentdown 推荐的通用 records 渲染结构。
 */
export type BuiltinAgentdownRenderRecord =
  | AgentdownRenderRecord<'message', string | BuiltinAgentdownRenderMessageContent, BuiltinAgentdownRenderRole>
  | AgentdownRenderRecord<'thought', string | BuiltinAgentdownRenderThoughtContent, 'assistant'>
  | AgentdownRenderRecord<'tool', BuiltinAgentdownRenderToolContent | Record<string, unknown>, 'assistant'>
  | AgentdownRenderRecord<'approval', BuiltinAgentdownRenderApprovalContent | Record<string, unknown>, 'assistant'>
  | AgentdownRenderRecord<'handoff', BuiltinAgentdownRenderHandoffContent | Record<string, unknown>, 'assistant'>
  | AgentdownRenderRecord<'branch', BuiltinAgentdownRenderBranchContent | Record<string, unknown>, 'assistant'>
  | AgentdownRenderRecord<'artifact', BuiltinAgentdownRenderArtifactContent | Record<string, unknown>, 'assistant'>
  | AgentdownRenderRecord<'attachment', BuiltinAgentdownRenderAttachmentContent | Record<string, unknown>, BuiltinAgentdownRenderRole>
  | AgentdownRenderRecord<'error', string | BuiltinAgentdownRenderErrorContent | Record<string, unknown>, 'assistant' | 'system'>;

/**
 * Agentdown 推荐的通用 archive 渲染结构。
 */
export type BuiltinAgentdownRenderArchive<
  TFramework extends string = string,
  TStatus extends string = string
> = AgentdownRenderArchive<TFramework, BuiltinAgentdownRenderRecord, TStatus>;

/**
 * 内置 records adapter 类型别名。
 */
export type BuiltinAgentdownRecordsAdapter<TRawEvent = unknown> = AgentdownRecordsAdapter<
  BuiltinAgentdownRenderRecord,
  TRawEvent
>;

/**
 * 创建内置默认 records adapter 时支持的配置项。
 */
export interface CreateDefaultAgentdownRecordsAdapterOptions {
  conversationId?: string;
}

interface RestoreScope {
  conversationId: string;
  turnId?: string;
  messageId?: string;
  groupId?: string;
}

interface RestoreState {
  conversationId: string;
  turnIndex: number;
  systemIndex: number;
  blockIndex: number;
  toolIndex: number;
  currentTurnId: string | null;
  currentAssistantMessageId: string | null;
}

const PENDING_TOOL_STATUSES = new Set<BuiltinAgentdownRenderToolStatus>(['pending', 'waiting', 'running']);

/**
 * 判断一个未知值是否为普通对象。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 读取一个可选字符串字段。
 */
function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/**
 * 读取一个可选布尔字段。
 */
function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * 尝试从消息内容中提取文本。
 */
export function resolveBuiltinAgentdownMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!isRecord(content)) {
    return '';
  }

  return readString(content.text) ?? readString(content.message) ?? '';
}

function containsMarkdownTable(text: string): boolean {
  const lines = text.split('\n');

  for (let index = 0; index < lines.length - 1; index += 1) {
    const current = lines[index]?.trim() ?? '';
    const next = lines[index + 1]?.trim() ?? '';

    if (!current.includes('|')) {
      continue;
    }

    if (/^\|?\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+\s*\|?$/.test(next)) {
      return true;
    }
  }

  return false;
}

function looksLikeMarkdownMessage(text: string): boolean {
  const normalized = text.trim();

  if (normalized.length === 0) {
    return false;
  }

  return (
    /^\s{0,3}#{1,6}\s+\S/m.test(normalized)
    || /^\s{0,3}>\s+\S/m.test(normalized)
    || /^\s{0,3}(?:[-*+])\s+\S/m.test(normalized)
    || /^\s{0,3}\d+\.\s+\S/m.test(normalized)
    || /^\s{0,3}[-*_]{3,}\s*$/m.test(normalized)
    || /^\s{0,3}[-*]\s+\[[ xX]\]\s+\S/m.test(normalized)
    || /```[\s\S]*```/.test(normalized)
    || containsMarkdownTable(normalized)
  );
}

/**
 * 推断一条 message 在回放时应按纯文本还是 markdown 恢复。
 */
export function resolveBuiltinAgentdownMessageKind(content: unknown): BuiltinAgentdownRenderMessageKind {
  if (isRecord(content)) {
    const explicitKind = readString(content.kind);

    if (explicitKind === 'markdown' || explicitKind === 'text') {
      return explicitKind;
    }
  }

  return looksLikeMarkdownMessage(resolveBuiltinAgentdownMessageText(content)) ? 'markdown' : 'text';
}

/**
 * 读取一条回放里最后一条用户消息文本。
 */
export function resolveBuiltinAgentdownLastUserMessage(
  records: readonly AgentdownRenderRecord[]
): string {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];

    if (!record || record.event !== 'message' || record.role !== 'user') {
      continue;
    }

    return resolveBuiltinAgentdownMessageText(record.content);
  }

  return '';
}

/**
 * 生成当前记录对应的 block id。
 */
function nextBlockId(state: RestoreState, event: BuiltinAgentdownRenderRecord['event']) {
  const blockId = `block:render:${state.conversationId}:${event}:${state.blockIndex}`;
  state.blockIndex += 1;
  return blockId;
}

/**
 * 生成当前记录对应的 tool id。
 */
function nextToolId(state: RestoreState) {
  const toolId = `tool:render:${state.conversationId}:${state.toolIndex}`;
  state.toolIndex += 1;
  return toolId;
}

/**
 * 为当前记录补齐 conversation/turn/message/group 作用域。
 */
function resolveScope(state: RestoreState, role: BuiltinAgentdownRenderRole): RestoreScope {
  if (role === 'user') {
    state.turnIndex += 1;
    state.currentTurnId = `turn:render:${state.conversationId}:${state.turnIndex}`;
    state.currentAssistantMessageId = `message:render:${state.conversationId}:${state.turnIndex}:assistant`;

    const messageId = `message:render:${state.conversationId}:${state.turnIndex}:user`;
    return {
      conversationId: state.conversationId,
      turnId: state.currentTurnId,
      messageId,
      groupId: messageId
    };
  }

  if (role === 'system') {
    state.systemIndex += 1;
    const messageId = `message:render:${state.conversationId}:system:${state.systemIndex}`;
    return {
      conversationId: state.conversationId,
      messageId,
      groupId: messageId
    };
  }

  if (!state.currentTurnId) {
    state.turnIndex += 1;
    state.currentTurnId = `turn:render:${state.conversationId}:${state.turnIndex}`;
  }

  if (!state.currentAssistantMessageId) {
    state.currentAssistantMessageId = `message:render:${state.conversationId}:${state.turnIndex}:assistant`;
  }

  return {
    conversationId: state.conversationId,
    turnId: state.currentTurnId,
    messageId: state.currentAssistantMessageId,
    groupId: state.currentAssistantMessageId
  };
}

/**
 * 归一化 thought 内容。
 */
function normalizeThoughtContent(content: Extract<BuiltinAgentdownRenderRecord, { event: 'thought' }>['content']) {
  if (typeof content === 'string') {
    return {
      text: content
    };
  }

  return {
    text: resolveBuiltinAgentdownMessageText(content),
    ...(readString(content.title) ? { title: content.title } : {}),
    ...(readString(content.status) ? { status: content.status as BuiltinAgentdownRenderThoughtContent['status'] } : {}),
    ...(readString(content.durationText) ? { durationText: content.durationText } : {}),
    ...(typeof content.durationMs === 'number' ? { durationMs: content.durationMs } : {})
  };
}

/**
 * 把 thought 文本切成最小段落 block。
 */
function createThoughtBlocks(id: string, text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (paragraphs.length === 0) {
    return [];
  }

  return paragraphs.map((paragraph, index) => ({
    id: `${id}:paragraph:${index}`,
    kind: 'text' as const,
    tag: 'p' as const,
    text: paragraph
  }));
}

/**
 * 统一读取 tool 内容对象。
 */
function resolveToolPayload(content: Extract<BuiltinAgentdownRenderRecord, { event: 'tool' }>['content']) {
  const source = isRecord(content) ? content : {};
  const tool = isRecord(source.tool) ? source.tool : source;

  const id = readString(source.id)
    ?? readString(tool.id)
    ?? readString(tool.tool_call_id)
    ?? readString(tool.toolId);
  const name = readString(source.name)
    ?? readString(tool.name)
    ?? readString(tool.tool_name);
  const title = readString(source.title)
    ?? readString(tool.title)
    ?? name
    ?? '工具调用';
  const args = source.args
    ?? tool.args
    ?? source.tool_args
    ?? tool.tool_args;
  const result = source.result ?? tool.result;
  const explicitStatus = readString(source.status) ?? readString(tool.status);
  const message = readString(source.message)
    ?? readString(tool.message)
    ?? readString(source.error)
    ?? readString(tool.error)
    ?? readString(source.tool_call_error)
    ?? readString(tool.tool_call_error);
  const iconPath = readString(source.iconPath) ?? readString(tool.iconPath);
  const status = (
    explicitStatus
    ?? (
      message && (readString(source.error) || readString(tool.error) || readString(source.tool_call_error) || readString(tool.tool_call_error))
        ? 'failed'
        : result !== undefined
          ? 'completed'
          : 'pending'
    )
  ) as BuiltinAgentdownRenderToolStatus;

  return {
    id,
    name,
    title,
    args,
    result,
    message,
    iconPath,
    status
  };
}

/**
 * 统一读取 approval 内容对象。
 */
function resolveApprovalPayload(content: Extract<BuiltinAgentdownRenderRecord, { event: 'approval' }>['content']) {
  const source = isRecord(content) ? content : {};
  const nested = (
    (isRecord(source.approval) && source.approval)
    || (isRecord(source.requirement) && source.requirement)
    || (isRecord(source.interrupt) && source.interrupt)
    || source
  );
  const tool = isRecord(nested.tool_execution) ? nested.tool_execution : nested;
  const explicitStatus = readString(source.status) ?? readString(nested.status);
  const confirmed = readBoolean(source.confirmed) ?? readBoolean(nested.confirmed);
  const status = (
    explicitStatus
    ?? (
      confirmed === true
        ? 'approved'
        : confirmed === false
          ? 'rejected'
          : 'pending'
    )
  ) as BuiltinAgentdownRenderApprovalStatus;
  const title = readString(source.title)
    ?? readString(nested.title)
    ?? (
      readString(tool.tool_name) || readString(tool.name)
        ? `工具调用确认：${readString(tool.tool_name) ?? readString(tool.name)}`
        : '工具调用确认'
    );

  return {
    id: readString(source.id)
      ?? readString(nested.id)
      ?? readString(source.approvalId)
      ?? readString(nested.approvalId)
      ?? readString(tool.tool_call_id),
    title,
    status,
    message: readString(source.message) ?? readString(nested.message) ?? readString(source.confirmation_note) ?? readString(nested.confirmation_note),
    refId: readString(source.refId) ?? readString(nested.refId)
  };
}

/**
 * 统一读取 handoff 内容对象。
 */
function resolveHandoffPayload(content: Extract<BuiltinAgentdownRenderRecord, { event: 'handoff' }>['content']) {
  const source = isRecord(content) ? content : {};

  return {
    id: readString(source.id) ?? readString(source.handoffId),
    title: readString(source.title) ?? '任务交接',
    status: (readString(source.status) ?? 'pending') as BuiltinAgentdownRenderHandoffStatus,
    targetType: (readString(source.targetType) ?? undefined) as BuiltinAgentdownRenderHandoffContent['targetType'],
    assignee: readString(source.assignee),
    message: readString(source.message),
    refId: readString(source.refId)
  };
}

/**
 * 统一读取 branch 内容对象。
 */
function resolveBranchPayload(content: Extract<BuiltinAgentdownRenderRecord, { event: 'branch' }>['content']) {
  const source = isRecord(content) ? content : {};

  return {
    id: readString(source.id) ?? readString(source.branchId),
    title: readString(source.title) ?? '分支执行',
    status: readString(source.status),
    label: readString(source.label),
    message: readString(source.message),
    sourceRunId: readString(source.sourceRunId),
    targetRunId: readString(source.targetRunId),
    refId: readString(source.refId)
  };
}

/**
 * 统一读取 artifact 内容对象。
 */
function resolveArtifactPayload(content: Extract<BuiltinAgentdownRenderRecord, { event: 'artifact' }>['content']) {
  const source = isRecord(content) ? content : {};

  return {
    id: readString(source.id) ?? readString(source.artifactId),
    title: readString(source.title) ?? '产物',
    artifactKind: (readString(source.artifactKind) ?? 'report') as BuiltinAgentdownRenderArtifactKind,
    label: readString(source.label),
    href: readString(source.href),
    message: readString(source.message),
    refId: readString(source.refId)
  };
}

/**
 * 统一读取 attachment 内容对象。
 */
function resolveAttachmentPayload(content: Extract<BuiltinAgentdownRenderRecord, { event: 'attachment' }>['content']) {
  const source = isRecord(content) ? content : {};

  return {
    id: readString(source.id) ?? readString(source.attachmentId),
    title: readString(source.title) ?? '附件',
    attachmentKind: (readString(source.attachmentKind) ?? 'file') as BuiltinAgentdownRenderAttachmentKind,
    label: readString(source.label),
    href: readString(source.href),
    mimeType: readString(source.mimeType),
    sizeText: readString(source.sizeText),
    previewSrc: readString(source.previewSrc),
    status: readString(source.status),
    message: readString(source.message),
    refId: readString(source.refId)
  };
}

/**
 * 统一读取 error 内容对象。
 */
function resolveErrorPayload(content: Extract<BuiltinAgentdownRenderRecord, { event: 'error' }>['content']) {
  if (typeof content === 'string') {
    return {
      message: content
    };
  }

  const source = isRecord(content) ? content : {};

  return {
    title: readString(source.title),
    message: readString(source.message) ?? readString(source.error),
    code: readString(source.code),
    refId: readString(source.refId)
  };
}

/**
 * 恢复一条普通消息记录。
 */
function restoreMessageRecord(
  record: Extract<BuiltinAgentdownRenderRecord, { event: 'message' }>,
  state: RestoreState
): RuntimeCommand {
  const scope = resolveScope(state, record.role);
  const blockId = nextBlockId(state, record.event);
  const text = resolveBuiltinAgentdownMessageText(record.content);
  const kind = resolveBuiltinAgentdownMessageKind(record.content);

  if (kind === 'markdown') {
    return cmd.message.insert({
      id: blockId,
      role: record.role,
      type: 'markdown',
      renderer: 'markdown',
      content: text,
      data: {
        streamingDraftMode: 'preview'
      },
      ...scope,
      at: record.created_at
    });
  }

  return cmd.message.text({
    id: blockId,
    role: record.role,
    text,
    ...scope,
    at: record.created_at
  });
}

/**
 * 恢复一条 thought 记录。
 */
function restoreThoughtRecord(
  record: Extract<BuiltinAgentdownRenderRecord, { event: 'thought' }>,
  state: RestoreState
): RuntimeCommand {
  const scope = resolveScope(state, 'assistant');
  const blockId = nextBlockId(state, record.event);
  const content = normalizeThoughtContent(record.content);

  return cmd.message.insert({
    id: blockId,
    role: 'assistant',
    type: 'thought',
    renderer: 'thought',
    data: {
      id: blockId,
      kind: 'thought',
      title: content.title ?? '已思考',
      ...(content.status ? { status: content.status } : {}),
      ...(content.durationText ? { durationText: content.durationText } : {}),
      ...(content.durationMs !== undefined ? { durationMs: content.durationMs } : {}),
      blocks: createThoughtBlocks(blockId, content.text)
    },
    ...scope,
    at: record.created_at
  });
}

/**
 * 恢复一条 tool 记录。
 */
function restoreToolRecord(
  record: Extract<BuiltinAgentdownRenderRecord, { event: 'tool' }>,
  state: RestoreState
): RuntimeCommand[] {
  const scope = resolveScope(state, 'assistant');
  const payload = resolveToolPayload(record.content);
  const toolId = payload.id ?? nextToolId(state);
  const commands: RuntimeCommand[] = [];

  commands.push(...cmd.tool.start({
    id: toolId,
    title: payload.title,
    status: PENDING_TOOL_STATUSES.has(payload.status) ? payload.status : 'running',
    data: {
      ...(payload.args !== undefined ? { args: payload.args } : {}),
      ...(payload.name ? { toolName: payload.name } : {})
    },
    blockData: {
      ...(payload.iconPath ? { iconPath: payload.iconPath } : {})
    },
    ...(payload.message ? { message: payload.message } : {}),
    ...scope,
    at: record.created_at
  }));

  if (PENDING_TOOL_STATUSES.has(payload.status)) {
    return commands;
  }

  commands.push(...cmd.tool.finish({
    id: toolId,
    title: payload.title,
    status: payload.status,
    result: payload.result,
    data: {
      ...(payload.args !== undefined ? { args: payload.args } : {}),
      ...(payload.name ? { toolName: payload.name } : {})
    },
    blockData: {
      ...(payload.iconPath ? { iconPath: payload.iconPath } : {})
    },
    ...(payload.message ? { message: payload.message } : {}),
    ...scope,
    at: record.created_at
  }));

  return commands;
}

/**
 * 恢复一条 approval 记录。
 */
function restoreApprovalRecord(
  record: Extract<BuiltinAgentdownRenderRecord, { event: 'approval' }>,
  state: RestoreState
): RuntimeCommand {
  const scope = resolveScope(state, 'assistant');
  const blockId = nextBlockId(state, record.event);
  const payload = resolveApprovalPayload(record.content);

  return cmd.message.insert({
    id: blockId,
    role: 'assistant',
    type: 'approval',
    renderer: 'approval',
    data: {
      id: blockId,
      kind: 'approval',
      title: payload.title,
      ...(payload.id ? { approvalId: payload.id } : {}),
      ...(payload.status ? { status: payload.status } : {}),
      ...(payload.message ? { message: payload.message } : {}),
      ...(payload.refId ? { refId: payload.refId } : {})
    },
    ...scope,
    at: record.created_at
  });
}

/**
 * 恢复一条 handoff 记录。
 */
function restoreHandoffRecord(
  record: Extract<BuiltinAgentdownRenderRecord, { event: 'handoff' }>,
  state: RestoreState
): RuntimeCommand {
  const scope = resolveScope(state, 'assistant');
  const blockId = nextBlockId(state, record.event);
  const payload = resolveHandoffPayload(record.content);

  return cmd.message.handoff({
    id: blockId,
    role: 'assistant',
    title: payload.title,
    ...(payload.id ? { handoffId: payload.id } : {}),
    ...(payload.status ? { status: payload.status } : {}),
    ...(payload.targetType ? { targetType: payload.targetType } : {}),
    ...(payload.assignee ? { assignee: payload.assignee } : {}),
    ...(payload.message ? { message: payload.message } : {}),
    ...(payload.refId ? { refId: payload.refId } : {}),
    ...scope,
    at: record.created_at
  });
}

/**
 * 恢复一条 branch 记录。
 */
function restoreBranchRecord(
  record: Extract<BuiltinAgentdownRenderRecord, { event: 'branch' }>,
  state: RestoreState
): RuntimeCommand {
  const scope = resolveScope(state, 'assistant');
  const blockId = nextBlockId(state, record.event);
  const payload = resolveBranchPayload(record.content);

  return cmd.message.branch({
    id: blockId,
    role: 'assistant',
    title: payload.title,
    ...(payload.id ? { branchId: payload.id } : {}),
    ...(payload.status ? { status: payload.status } : {}),
    ...(payload.label ? { label: payload.label } : {}),
    ...(payload.message ? { message: payload.message } : {}),
    ...(payload.sourceRunId ? { sourceRunId: payload.sourceRunId } : {}),
    ...(payload.targetRunId ? { targetRunId: payload.targetRunId } : {}),
    ...(payload.refId ? { refId: payload.refId } : {}),
    ...scope,
    at: record.created_at
  });
}

/**
 * 恢复一条 artifact 记录。
 */
function restoreArtifactRecord(
  record: Extract<BuiltinAgentdownRenderRecord, { event: 'artifact' }>,
  state: RestoreState
): RuntimeCommand {
  const scope = resolveScope(state, 'assistant');
  const blockId = nextBlockId(state, record.event);
  const payload = resolveArtifactPayload(record.content);

  return cmd.message.artifact({
    id: blockId,
    role: 'assistant',
    title: payload.title,
    artifactKind: payload.artifactKind,
    ...(payload.id ? { artifactId: payload.id } : {}),
    ...(payload.label ? { label: payload.label } : {}),
    ...(payload.href ? { href: payload.href } : {}),
    ...(payload.message ? { message: payload.message } : {}),
    ...(payload.refId ? { refId: payload.refId } : {}),
    ...scope,
    at: record.created_at
  });
}

/**
 * 恢复一条 attachment 记录。
 */
function restoreAttachmentRecord(
  record: Extract<BuiltinAgentdownRenderRecord, { event: 'attachment' }>,
  state: RestoreState
): RuntimeCommand {
  const scope = resolveScope(state, record.role);
  const blockId = nextBlockId(state, record.event);
  const payload = resolveAttachmentPayload(record.content);

  return cmd.message.attachment({
    id: blockId,
    role: record.role,
    title: payload.title,
    attachmentKind: payload.attachmentKind,
    ...(payload.id ? { attachmentId: payload.id } : {}),
    ...(payload.label ? { label: payload.label } : {}),
    ...(payload.href ? { href: payload.href } : {}),
    ...(payload.mimeType ? { mimeType: payload.mimeType } : {}),
    ...(payload.sizeText ? { sizeText: payload.sizeText } : {}),
    ...(payload.previewSrc ? { previewSrc: payload.previewSrc } : {}),
    ...(payload.status ? { status: payload.status } : {}),
    ...(payload.message ? { message: payload.message } : {}),
    ...(payload.refId ? { refId: payload.refId } : {}),
    ...scope,
    at: record.created_at
  });
}

/**
 * 恢复一条 error 记录。
 */
function restoreErrorRecord(
  record: Extract<BuiltinAgentdownRenderRecord, { event: 'error' }>,
  state: RestoreState
): RuntimeCommand {
  const scope = resolveScope(state, record.role);
  const blockId = nextBlockId(state, record.event);
  const payload = resolveErrorPayload(record.content);

  return cmd.message.error({
    id: blockId,
    role: record.role,
    title: payload.title ?? '后端暂时不可用，请稍后重试。',
    message: payload.message ?? '后端暂时不可用，请稍后重试。',
    ...(payload.code ? { code: payload.code } : {}),
    ...(payload.refId ? { refId: payload.refId } : {}),
    ...scope,
    at: record.created_at
  });
}

/**
 * 恢复单条 records。
 */
function restoreBuiltinRecord(record: BuiltinAgentdownRenderRecord, state: RestoreState): RuntimeCommand[] {
  switch (record.event) {
    case 'message':
      return [restoreMessageRecord(record, state)];
    case 'thought':
      return [restoreThoughtRecord(record, state)];
    case 'tool':
      return restoreToolRecord(record, state);
    case 'approval':
      return [restoreApprovalRecord(record, state)];
    case 'handoff':
      return [restoreHandoffRecord(record, state)];
    case 'branch':
      return [restoreBranchRecord(record, state)];
    case 'artifact':
      return [restoreArtifactRecord(record, state)];
    case 'attachment':
      return [restoreAttachmentRecord(record, state)];
    case 'error':
      return [restoreErrorRecord(record, state)];
    default:
      return [];
  }
}

/**
 * Agentdown 内置的默认 records adapter。
 *
 * 如果后端直接返回推荐的 `event / role / content / created_at` 结构，
 * 前端可以不再额外实现 restoreRecords，直接复用这份 adapter。
 */
export function createDefaultAgentdownRecordsAdapter(
  options: CreateDefaultAgentdownRecordsAdapterOptions = {}
): BuiltinAgentdownRecordsAdapter {
  return defineAgentdownRecordsAdapter<BuiltinAgentdownRenderRecord>({
    restoreRecords(records) {
      const firstRecord = records[0];
      const state: RestoreState = {
        conversationId: options.conversationId
          ?? (
            firstRecord
              ? `conversation:render:${firstRecord.created_at}`
              : 'conversation:render:empty'
          ),
        turnIndex: 0,
        systemIndex: 0,
        blockIndex: 0,
        toolIndex: 0,
        currentTurnId: null,
        currentAssistantMessageId: null
      };

      return records.flatMap((record) => restoreBuiltinRecord(record, state));
    }
  });
}

/**
 * Agentdown 内置的默认 records adapter 实例。
 */
export const defaultAgentdownRecordsAdapter = createDefaultAgentdownRecordsAdapter();
