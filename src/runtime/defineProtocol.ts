import type {
  BlockInsertCommand,
  BlockPatchCommand,
  BlockUpsertCommand,
  EventRecordCommand,
  NodePatchCommand,
  NodeRemoveCommand,
  NodeUpsertCommand,
  ProtocolContext,
  ProtocolRule,
  RuntimeCommand,
  RuntimeChatSemantics,
  RuntimeData,
  RuntimeProtocol,
  SurfaceBlockState,
  StreamAbortCommand,
  StreamCloseCommand,
  StreamDeltaCommand,
  StreamOpenCommand
} from './types';
import { compactObject, toArray } from './utils';

/**
 * 从原始事件类型中提取某个事件键对应的字符串字面量联合。
 */
type EventValueOf<TRawEvent, TEventKey extends keyof TRawEvent> = Extract<TRawEvent[TEventKey], string>;

/**
 * 基于事件名分发时的 handler 映射表。
 */
type EventProtocolHandlers<
  TRawEvent extends Record<TEventKey, string>,
  TEventKey extends keyof TRawEvent
> = Partial<{
  [TEventName in EventValueOf<TRawEvent, TEventKey>]: (
    event: Extract<TRawEvent, Record<TEventKey, TEventName>>,
    context: ProtocolContext
  ) => RuntimeCommand | RuntimeCommand[] | null | void;
}>;

/**
 * `cmd.run.start()` 所需的输入结构。
 */
export interface RunStartInput {
  id: string;
  title?: string;
  message?: string;
  parentId?: string | null;
  data?: RuntimeData;
  at?: number;
  type?: string;
  status?: string;
}

/**
 * `cmd.run.finish()` 所需的输入结构。
 */
export interface RunFinishInput {
  id: string;
  title?: string;
  message?: string;
  data?: RuntimeData;
  at?: number;
  status?: string;
}

/**
 * 打开一段流式内容所需的输入结构。
 */
export interface ContentOpenInput extends Omit<StreamOpenCommand, 'type' | 'assembler'> {
  assembler?: string;
}

/**
 * 写入消息 block 时可复用的聊天语义输入。
 */
interface MessageSemanticInput extends RuntimeChatSemantics {
  groupId?: string | null;
}

/**
 * 创建一个工具节点和工具 block 时的输入结构。
 */
export interface ToolStartInput extends MessageSemanticInput {
  id: string;
  title: string;
  parentId?: string | null;
  message?: string;
  slot?: string;
  renderer?: string;
  blockId?: string;
  data?: RuntimeData;
  nodeData?: RuntimeData;
  blockData?: RuntimeData;
  at?: number;
  status?: string;
}

/**
 * 更新一个工具节点和工具 block 时的输入结构。
 */
export interface ToolUpdateInput extends MessageSemanticInput {
  id: string;
  title?: string;
  message?: string;
  blockId?: string;
  renderer?: string;
  data?: RuntimeData;
  nodeData?: RuntimeData;
  blockData?: RuntimeData;
  at?: number;
  status?: string;
  result?: unknown;
}

/**
 * message block 支持的角色类型。
 */
type MessageRole = 'assistant' | 'user' | 'system';

/**
 * 通用消息 block 的输入结构。
 */
export interface MessageBlockInput extends MessageSemanticInput {
  id: string;
  role?: MessageRole;
  slot?: string;
  type?: string;
  renderer?: string;
  state?: SurfaceBlockState;
  nodeId?: string | null;
  content?: string;
  data?: RuntimeData;
  at?: number;
}

/**
 * 纯文本消息的快捷输入结构。
 */
export interface MessageTextInput extends Omit<MessageBlockInput, 'type' | 'renderer' | 'content'> {
  text: string;
}

/**
 * artifact 消息的快捷输入结构。
 */
export interface MessageArtifactInput extends Omit<MessageBlockInput, 'type' | 'renderer' | 'content'> {
  title: string;
  artifactKind: string;
  artifactId?: string;
  label?: string;
  href?: string;
  message?: string;
  refId?: string;
}

/**
 * attachment 消息的快捷输入结构。
 */
export interface MessageAttachmentInput extends Omit<MessageBlockInput, 'type' | 'renderer' | 'content'> {
  title: string;
  attachmentKind: string;
  attachmentId?: string;
  label?: string;
  href?: string;
  message?: string;
  refId?: string;
  mimeType?: string;
  sizeText?: string;
  previewSrc?: string;
  status?: string;
}

/**
 * error 消息的快捷输入结构。
 */
export interface MessageErrorInput extends Omit<MessageBlockInput, 'type' | 'renderer' | 'content'> {
  title?: string;
  message: string;
  code?: string;
  refId?: string;
}

/**
 * 内容替换支持的目标内容类型。
 */
export type ContentKind = 'text' | 'markdown';

/**
 * draft block 在界面中的推荐展示模式。
 */
export type DraftMode = 'text' | 'preview' | 'hidden';

/**
 * 使用完整内容替换当前消息时的输入结构。
 */
export interface ContentReplaceInput extends Omit<MessageBlockInput, 'type' | 'renderer' | 'content'> {
  content: string;
  kind?: ContentKind;
  mode?: DraftMode;
}

/**
 * 更新审批 block 时的输入结构。
 */
export interface ApprovalUpdateInput extends Omit<MessageBlockInput, 'type' | 'renderer' | 'content'> {
  title: string;
  approvalId?: string;
  status?: string;
  message?: string;
  refId?: string;
}

/**
 * 更新 branch block 时的输入结构。
 */
export interface BranchUpdateInput extends Omit<MessageBlockInput, 'type' | 'renderer' | 'content'> {
  title: string;
  branchId?: string;
  sourceRunId?: string;
  targetRunId?: string;
  status?: string;
  label?: string;
  message?: string;
  refId?: string;
}

/**
 * 更新 handoff block 时的输入结构。
 */
