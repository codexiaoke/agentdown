import { cmd } from '../../runtime/defineProtocol';
import type {
  ProtocolContext,
  RuntimeCommand,
  RuntimeData
} from '../../runtime/types';
import {
  extractToolArgs,
  extractToolName,
  extractToolRawId
} from './packet';
import {
  resolveBlockId,
  resolveConversationId,
  resolveGroupId,
  resolveMessageId,
  resolveRunTitle,
  resolveStreamId,
  resolveTurnId,
  resolveToolRenderer
} from './resolvers';
import type {
  AutoGenEvent,
  AutoGenPendingTool,
  AutoGenProtocolOptions,
  AutoGenRunSession,
  AutoGenSessionState,
  AutoGenToolPayload
} from './types';

/**
 * 创建一份全新的 AutoGen 会话状态容器。
 */
export function createAutoGenSessionState(): AutoGenSessionState {
  return {
    sessions: new Map<string, AutoGenRunSession>(),
    startedRuns: new Set<string>()
  };
}

/**
 * 重置 AutoGen 会话状态容器。
 */
export function resetAutoGenSessionState(state: AutoGenSessionState): void {
  state.sessions.clear();
  state.startedRuns.clear();
}

/**
 * 按内容分段索引生成当前应使用的 stream / block id。
 */
function buildSegmentScopedId(baseId: string, segmentIndex: number): string {
  return segmentIndex === 0
    ? baseId
    : `${baseId}:${segmentIndex + 1}`;
}

/**
 * 同步当前 run 会话正在使用的流式内容 id。
 */
function syncStreamSegmentIds(session: AutoGenRunSession): void {
  session.streamId = buildSegmentScopedId(session.streamBaseId, session.streamSegmentIndex);
  session.blockId = buildSegmentScopedId(session.blockBaseId, session.streamSegmentIndex);
}

/**
 * 提取当前 run 会话写入 block 时需要附带的聊天语义字段。
 */
function resolveSessionMessageScope(session: AutoGenRunSession) {
  const activeMessageId = session.activeAssistantMessageId ?? session.messageId;

  return {
    ...(session.groupId !== undefined ? { groupId: session.groupId } : {}),
    ...(session.conversationId !== undefined ? { conversationId: session.conversationId } : {}),
    ...(session.turnId !== undefined ? { turnId: session.turnId } : {}),
    ...(activeMessageId !== undefined ? { messageId: activeMessageId } : {})
  };
}

/**
 * 在一次内容分段完成后，切换到下一段内容 id。
 */
function advanceStreamSegment(session: AutoGenRunSession): void {
  session.streamSegmentIndex += 1;
  syncStreamSegmentIds(session);
}

/**
 * 打开 assistant 流式消息草稿区。
 */
export function createStreamOpenCommands(
  session: AutoGenRunSession,
  options: AutoGenProtocolOptions
): RuntimeCommand[] {
  if (session.streamOpen) {
    return [];
  }

  session.streamOpen = true;
  session.segmentHasContent = false;
  return [
    cmd.content.open({
      streamId: session.streamId,
      assembler: options.streamAssembler ?? 'markdown',
      slot: options.slot ?? 'main',
      nodeId: session.runId,
      ...resolveSessionMessageScope(session),
      data: {
        blockId: session.blockId
      }
    })
  ];
}

/**
 * 读取或创建一次根 run 会话状态。
 */
export function ensureRunSession(
  state: AutoGenSessionState,
  runId: string,
  packet: AutoGenEvent,
  context: ProtocolContext,
  options: AutoGenProtocolOptions
): AutoGenRunSession {
  const existing = state.sessions.get(runId);

  if (existing) {
    return existing;
  }

  const created: AutoGenRunSession = {
    runId,
    streamBaseId: resolveStreamId(runId, packet, context, options),
    blockBaseId: resolveBlockId(runId, packet, context, options),
    streamId: '',
    blockId: '',
    streamSegmentIndex: 0,
    segmentHasContent: false,
    groupId: resolveGroupId(runId, packet, context, options),
    conversationId: resolveConversationId(runId, packet, context, options),
    turnId: resolveTurnId(runId, packet, context, options),
    messageId: resolveMessageId(runId, packet, context, options),
    title: resolveRunTitle(packet, runId, context, options),
    streamOpen: false,
    interrupted: false,
    activeAssistantMessageId: undefined,
    finalizedAssistantMessageIds: new Set<string>(),
    pendingTools: [],
    startedToolIds: new Set<string>(),
    finishedToolIds: new Set<string>(),
    fallbackToolCount: 0
  };
  syncStreamSegmentIds(created);

  state.sessions.set(runId, created);
  return created;
}

