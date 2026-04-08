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
  AgnoEvent,
  AgnoPendingTool,
  AgnoProtocolOptions,
  AgnoRunSession,
  AgnoSessionState,
  AgnoToolPayload
} from './types';

/**
 * 创建一份全新的 Agno 会话状态容器。
 */
export function createAgnoSessionState(): AgnoSessionState {
  return {
    sessions: new Map<string, AgnoRunSession>(),
    startedRuns: new Set<string>()
  };
}

/**
 * 重置 Agno 会话状态容器。
 */
export function resetAgnoSessionState(state: AgnoSessionState): void {
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
function syncStreamSegmentIds(session: AgnoRunSession): void {
  session.streamId = buildSegmentScopedId(session.streamBaseId, session.streamSegmentIndex);
  session.blockId = buildSegmentScopedId(session.blockBaseId, session.streamSegmentIndex);
}

/**
 * 提取当前 run 会话写入 block 时需要附带的聊天语义字段。
 */
function resolveSessionMessageScope(session: AgnoRunSession) {
  return {
    ...(session.groupId !== undefined ? { groupId: session.groupId } : {}),
    ...(session.conversationId !== undefined ? { conversationId: session.conversationId } : {}),
    ...(session.turnId !== undefined ? { turnId: session.turnId } : {}),
    ...(session.messageId !== undefined ? { messageId: session.messageId } : {})
  };
}

/**
 * 在一次内容分段完成后，切换到下一段内容 id。
 */
function advanceStreamSegment(session: AgnoRunSession): void {
  session.streamSegmentIndex += 1;
  syncStreamSegmentIds(session);
}

/**
 * 打开 assistant 流式消息草稿区。
 */
export function createStreamOpenCommands(
  session: AgnoRunSession,
  options: AgnoProtocolOptions
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
 * 读取或创建一次 run 会话状态。
 */
export function ensureRunSession(
  state: AgnoSessionState,
  runId: string,
  packet: AgnoEvent,
  context: ProtocolContext,
  options: AgnoProtocolOptions
): AgnoRunSession {
  const existing = state.sessions.get(runId);

  if (existing) {
    return existing;
  }

  const created: AgnoRunSession = {
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
    pendingTools: [],
    startedToolIds: new Set<string>(),
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
  session: AgnoRunSession,
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
    return;
  }

  commands.push(cmd.content.close(session.streamId));
  session.streamOpen = false;

  if (advanceSegment && session.segmentHasContent) {
    advanceStreamSegment(session);
  }

  session.segmentHasContent = false;
}

/**
 * 中止当前已打开的 assistant 内容流。
 */
export function abortCurrentStream(
  session: AgnoRunSession,
  commands: RuntimeCommand[],
  reason: string
): void {
  if (!session.streamOpen) {
    return;
  }

  commands.push(cmd.content.abort(session.streamId, reason));
  session.streamOpen = false;
  session.segmentHasContent = false;
}

/**
 * 在需要时更新 run 会话标题。
 */
function syncRunTitle(
  session: AgnoRunSession,
  packet: AgnoEvent,
  context: ProtocolContext,
  options: AgnoProtocolOptions
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
  state: AgnoSessionState,
  session: AgnoRunSession,
  packet: AgnoEvent,
  context: ProtocolContext,
  commands: RuntimeCommand[],
  options: AgnoProtocolOptions
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
 * 根据 tool 的原始 id 或名称查找队列里未完成的工具调用。
 */
function findPendingTool(
  session: AgnoRunSession,
  tool: AgnoToolPayload | undefined
): AgnoPendingTool | undefined {
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
function createFallbackToolId(session: AgnoRunSession): string {
  session.fallbackToolCount += 1;
  return `tool:${session.runId}:${session.fallbackToolCount}`;
}

/**
 * 读取或创建一条待完成工具调用记录。
 */
export function ensurePendingTool(
  session: AgnoRunSession,
  tool: AgnoToolPayload | undefined
): AgnoPendingTool {
  const existing = findPendingTool(session, tool);

  if (existing) {
    existing.name = existing.name ?? extractToolName(tool);
    existing.rawId = existing.rawId ?? extractToolRawId(tool);
    return existing;
  }

  const created: AgnoPendingTool = {
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
  session: AgnoRunSession,
  tool: AgnoToolPayload | undefined
): AgnoPendingTool {
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
  packet: AgnoEvent,
  tool: AgnoToolPayload | undefined
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
  session: AgnoRunSession,
  toolId: string,
  tool: AgnoToolPayload | undefined,
  packet: AgnoEvent,
  context: ProtocolContext,
  commands: RuntimeCommand[],
  options: AgnoProtocolOptions,
  status = 'running'
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
      status,
      data: buildToolData(packet, tool),
      at: context.now()
    })
  );
}

/**
 * 关闭一次 run 会话并清理内部状态。
 */
export function disposeRunSession(
  state: AgnoSessionState,
  session: AgnoRunSession
): void {
  state.sessions.delete(session.runId);
  state.startedRuns.delete(session.runId);
}