export interface HandoffUpdateInput extends Omit<MessageBlockInput, 'type' | 'renderer' | 'content'> {
  title: string;
  handoffId?: string;
  status?: string;
  targetType?: string;
  assignee?: string;
  message?: string;
  refId?: string;
}

/**
 * 标记节点错误状态时的输入结构。
 */
export interface NodeErrorInput {
  id: string;
  title?: string;
  message: string;
  type?: string;
  status?: string;
  code?: string;
  data?: RuntimeData;
  at?: number;
}

/**
 * 向已打开流追加文本时的输入结构。
 */
export interface ContentAppendInput {
  streamId: string;
  text: string;
}

/**
 * 关闭流时的输入结构。
 */
export interface ContentCloseInput {
  streamId: string;
}

/**
 * 中止流时的输入结构。
 */
export interface ContentAbortInput extends ContentCloseInput {
  reason?: string;
}

/**
 * Helper protocol 使用的语义事件名。
 * 这一层仍然是可选 helper，不会进入 core command 协议本身。
 */
export type HelperProtocolSemanticEvent =
  | 'run.start'
  | 'run.finish'
  | 'content.open'
  | 'content.append'
  | 'content.replace'
  | 'content.close'
  | 'content.abort'
  | 'tool.start'
  | 'tool.update'
  | 'tool.finish'
  | 'artifact.upsert'
  | 'error.upsert'
  | 'approval.update'
  | 'attachment.upsert'
  | 'branch.upsert'
  | 'handoff.upsert'
  | 'node.error'
  | 'event.record';

/**
 * helper 语义事件到具体输入结构的映射。
 */
type HelperProtocolInputByEvent = {
  'run.start': RunStartInput;
  'run.finish': RunFinishInput;
  'content.open': ContentOpenInput;
  'content.append': ContentAppendInput;
  'content.replace': ContentReplaceInput;
  'content.close': ContentCloseInput;
  'content.abort': ContentAbortInput;
  'tool.start': ToolStartInput;
  'tool.update': ToolUpdateInput;
  'tool.finish': ToolUpdateInput;
  'artifact.upsert': MessageArtifactInput;
  'error.upsert': MessageErrorInput;
  'approval.update': ApprovalUpdateInput;
  'attachment.upsert': MessageAttachmentInput;
  'branch.upsert': BranchUpdateInput;
  'handoff.upsert': HandoffUpdateInput;
  'node.error': NodeErrorInput;
  'event.record': RuntimeData;
};

/**
 * 单条 helper binding 的定义结构。
 */
export interface HelperProtocolBinding<TRawEvent, TInput> {
  on?: string | string[];
  match?: (event: TRawEvent, context: ProtocolContext) => boolean;
  resolve: (event: TRawEvent, context: ProtocolContext) => TInput | TInput[] | null | void;
}

/**
 * helper 语义事件到 binding 列表的映射。
 */
export type HelperProtocolBindings<TRawEvent> = Partial<{
  [TEventName in HelperProtocolSemanticEvent]:
    | HelperProtocolBinding<TRawEvent, HelperProtocolInputByEvent[TEventName]>
    | Array<HelperProtocolBinding<TRawEvent, HelperProtocolInputByEvent[TEventName]>>;
}>;

/**
 * helper protocol 支持的默认输入值集合。
 */
export type HelperProtocolDefaults = Partial<{
  [TEventName in Exclude<HelperProtocolSemanticEvent, 'content.append' | 'content.close' | 'content.abort' | 'event.record'>]:
    Partial<HelperProtocolInputByEvent[TEventName]>;
}> & Partial<{
  'content.append': Partial<ContentAppendInput>;
  'content.close': Partial<ContentCloseInput>;
  'content.abort': Partial<ContentAbortInput>;
  'event.record': RuntimeData;
}>;

/**
 * 创建 helper protocol 时的配置项。
 */
export interface HelperProtocolOptions<
  TRawEvent,
  TEventKey extends string = 'event'
> {
  eventKey?: TEventKey;
  defaults?: HelperProtocolDefaults;
  bindings: HelperProtocolBindings<TRawEvent>;
}

/**
 * 覆盖 helper protocol 配置时可传入的局部选项。
 */
export interface HelperProtocolOverrides<
  TRawEvent,
  TEventKey extends string = 'event'
> {
  eventKey?: TEventKey;
  defaults?: HelperProtocolDefaults;
  bindings?: HelperProtocolBindings<TRawEvent>;
}

/**
 * helper protocol 工厂接口。
 */
export interface HelperProtocolFactory<
  TRawEvent,
  TEventKey extends string = 'event'
> {
  readonly config: HelperProtocolOptions<TRawEvent, TEventKey>;
  createProtocol(overrides?: HelperProtocolOverrides<TRawEvent, TEventKey>): RuntimeProtocol<TRawEvent>;
}

/**
 * 合并多份 runtime data。
 */
function mergeData(...records: Array<RuntimeData | undefined>): RuntimeData {
  const merged: RuntimeData = {};

  for (const record of records) {
    if (!record) {
      continue;
    }

    Object.assign(merged, record);
  }

  return merged;
}

/**
 * 生成工具 block 的默认 blockId。
 */
function toolBlockId(id: string, blockId?: string): string {
  return blockId ?? `block:${id}`;
}

/**
 * 提取一组消息 block 需要写入的聊天语义字段。
 */
function resolveMessageSemantics(input: MessageSemanticInput) {
  return compactObject({
    ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
    ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
    ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
    ...(input.messageId !== undefined ? { messageId: input.messageId } : {})
  });
}

/**
 * 统一推导消息 block 的 type、renderer 和 role。
 */
function resolveMessageBlockShape(input: MessageBlockInput) {
  const type = input.type ?? input.renderer ?? 'text';
  const renderer = input.renderer ?? input.type ?? 'text';
  const role = input.role ?? 'assistant';

  return {
    type,
    renderer,
    role
  };
}

/**
 * 生成一条消息 block insert 命令。
 */