/**
 * 关闭当前已打开的 assistant 内容流，并按需切到下一段。
 */
export function closeCurrentStream(
  session: AutoGenRunSession,
  commands: RuntimeCommand[],
  {
    advanceSegment
  }: {
    advanceSegment: boolean;
  } = {
    advanceSegment: false
  }
): void {
  if (!session.streamOpen) {
    session.activeAssistantMessageId = undefined;
    return;
  }

  commands.push(cmd.content.close(session.streamId));
  session.streamOpen = false;
  session.activeAssistantMessageId = undefined;

  if (advanceSegment && session.segmentHasContent) {
    advanceStreamSegment(session);
  }

  session.segmentHasContent = false;
}

/**
 * 中止当前已打开的 assistant 内容流。
 */
export function abortCurrentStream(
  session: AutoGenRunSession,
  commands: RuntimeCommand[],
  reason: string
): void {
  if (!session.streamOpen) {
    session.activeAssistantMessageId = undefined;
    return;
  }

  commands.push(cmd.content.abort(session.streamId, reason));
  session.streamOpen = false;
  session.segmentHasContent = false;
  session.activeAssistantMessageId = undefined;
}

/**
 * 在需要时更新 run 会话标题。
 */
function syncRunTitle(
  session: AutoGenRunSession,
  packet: AutoGenEvent,
  context: ProtocolContext,
  options: AutoGenProtocolOptions
): void {
  if (session.title) {
    return;
  }

  const nextTitle = resolveRunTitle(packet, session.runId, context, options);

  if (nextTitle) {
    session.title = nextTitle;
  }
}

/**
 * 在需要时补一条 run.start 命令。
 */
export function ensureRunStarted(
  state: AutoGenSessionState,
  session: AutoGenRunSession,
  packet: AutoGenEvent,
  context: ProtocolContext,
  commands: RuntimeCommand[],
  options: AutoGenProtocolOptions
): void {
  if (state.startedRuns.has(session.runId)) {
    return;
  }

  syncRunTitle(session, packet, context, options);
  state.startedRuns.add(session.runId);
  commands.push(
    cmd.run.start({
      id: session.runId,
      ...(session.title ? { title: session.title } : {}),
      data: {
        rawEvent: packet
      },
      at: context.now()
    })
  );

  if (options.openStreamOnRunStarted ?? true) {
    commands.push(...createStreamOpenCommands(session, options));
  }
}

/**
 * 在流式 assistant 消息开始时，必要时切换到新的文本分段。
 */
export function ensureAssistantMessageSegment(
  session: AutoGenRunSession,
  messageId: string | undefined,
  commands: RuntimeCommand[],
  options: AutoGenProtocolOptions
): void {
  if (messageId && session.activeAssistantMessageId === messageId) {
    commands.push(...createStreamOpenCommands(session, options));
    return;
  }

  if (session.streamOpen && session.segmentHasContent) {
    closeCurrentStream(session, commands, {
      advanceSegment: true
    });
  }

  session.activeAssistantMessageId = messageId ?? session.messageId ?? undefined;
  commands.push(...createStreamOpenCommands(session, options));
}

/**
 * 记录某条 assistant 消息已经完成，用于避免完整消息回放时重复渲染。
 */
export function markAssistantMessageFinalized(
  session: AutoGenRunSession,
  messageId: string | undefined
): void {
  if (messageId) {
    session.finalizedAssistantMessageIds.add(messageId);
  }
}

/**
 * 判断某条 assistant 消息是否已经在当前会话里完成去重。
 */
export function hasFinalizedAssistantMessage(
  session: AutoGenRunSession,
  messageId: string | undefined
): boolean {
  return messageId !== undefined
    ? session.finalizedAssistantMessageIds.has(messageId)
    : false;
}