function createMessageInsertCommand(
  input: MessageBlockInput,
  options: Omit<BlockInsertCommand, 'type' | 'block'> = {}
): BlockInsertCommand {
  const shape = resolveMessageBlockShape(input);

  return cmd.block.insert(
    {
      id: input.id,
      slot: input.slot ?? 'main',
      type: shape.type,
      renderer: shape.renderer,
      state: input.state ?? 'stable',
      data: mergeData(
        {
          role: shape.role
        },
        input.data
      ),
      ...resolveMessageSemantics(input),
      ...(input.nodeId !== undefined ? { nodeId: input.nodeId } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.at !== undefined ? { createdAt: input.at, updatedAt: input.at } : {})
    },
    options
  );
}

/**
 * 生成一条消息 block upsert 命令。
 */
function createMessageUpsertCommand(input: MessageBlockInput) {
  const shape = resolveMessageBlockShape(input);

  return cmd.block.upsert({
    id: input.id,
    slot: input.slot ?? 'main',
    type: shape.type,
    renderer: shape.renderer,
    state: input.state ?? 'stable',
    data: mergeData(
      {
        role: shape.role
      },
      input.data
    ),
    ...resolveMessageSemantics(input),
    ...(input.nodeId !== undefined ? { nodeId: input.nodeId } : {}),
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(input.at !== undefined ? { createdAt: input.at, updatedAt: input.at } : {})
  });
}

/**
 * 生成一条消息 block patch 命令。
 */
function createMessagePatchCommand(input: MessageBlockInput): BlockPatchCommand {
  const shape = resolveMessageBlockShape(input);

  return cmd.block.patch(input.id, {
    slot: input.slot ?? 'main',
    type: shape.type,
    renderer: shape.renderer,
    state: input.state ?? 'stable',
    data: mergeData(
      {
        role: shape.role
      },
      input.data
    ),
    ...resolveMessageSemantics(input),
    ...(input.nodeId !== undefined ? { nodeId: input.nodeId } : {}),
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(input.at !== undefined ? { updatedAt: input.at } : {})
  });
}

/**
 * 快速生成一条纯文本消息插入命令。
 */
function createMessageTextCommand(
  input: MessageTextInput,
  options: Omit<BlockInsertCommand, 'type' | 'block'> = {}
): BlockInsertCommand {
  return createMessageInsertCommand(
    {
      ...input,
      type: 'text',
      renderer: 'text',
      content: input.text
    },
    options
  );
}

/**
 * 生成 artifact block 默认 data。
 */
function createArtifactData(input: MessageArtifactInput): RuntimeData {
  return {
    kind: 'artifact',
    title: input.title,
    artifactKind: input.artifactKind,
    ...(input.artifactId ? { artifactId: input.artifactId } : {}),
    ...(input.label ? { label: input.label } : {}),
    ...(input.href ? { href: input.href } : {}),
    ...(input.message ? { message: input.message } : {}),
    ...(input.refId ? { refId: input.refId } : {})
  };
}

/**
 * 生成 error block 默认 data。
 */
function createErrorData(input: MessageErrorInput): RuntimeData {
  return {
    kind: 'error',
    title: input.title ?? '出错了',
    message: input.message,
    ...(input.code ? { code: input.code } : {}),
    ...(input.refId ? { refId: input.refId } : {})
  };
}

/**
 * 生成 attachment block 默认 data。
 */
function createAttachmentData(input: MessageAttachmentInput): RuntimeData {
  return {
    kind: 'attachment',
    title: input.title,
    attachmentKind: input.attachmentKind,
    ...(input.attachmentId ? { attachmentId: input.attachmentId } : {}),
    ...(input.label ? { label: input.label } : {}),
    ...(input.href ? { href: input.href } : {}),
    ...(input.message ? { message: input.message } : {}),
    ...(input.refId ? { refId: input.refId } : {}),
    ...(input.mimeType ? { mimeType: input.mimeType } : {}),
    ...(input.sizeText ? { sizeText: input.sizeText } : {}),
    ...(input.previewSrc ? { previewSrc: input.previewSrc } : {}),
    ...(input.status ? { status: input.status } : {})
  };
}

/**
 * 快速生成一条 artifact 消息插入命令。
 */
function createMessageArtifactCommand(
  input: MessageArtifactInput,
  options: Omit<BlockInsertCommand, 'type' | 'block'> = {}
): BlockInsertCommand {
  return createMessageInsertCommand(
    {
      ...input,
      type: 'artifact',
      renderer: 'artifact',
      data: mergeData(
        createArtifactData(input),
        input.data
      )
    },
    options
  );
}

/**
 * 快速生成一条 error 消息插入命令。
 */
function createMessageErrorCommand(
  input: MessageErrorInput,
  options: Omit<BlockInsertCommand, 'type' | 'block'> = {}
): BlockInsertCommand {
  return createMessageInsertCommand(
    {
      ...input,
      type: 'error',
      renderer: 'error',
      content: input.message,
      data: mergeData(
        createErrorData(input),
        input.data
      )
    },
    options
  );
}

/**
 * 快速生成一条 attachment 消息插入命令。
 */
function createMessageAttachmentCommand(
  input: MessageAttachmentInput,
  options: Omit<BlockInsertCommand, 'type' | 'block'> = {}
): BlockInsertCommand {
  return createMessageInsertCommand(
    {
      ...input,
      type: 'attachment',
      renderer: 'attachment',
      data: mergeData(
        createAttachmentData(input),
        input.data
      )
    },
    options
  );
}

/**
 * 生成 artifact 消息的 upsert patch 命令。
 */
function createArtifactUpsertCommand(input: MessageArtifactInput): BlockPatchCommand {
  return createMessagePatchCommand({
    ...input,
    type: 'artifact',
    renderer: 'artifact',
    state: input.state ?? 'stable',
    data: mergeData(
      createArtifactData(input),
      input.data
    )
  });
}

/**
 * 生成 error 消息的 upsert 命令。
 */
function createErrorUpsertCommand(input: MessageErrorInput): BlockUpsertCommand {
  return createMessageUpsertCommand({
    ...input,
    type: 'error',
    renderer: 'error',
    content: input.message,
    state: input.state ?? 'stable',
    data: mergeData(
      createErrorData(input),
      input.data
    )
  });
}

/**
 * 生成 attachment 消息的 upsert patch 命令。
 */
function createAttachmentUpsertCommand(input: MessageAttachmentInput): BlockPatchCommand {
  return createMessagePatchCommand({
    ...input,
    type: 'attachment',
    renderer: 'attachment',
    state: input.state ?? 'stable',
    data: mergeData(
      createAttachmentData(input),
      input.data
    )
  });
}

/**
 * 生成 approval block 默认 data。
 */
function createApprovalData(input: ApprovalUpdateInput): RuntimeData {
  return {
    kind: 'approval',
    title: input.title,
    ...(input.approvalId ? { approvalId: input.approvalId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.message ? { message: input.message } : {}),
    ...(input.refId ? { refId: input.refId } : {})
  };
}

/**
 * 生成 branch block 默认 data。
 */
function createBranchData(input: BranchUpdateInput): RuntimeData {
  return {
    kind: 'branch',
    title: input.title,
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.sourceRunId ? { sourceRunId: input.sourceRunId } : {}),
    ...(input.targetRunId ? { targetRunId: input.targetRunId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.label ? { label: input.label } : {}),
    ...(input.message ? { message: input.message } : {}),
    ...(input.refId ? { refId: input.refId } : {})
  };
}

/**
 * 生成 handoff block 默认 data。
 */
function createHandoffData(input: HandoffUpdateInput): RuntimeData {
  return {
    kind: 'handoff',
    title: input.title,
    ...(input.handoffId ? { handoffId: input.handoffId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.targetType ? { targetType: input.targetType } : {}),
    ...(input.assignee ? { assignee: input.assignee } : {}),
    ...(input.message ? { message: input.message } : {}),
    ...(input.refId ? { refId: input.refId } : {})
  };
}

/**
 * 生成 approval block 的更新命令。
 */
function createApprovalUpdateCommand(input: ApprovalUpdateInput): BlockPatchCommand {
  return createMessagePatchCommand({
    ...input,
    type: 'approval',
    renderer: 'approval',
    state: input.state ?? 'stable',
    data: mergeData(
      createApprovalData(input),
      input.data
    )
  });
}

/**
 * 生成 branch block 的更新命令。
 */
function createBranchUpsertCommand(input: BranchUpdateInput): BlockPatchCommand {
  return createMessagePatchCommand({
    ...input,
    type: 'branch',
    renderer: 'branch',
    state: input.state ?? 'stable',
    data: mergeData(
      createBranchData(input),
      input.data
    )
  });
}

/**
 * 生成 handoff block 的更新命令。
 */
function createHandoffUpsertCommand(input: HandoffUpdateInput): BlockPatchCommand {
  return createMessagePatchCommand({
    ...input,
    type: 'handoff',
    renderer: 'handoff',
    state: input.state ?? 'stable',
    data: mergeData(
      createHandoffData(input),
      input.data
    )
  });
}

/**
 * 生成内容整体替换命令，支持 text 和 markdown 两种模式。
 */
function createContentReplaceCommand(input: ContentReplaceInput): BlockPatchCommand {
  if ((input.kind ?? 'markdown') === 'text') {
    return createMessagePatchCommand({
      ...input,
      type: 'text',
      renderer: 'text',
      state: input.state ?? 'stable',
      content: input.content
    });
  }

  return createMessagePatchCommand({
    ...input,
    type: 'markdown',
    renderer: 'markdown.draft',
    state: input.state ?? 'draft',
    content: input.content,
    data: mergeData(
      {
        streamingDraftMode: input.mode ?? 'preview'
      },
      input.data
    )
  });
}

/**
 * helper binding 允许用户写单个对象或数组，这里统一归一化成数组，方便后面顺序执行。
 */
function normalizeBindingList<TRawEvent, TInput>(
  bindings:
    | HelperProtocolBinding<TRawEvent, TInput>
    | Array<HelperProtocolBinding<TRawEvent, TInput>>
    | undefined
): Array<HelperProtocolBinding<TRawEvent, TInput>> {
  if (!bindings) {
    return [];
  }

  return Array.isArray(bindings) ? bindings : [bindings];
}

/**
 * 合并 factory 级默认值和局部 override。
 * 对象值走浅合并，这样调用方可以只覆盖其中一两个字段。
 */
function mergeHelperDefaults(
  base: HelperProtocolDefaults = {},
  override: HelperProtocolDefaults = {}
): HelperProtocolDefaults {
  const next: HelperProtocolDefaults = { ...base };
  const writableNext = next as Record<string, unknown>;

  for (const [key, value] of Object.entries(override) as Array<[HelperProtocolSemanticEvent, unknown]>) {
    if (value === undefined) {
      continue;
    }

    const previous = next[key];

    if (
      typeof previous === 'object'
      && previous !== null
      && !Array.isArray(previous)
      && typeof value === 'object'
      && value !== null
      && !Array.isArray(value)
    ) {
      writableNext[key] = {
        ...previous,
        ...value
      };
      continue;
    }

    writableNext[key] = value;
  }

  return next;
}

/**
 * 合并同一个语义事件下的 binding 列表。
 * base 在前，override 在后，便于局部扩展时继续追加规则。
 */
function mergeHelperBindings<TRawEvent>(
  base: HelperProtocolBindings<TRawEvent> = {},
  override: HelperProtocolBindings<TRawEvent> = {}
): HelperProtocolBindings<TRawEvent> {
  const next: HelperProtocolBindings<TRawEvent> = { ...base };
  const writableNext = next as Record<string, unknown>;
  const keys = new Set<HelperProtocolSemanticEvent>([
    ...(Object.keys(base) as HelperProtocolSemanticEvent[]),
    ...(Object.keys(override) as HelperProtocolSemanticEvent[])
  ]);

  for (const key of keys) {
    const baseBindings = normalizeBindingList(base[key] as never);
    const overrideBindings = normalizeBindingList(override[key] as never);

    if (baseBindings.length === 0 && overrideBindings.length === 0) {
      continue;
    }

    writableNext[key] = [...baseBindings, ...overrideBindings];
  }

  return next;
}

/**
 * 一个 binding 可以按事件名匹配，也可以再叠加更细的 match 逻辑。
 */
function matchesHelperBinding<TRawEvent>(
  event: TRawEvent,
  context: ProtocolContext,
  eventKey: string,
  binding: HelperProtocolBinding<TRawEvent, unknown>
): boolean {
  /**
   * 先按事件名做一层快速匹配。
   */
  const matchByEventName = (() => {
    if (!binding.on) {
      return true;
    }

    const eventName = (event as Record<string, unknown>)[eventKey];

    if (typeof eventName !== 'string') {
      return false;
    }

    const candidates = Array.isArray(binding.on) ? binding.on : [binding.on];
    return candidates.includes(eventName);
  })();

  if (!matchByEventName) {
    return false;
  }

  if (!binding.match) {
    return binding.on !== undefined;
  }

  return binding.match(event, context);
}

/**
 * 把 factory 默认值、局部默认值和当前 resolve 结果合成最终输入。
 * `at` 默认统一补当前时间，避免每个 helper resolve 都重复写 `context.now()`。
 */
function applyHelperDefaults<TInput extends object>(
  input: TInput,
  defaults: Partial<TInput> | RuntimeData | undefined,
  {
    atDefault,
    extraDefaults
  }: {
    atDefault?: number;
    extraDefaults?: Partial<TInput>;
  } = {}
): TInput {
  return compactObject({
    ...(extraDefaults ?? {}),
    ...(typeof defaults === 'object' && defaults !== null ? defaults : {}),
    ...input,
    ...(atDefault !== undefined && !Object.prototype.hasOwnProperty.call(input, 'at') ? { at: atDefault } : {})
  }) as TInput;
}

/**
 * helper protocol 最终仍然会落回底层 `cmd.*`。
 * 这里负责把语义 helper 输入分发成真正的 RuntimeCommand。
 */
function executeHelperCommand(
  semanticEvent: HelperProtocolSemanticEvent,
  input: HelperProtocolInputByEvent[HelperProtocolSemanticEvent],
  defaults: HelperProtocolDefaults,
  context: ProtocolContext
): RuntimeCommand | RuntimeCommand[] | null | void {
  switch (semanticEvent) {
    case 'run.start':
      return cmd.run.start(
        applyHelperDefaults(input as RunStartInput, defaults['run.start'], {
          atDefault: context.now()
        })
      );
    case 'run.finish':
      return cmd.run.finish(
        applyHelperDefaults(input as RunFinishInput, defaults['run.finish'], {
          atDefault: context.now()
        })
      );
    case 'content.open':
      return cmd.content.open(
        applyHelperDefaults(input as ContentOpenInput, defaults['content.open'])
      );
    case 'content.append':
      {
        const next = applyHelperDefaults(input as ContentAppendInput, defaults['content.append']);
        return cmd.content.append(next.streamId, next.text);
      }
    case 'content.replace':
      return cmd.content.replace(
        applyHelperDefaults(input as ContentReplaceInput, defaults['content.replace'], {
          atDefault: context.now(),
          extraDefaults: {
            kind: 'markdown'
          } as Partial<ContentReplaceInput>
        })
      );
    case 'content.close':
      {
        const next = applyHelperDefaults(input as ContentCloseInput, defaults['content.close']);
        return cmd.content.close(next.streamId);
      }
    case 'content.abort': {
      const next = applyHelperDefaults(input as ContentAbortInput, defaults['content.abort']);
      return cmd.content.abort(next.streamId, next.reason);
    }
    case 'tool.start':
      return cmd.tool.start(
        applyHelperDefaults(input as ToolStartInput, defaults['tool.start'], {
          atDefault: context.now()
        })
      );
    case 'tool.update':
      return cmd.tool.update(
        applyHelperDefaults(input as ToolUpdateInput, defaults['tool.update'], {
          atDefault: context.now()
        })
      );
    case 'tool.finish':
      return cmd.tool.finish(
        applyHelperDefaults(input as ToolUpdateInput, defaults['tool.finish'], {
          atDefault: context.now()
        })
      );
    case 'artifact.upsert':
      return cmd.artifact.upsert(
        applyHelperDefaults(input as MessageArtifactInput, defaults['artifact.upsert'], {
          atDefault: context.now()
        })
      );
    case 'error.upsert':
      return cmd.error.upsert(
        applyHelperDefaults(input as MessageErrorInput, defaults['error.upsert'], {
          atDefault: context.now()
        })
      );
    case 'approval.update':
      return cmd.approval.update(
        applyHelperDefaults(input as ApprovalUpdateInput, defaults['approval.update'], {
          atDefault: context.now()
        })
      );
    case 'attachment.upsert':
      return cmd.attachment.upsert(
        applyHelperDefaults(input as MessageAttachmentInput, defaults['attachment.upsert'], {
          atDefault: context.now()
        })
      );
    case 'branch.upsert':
      return cmd.branch.upsert(
        applyHelperDefaults(input as BranchUpdateInput, defaults['branch.upsert'], {
          atDefault: context.now()
        })
      );
    case 'handoff.upsert':
      return cmd.handoff.upsert(
        applyHelperDefaults(input as HandoffUpdateInput, defaults['handoff.upsert'], {
          atDefault: context.now()
        })
      );
    case 'node.error':
      return cmd.node.error(
        applyHelperDefaults(input as NodeErrorInput, defaults['node.error'], {
          atDefault: context.now()
        })
      );
    case 'event.record':
      return cmd.event.record(
        applyHelperDefaults(input as RuntimeData, defaults['event.record'])
      );
    default:
      return null;
  }
}

/**
 * 适合“项目里已经有一套稳定语义事件名”的场景。
 * 你只需要声明：
 * 1. 原始事件怎么命中某个 helper 语义
 * 2. 命中后如何提取 helper 输入
 */
export function defineHelperProtocol<
  TRawEvent extends Record<TEventKey, string>,
  TEventKey extends string = 'event'
>(
  options: HelperProtocolOptions<TRawEvent, TEventKey>
): RuntimeProtocol<TRawEvent> {
  const eventKey = options.eventKey ?? ('event' as TEventKey);
  const defaults = options.defaults ?? {};
  const bindings = options.bindings;
  const semanticEvents = Object.keys(bindings) as HelperProtocolSemanticEvent[];

  return {
    map({ packet, context }) {
      const commands: RuntimeCommand[] = [];

      for (const semanticEvent of semanticEvents) {
        const candidateBindings = normalizeBindingList(bindings[semanticEvent] as never);

        for (const binding of candidateBindings) {
          if (!matchesHelperBinding(packet, context, eventKey, binding)) {
            continue;
          }

          const resolvedInputs = toArray(binding.resolve(packet, context));

          for (const resolvedInput of resolvedInputs) {
            commands.push(...toArray(
              executeHelperCommand(
                semanticEvent,
                resolvedInput as HelperProtocolInputByEvent[typeof semanticEvent],
                defaults,
                context
              )
            ));
          }
        }
      }

      return commands;
    }
  };
}

/**
 * 在 defineHelperProtocol 之上再包一层工厂，方便：
 * - 全局定义一套事件规范
 * - 多个 preset / 页面共享
 * - 个别页面按需 override
 */
export function createHelperProtocolFactory<
  TRawEvent extends Record<TEventKey, string>,
  TEventKey extends string = 'event'
>(
  options: HelperProtocolOptions<TRawEvent, TEventKey>
): HelperProtocolFactory<TRawEvent, TEventKey> {
  return {
    config: options,
    createProtocol(overrides: HelperProtocolOverrides<TRawEvent, TEventKey> = {}) {
      return defineHelperProtocol({
        ...((overrides.eventKey ?? options.eventKey) !== undefined
          ? { eventKey: overrides.eventKey ?? options.eventKey }
          : {}),
        defaults: mergeHelperDefaults(options.defaults, overrides.defaults),
        bindings: mergeHelperBindings(options.bindings, overrides.bindings)
      });
    }
  };
}

/**
 * 最底层规则式 protocol。
 * 适合复杂协议或需要多个 rule 依次命中的场景。
 */
export function defineProtocol<TRawEvent>(rules: ProtocolRule<TRawEvent>[]): RuntimeProtocol<TRawEvent> {
  return {
    map({ packet, context }) {
      const commands: RuntimeCommand[] = [];

      for (const rule of rules) {
        if (!rule.match(packet, context)) {
          continue;
        }

        commands.push(...toArray(rule.map({ event: packet, context })));
      }

      return commands;
    }
  };
}

/**
 * 基于某个事件字段做分发的轻量 helper。
 * 适合最常见的 SSE / JSON event -> handler 映射。
 */
export function defineEventProtocol<TRawEvent extends { event: string }>(
  handlers: EventProtocolHandlers<TRawEvent, 'event'>
): RuntimeProtocol<TRawEvent>;
export function defineEventProtocol<
  TEventKey extends string,
  TRawEvent extends Record<TEventKey, string>
>(
  eventKey: TEventKey,
  handlers: EventProtocolHandlers<TRawEvent, TEventKey>
): RuntimeProtocol<TRawEvent>;
export function defineEventProtocol<
  TEventKey extends string,
  TRawEvent extends Record<TEventKey, string>
>(
  eventKeyOrHandlers: TEventKey | EventProtocolHandlers<TRawEvent, TEventKey>,
  maybeHandlers?: EventProtocolHandlers<TRawEvent, TEventKey>
): RuntimeProtocol<TRawEvent> {
  const resolvedEventKey = typeof eventKeyOrHandlers === 'string' ? eventKeyOrHandlers : 'event';
  const resolvedHandlers = (
    typeof eventKeyOrHandlers === 'string'
      ? maybeHandlers ?? {}
      : eventKeyOrHandlers
  ) as Record<
    string,
    ((event: TRawEvent, context: ProtocolContext) => RuntimeCommand | RuntimeCommand[] | null | void) | undefined
  >;

  return {
    map({ packet, context }) {
      const eventName = packet[resolvedEventKey as keyof TRawEvent];

      if (typeof eventName !== 'string') {
        return [];
      }

      const handler = resolvedHandlers[eventName];

      if (!handler) {
        return [];
      }

      return (handler as (
        event: TRawEvent,
        context: ProtocolContext
      ) => RuntimeCommand | RuntimeCommand[] | null | void)(
        packet,
        context
      );
    }
  };
}

/**
 * 给 defineProtocol 提供一个类型友好的 rule helper。
 * 适合配合类型守卫把复杂协议拆成多个小规则。
 */
export function when<TRawEvent, TMatchedEvent extends TRawEvent>(
  match: (event: TRawEvent, context: ProtocolContext) => event is TMatchedEvent,
  map: (input: {
    event: TMatchedEvent;
    context: ProtocolContext;
  }) => RuntimeCommand | RuntimeCommand[] | null | void,
  name?: string
): ProtocolRule<TRawEvent> {
  return {
    ...(name ? { name } : {}),
    match,
    map: ({ event, context }) =>
      map({
        event: event as TMatchedEvent,
        context
      })
  };
}

export const cmd = {
  run: {
    /** 创建或启动一个 run 节点。 */
    start(input: RunStartInput): NodeUpsertCommand {
      return cmd.node.upsert({
        id: input.id,
        type: input.type ?? 'run',
        status: input.status ?? 'running',
        data: mergeData(input.data),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.title ? { title: input.title } : {}),
        ...(input.message ? { message: input.message } : {}),
        ...(input.at !== undefined ? { startedAt: input.at, updatedAt: input.at } : {})
      });
    },
    /** 结束一个 run 节点，并同步更新时间。 */
    finish(input: RunFinishInput): NodePatchCommand {
      return cmd.node.patch(input.id, {
        status: input.status ?? 'done',
        ...(input.title ? { title: input.title } : {}),
        ...(input.message ? { message: input.message } : {}),
        ...(input.at !== undefined ? { updatedAt: input.at, endedAt: input.at } : {}),
        data: mergeData(input.data)
      });
    }
  },
  content: {
    /** 打开一个文本流，默认使用 markdown assembler。 */
    open(input: ContentOpenInput): StreamOpenCommand {
      return cmd.stream.open({
        ...input,
        assembler: input.assembler ?? 'markdown'
      });
    },
    /** 向一个已打开的流追加内容。 */
    append(streamId: string, text: string): StreamDeltaCommand {
      return cmd.stream.delta(streamId, text);
    },
    /**
     * 直接用“完整快照”替换当前内容。
     * 适合后端返回完整 markdown/string，而不是逐 token append 的场景。
     */
    replace(input: ContentReplaceInput): BlockPatchCommand {
      return createContentReplaceCommand(input);
    },
    /** 关闭一个流。 */
    close(streamId: string): StreamCloseCommand {
      return cmd.stream.close(streamId);
    },
    /** 中断一个流，并附带可选原因。 */
    abort(streamId: string, reason?: string): StreamAbortCommand {
      return cmd.stream.abort(streamId, reason);
    }
  },
  message: {
    /** 插入一条消息 block。 */
    insert(
      input: MessageBlockInput,
      options: Omit<BlockInsertCommand, 'type' | 'block'> = {}
    ): BlockInsertCommand {
      return createMessageInsertCommand(input, options);
    },
    /** 按 block id upsert 一条消息。 */
    upsert(input: MessageBlockInput) {
      return createMessageUpsertCommand(input);
    },
    /** 快速创建纯文本消息。 */
    text(
      input: MessageTextInput,
      options: Omit<BlockInsertCommand, 'type' | 'block'> = {}
    ): BlockInsertCommand {
      return createMessageTextCommand(input, options);
    },
    /** 快速创建 artifact 消息。 */
    artifact(
      input: MessageArtifactInput,
      options: Omit<BlockInsertCommand, 'type' | 'block'> = {}
    ): BlockInsertCommand {
      return createMessageArtifactCommand(input, options);
    },
    /** 快速创建 error 消息。 */
    error(
      input: MessageErrorInput,
      options: Omit<BlockInsertCommand, 'type' | 'block'> = {}
    ): BlockInsertCommand {
      return createMessageErrorCommand(input, options);
    },
    /** 快速创建 attachment 消息。 */
    attachment(
      input: MessageAttachmentInput,
      options: Omit<BlockInsertCommand, 'type' | 'block'> = {}
    ): BlockInsertCommand {
      return createMessageAttachmentCommand(input, options);
    },
    /** 快速创建 branch 消息。 */
    branch(
      input: BranchUpdateInput,
      options: Omit<BlockInsertCommand, 'type' | 'block'> = {}
    ): BlockInsertCommand {
      return createMessageInsertCommand(
        {
          ...input,
          type: 'branch',
          renderer: 'branch',
          data: mergeData(
            createBranchData(input),
            input.data
          )
        },
        options
      );
    },
    /** 快速创建 handoff 消息。 */
    handoff(
      input: HandoffUpdateInput,
      options: Omit<BlockInsertCommand, 'type' | 'block'> = {}
    ): BlockInsertCommand {
      return createMessageInsertCommand(
        {
          ...input,
          type: 'handoff',
          renderer: 'handoff',
          data: mergeData(
            createHandoffData(input),
            input.data
          )
        },
        options
      );
    },
    /** 按 block id 更新 artifact 消息。 */
    artifactUpsert(input: MessageArtifactInput): BlockPatchCommand {
      return createArtifactUpsertCommand(input);
    },
    /** 按 block id 创建或覆盖 error 消息。 */
    errorUpsert(input: MessageErrorInput): BlockUpsertCommand {
      return createErrorUpsertCommand(input);
    },
    /** 按 block id 更新 attachment 消息。 */
    attachmentUpsert(input: MessageAttachmentInput): BlockPatchCommand {
      return createAttachmentUpsertCommand(input);
    },
    /** 按 block id 更新 branch 消息。 */
    branchUpsert(input: BranchUpdateInput): BlockPatchCommand {
      return createBranchUpsertCommand(input);
    },
    /** 按 block id 更新 handoff 消息。 */
    handoffUpsert(input: HandoffUpdateInput): BlockPatchCommand {
      return createHandoffUpsertCommand(input);
    }
  },
  artifact: {
    /** 独立 artifact helper，便于协议层按语义直接调用。 */
    upsert(input: MessageArtifactInput): BlockPatchCommand {
      return createArtifactUpsertCommand(input);
    }
  },
  error: {
    /** 独立 error helper，便于协议层按语义直接调用。 */
    upsert(input: MessageErrorInput): BlockUpsertCommand {
      return createErrorUpsertCommand(input);
    }
  },
  approval: {
    /** 创建或更新审批 block。 */
    upsert(input: ApprovalUpdateInput): BlockPatchCommand {
      return createApprovalUpdateCommand(input);
    },
    /** `upsert` 的语义别名，更贴近审批流事件命名。 */
    update(input: ApprovalUpdateInput): BlockPatchCommand {
      return createApprovalUpdateCommand(input);
    }
  },
  attachment: {
    /** 独立 attachment helper，便于协议层按语义直接调用。 */
    upsert(input: MessageAttachmentInput): BlockPatchCommand {
      return createAttachmentUpsertCommand(input);
    }
  },
  branch: {
    /** 独立 branch helper，便于协议层按语义直接调用。 */
    upsert(input: BranchUpdateInput): BlockPatchCommand {
      return createBranchUpsertCommand(input);
    }
  },
  handoff: {
    /** 独立 handoff helper，便于协议层按语义直接调用。 */
    upsert(input: HandoffUpdateInput): BlockPatchCommand {
      return createHandoffUpsertCommand(input);
    }
  },
  tool: {
    /** 创建一个 tool 节点和对应的 surface block。 */
    start(input: ToolStartInput): RuntimeCommand[] {
      const status = input.status ?? 'running';

      return [
        cmd.node.upsert({
          id: input.id,
          type: 'tool',
          status,
          data: mergeData(input.data, input.nodeData),
          ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
          ...(input.title ? { title: input.title } : {}),
          ...(input.message ? { message: input.message } : {}),
          ...(input.at !== undefined ? { startedAt: input.at, updatedAt: input.at } : {})
        }),
        cmd.block.upsert({
          id: toolBlockId(input.id, input.blockId),
          slot: input.slot ?? 'main',
          type: 'tool',
          renderer: input.renderer ?? 'tool',
          state: 'stable',
          nodeId: input.id,
          data: mergeData(
            {
              title: input.title,
              status,
              ...(input.message ? { message: input.message } : {})
            },
            input.data,
            input.blockData
          ),
          ...resolveMessageSemantics(input),
          ...(input.at !== undefined ? { createdAt: input.at, updatedAt: input.at } : {})
        })
      ];
    },
    /** 更新 tool 的节点状态和渲染 block。 */
    update(input: ToolUpdateInput): RuntimeCommand[] {
      const status = input.status ?? 'running';
      const resultData =
        input.result !== undefined
          ? {
              result: input.result
            }
          : undefined;

      return [
        cmd.node.patch(input.id, {
          status,
          ...(input.title ? { title: input.title } : {}),
          ...(input.message ? { message: input.message } : {}),
          ...(input.at !== undefined ? { updatedAt: input.at } : {}),
          data: mergeData(input.data, input.nodeData, resultData)
        }),
        cmd.block.patch(toolBlockId(input.id, input.blockId), {
          ...(input.renderer ? { renderer: input.renderer } : {}),
          ...resolveMessageSemantics(input),
          ...(input.at !== undefined ? { updatedAt: input.at } : {}),
          data: mergeData(
            {
              ...(input.title ? { title: input.title } : {}),
              status,
              ...(input.message ? { message: input.message } : {})
            },
            input.data,
            input.blockData,
            resultData
          )
        })
      ];
    },
    /** 结束 tool，默认把状态置为 done。 */
    finish(input: ToolUpdateInput): RuntimeCommand[] {
      return cmd.tool.update({
        ...input,
        status: input.status ?? 'done'
      });
    }
  },
  node: {
    /** 原始 node upsert 命令。 */
    upsert(node: NodeUpsertCommand['node']): NodeUpsertCommand {
      return {
        type: 'node.upsert',
        node
      };
    },
    /** 原始 node patch 命令。 */
    patch(id: string, patch: NodePatchCommand['patch']): NodePatchCommand {
      return {
        type: 'node.patch',
        id,
        patch
      };
    },
    /** 删除一个 node。 */
    remove(id: string): NodeRemoveCommand {
      return {
        type: 'node.remove',
        id
      };
    },
    /** 把节点标记成 error，并写入通用错误字段。 */
    error(input: NodeErrorInput): NodePatchCommand {
      return cmd.node.patch(input.id, {
        ...(input.type ? { type: input.type } : {}),
        status: input.status ?? 'error',
        ...(input.title ? { title: input.title } : {}),
        message: input.message,
        ...(input.at !== undefined ? { updatedAt: input.at } : {}),
        data: mergeData(
          {
            error: true,
            errorMessage: input.message,
            ...(input.code ? { errorCode: input.code } : {})
          },
          input.data
        )
      });
    }
  },
  block: {
    /** 原始 block insert 命令。 */
    insert(block: BlockInsertCommand['block'], options: Omit<BlockInsertCommand, 'type' | 'block'> = {}): BlockInsertCommand {
      return {
        type: 'block.insert',
        block,
        ...options
      };
    },
    /** 原始 block upsert 命令。 */
    upsert(block: BlockInsertCommand['block']) {
      return {
        type: 'block.upsert' as const,
        block
      };
    },
    /** 原始 block patch 命令。 */
    patch(id: string, patch: BlockPatchCommand['patch']): BlockPatchCommand {
      return {
        type: 'block.patch',
        id,
        patch
      };
    },
    /** 删除一个 block。 */
    remove(id: string) {
      return {
        type: 'block.remove' as const,
        id
      };
    }
  },
  stream: {
    /** 打开一个 assembler stream。 */
    open(command: Omit<StreamOpenCommand, 'type'>): StreamOpenCommand {
      return {
        type: 'stream.open',
        ...command
      };
    },
    /** 追加一段流内容。 */
    delta(streamId: string, text: string): StreamDeltaCommand {
      return {
        type: 'stream.delta',
        streamId,
        text
      };
    },
    /** `delta` 的可读性别名。 */
    write(streamId: string, text: string): StreamDeltaCommand {
      return cmd.stream.delta(streamId, text);
    },
    /** 关闭一个流。 */
    close(streamId: string): StreamCloseCommand {
      return {
        type: 'stream.close',
        streamId
      };
    },
    /** `close` 的可读性别名。 */
    end(streamId: string): StreamCloseCommand {
      return cmd.stream.close(streamId);
    },
    /** 中断一个流。 */
    abort(streamId: string, reason?: string): StreamAbortCommand {
      return {
        type: 'stream.abort',
        streamId,
        ...(reason ? { reason } : {})
      };
    }
  },
  event: {
    /** 把原始事件或调试信息记录进 history。 */
    record(event: EventRecordCommand['event']): EventRecordCommand {
      return {
        type: 'event.record',
        event
      };
    }
  }
};