/**
 * 根据 tool 的原始 id 或名称查找队列里未完成的工具调用。
 */
function findPendingTool(
  session: AutoGenRunSession,
  tool: AutoGenToolPayload | undefined
): AutoGenPendingTool | undefined {
  const rawId = extractToolRawId(tool);

  if (rawId) {
    return session.pendingTools.find((item) => item.rawId === rawId || item.id === rawId);
  }

  const name = extractToolName(tool);
  return name
    ? session.pendingTools.find((item) => item.name === name)
    : undefined;
}

/**
 * 为当前 run 生成一个稳定的兜底工具 id。
 */
function createFallbackToolId(session: AutoGenRunSession): string {
  session.fallbackToolCount += 1;
  return `tool:${session.runId}:${session.fallbackToolCount}`;
}

/**
 * 读取或创建一条待完成工具调用记录。
 */
export function ensurePendingTool(
  session: AutoGenRunSession,
  tool: AutoGenToolPayload | undefined
): AutoGenPendingTool {
  const existing = findPendingTool(session, tool);

  if (existing) {
    existing.name = existing.name ?? extractToolName(tool);
    existing.rawId = existing.rawId ?? extractToolRawId(tool);
    return existing;
  }

  const created: AutoGenPendingTool = {
    id: extractToolRawId(tool) ?? createFallbackToolId(session),
    rawId: extractToolRawId(tool),
    name: extractToolName(tool)
  };

  session.pendingTools.push(created);
  return created;
}

/**
 * 在 tool completion 到来时取出对应的 pending tool。
 */
export function consumePendingTool(
  session: AutoGenRunSession,
  tool: AutoGenToolPayload | undefined
): AutoGenPendingTool {
  const pending = findPendingTool(session, tool);

  if (!pending) {
    return {
      id: extractToolRawId(tool) ?? createFallbackToolId(session),
      rawId: extractToolRawId(tool),
      name: extractToolName(tool)
    };
  }

  session.pendingTools = session.pendingTools.filter((item) => item.id !== pending.id);
  return pending;
}

/**
 * 构建工具节点和工具 block 里共用的结构化数据。
 */
export function buildToolData(
  packet: AutoGenEvent,
  tool: AutoGenToolPayload | undefined
): RuntimeData {
  const data: RuntimeData = {
    rawEvent: packet
  };
  const input = extractToolArgs(tool);

  if (tool) {
    data.tool = tool;
  }

  if (input !== undefined) {
    data.input = input;
  }

  return data;
}

/**
 * 在需要时补一条 tool.start 命令。
 */
export function ensureToolStarted(
  session: AutoGenRunSession,
  toolId: string,
  tool: AutoGenToolPayload | undefined,
  packet: AutoGenEvent,
  context: ProtocolContext,
  commands: RuntimeCommand[],
  options: AutoGenProtocolOptions
): void {
  if (session.startedToolIds.has(toolId)) {
    return;
  }

  session.startedToolIds.add(toolId);
  commands.push(
    ...cmd.tool.start({
      id: toolId,
      parentId: session.runId,
      title: extractToolName(tool) ?? '工具调用',
      slot: options.slot ?? 'main',
      ...resolveSessionMessageScope(session),
      renderer: resolveToolRenderer(session.runId, toolId, tool, packet, context, options),
      data: buildToolData(packet, tool),
      at: context.now()
    })
  );
}

/**
 * 标记某个工具已经结束，用于避免 summary 事件重复 finish。
 */
export function markToolFinished(session: AutoGenRunSession, toolId: string): void {
  session.finishedToolIds.add(toolId);
}

/**
 * 判断某个工具是否已经结束。
 */
export function hasFinishedTool(session: AutoGenRunSession, toolId: string): boolean {
  return session.finishedToolIds.has(toolId);
}

/**
 * 关闭一次 run 会话并清理内部状态。
 */
export function disposeRunSession(
  state: AutoGenSessionState,
  session: AutoGenRunSession
): void {
  state.sessions.delete(session.runId);
  state.startedRuns.delete(session.runId);
}
