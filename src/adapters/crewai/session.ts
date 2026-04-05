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
  resolveGroupId,
  resolveRunTitle,
  resolveStreamId,
  resolveToolRenderer
} from './resolvers';
import type {
  CrewAIEvent,
  CrewAIPendingTool,
  CrewAIProtocolOptions,
  CrewAIRunSession,
  CrewAISessionState,
  CrewAIToolPayload
} from './types';

/**
 * 创建一份全新的 CrewAI 会话状态容器。
 */
export function createCrewAISessionState(): CrewAISessionState {
  return {
    sessions: new Map<string, CrewAIRunSession>(),
    startedRuns: new Set<string>()
  };
}

/**
 * 重置 CrewAI 会话状态容器。
 */
export function resetCrewAISessionState(state: CrewAISessionState): void {
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
function syncStreamSegmentIds(session: CrewAIRunSession): void {
  session.streamId = buildSegmentScopedId(session.streamBaseId, session.streamSegmentIndex);
  session.blockId = buildSegmentScopedId(session.blockBaseId, session.streamSegmentIndex);
}

/**
 * 在一次内容分段完成后，切换到下一段内容 id。
 */
function advanceStreamSegment(session: CrewAIRunSession): void {
  session.streamSegmentIndex += 1;
  syncStreamSegmentIds(session);
  session.currentSegmentText = '';
}

/**
 * 打开 assistant 流式消息草稿区。
 */
export function createStreamOpenCommands(
  session: CrewAIRunSession,
  options: CrewAIProtocolOptions
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
      ...(session.groupId !== undefined ? { groupId: session.groupId } : {}),
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
  state: CrewAISessionState,
  runId: string,
  packet: CrewAIEvent,
  context: ProtocolContext,
  options: CrewAIProtocolOptions
): CrewAIRunSession {
  const existing = state.sessions.get(runId);

  if (existing) {
    return existing;
  }

  const created: CrewAIRunSession = {
    runId,
    streamBaseId: resolveStreamId(runId, packet, context, options),
    blockBaseId: resolveBlockId(runId, packet, context, options),
    streamId: '',
    blockId: '',
    streamSegmentIndex: 0,
    segmentHasContent: false,
    groupId: resolveGroupId(runId, packet, context, options),
    title: resolveRunTitle(packet, runId, context, options),
    streamOpen: false,
    currentSegmentText: '',
    lastCompletedSegmentText: '',
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
 * 把新的 assistant 文本追加到当前分段缓存里。
 */
export function appendAssistantText(session: CrewAIRunSession, content: string): void {
  session.currentSegmentText += content;
  session.segmentHasContent = true;
}

/**
 * 读取最近一段可比较的 assistant 文本。
 */
export function getLatestAssistantText(session: CrewAIRunSession): string {
  return session.segmentHasContent
    ? session.currentSegmentText
    : session.lastCompletedSegmentText;
}

/**
 * 关闭当前已打开的 assistant 内容流，并按需切到下一段。
 */
export function closeCurrentStream(
  session: CrewAIRunSession,
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

  if (session.segmentHasContent) {
    session.lastCompletedSegmentText = session.currentSegmentText;
  }

  if (advanceSegment && session.segmentHasContent) {
    advanceStreamSegment(session);
  }

  session.segmentHasContent = false;
}

/**
 * 中止当前已打开的 assistant 内容流。
 */
export function abortCurrentStream(
  session: CrewAIRunSession,
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
  session: CrewAIRunSession,
  packet: CrewAIEvent,
  context: ProtocolContext,
  options: CrewAIProtocolOptions
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
  state: CrewAISessionState,
  session: CrewAIRunSession,
  packet: CrewAIEvent,
  context: ProtocolContext,
  commands: RuntimeCommand[],
  options: CrewAIProtocolOptions
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
  session: CrewAIRunSession,
  tool: CrewAIToolPayload | undefined
): CrewAIPendingTool | undefined {
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
function createFallbackToolId(session: CrewAIRunSession): string {
  session.fallbackToolCount += 1;
  return `tool:${session.runId}:${session.fallbackToolCount}`;
}

/**
 * 读取或创建一条待完成工具调用记录。
 */
export function ensurePendingTool(
  session: CrewAIRunSession,
  tool: CrewAIToolPayload | undefined
): CrewAIPendingTool {
  const existing = findPendingTool(session, tool);

  if (existing) {
    existing.name = existing.name ?? extractToolName(tool);
    existing.rawId = existing.rawId ?? extractToolRawId(tool);

    if (tool?.input !== undefined) {
      existing.input = tool.input;
    }

    if (typeof tool?.argumentsText === 'string' && tool.argumentsText.length > 0) {
      existing.argumentsText = tool.argumentsText;
    }

    return existing;
  }

  const created: CrewAIPendingTool = {
    id: extractToolRawId(tool) ?? createFallbackToolId(session),
    rawId: extractToolRawId(tool),
    name: extractToolName(tool),
    ...(tool?.input !== undefined ? { input: tool.input } : {}),
    ...(typeof tool?.argumentsText === 'string' && tool.argumentsText.length > 0
      ? { argumentsText: tool.argumentsText }
      : {})
  };

  session.pendingTools.push(created);
  return created;
}

/**
 * 在工具完成时取出对应的 pending tool。
 */
export function consumePendingTool(
  session: CrewAIRunSession,
  tool: CrewAIToolPayload | undefined
): CrewAIPendingTool {
  const pending = findPendingTool(session, tool);

  if (!pending) {
    return {
      id: extractToolRawId(tool) ?? createFallbackToolId(session),
      rawId: extractToolRawId(tool),
      name: extractToolName(tool),
      ...(tool?.input !== undefined ? { input: tool.input } : {}),
      ...(typeof tool?.argumentsText === 'string' && tool.argumentsText.length > 0
        ? { argumentsText: tool.argumentsText }
        : {})
    };
  }

  session.pendingTools = session.pendingTools.filter((item) => item.id !== pending.id);
  return pending;
}

/**
 * 构建工具节点和工具 block 里共用的结构化数据。
 */
export function buildToolData(
  packet: CrewAIEvent,
  tool: CrewAIToolPayload | undefined
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
  session: CrewAIRunSession,
  toolId: string,
  tool: CrewAIToolPayload | undefined,
  packet: CrewAIEvent,
  context: ProtocolContext,
  commands: RuntimeCommand[],
  options: CrewAIProtocolOptions
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
      ...(session.groupId !== undefined ? { groupId: session.groupId } : {}),
      renderer: resolveToolRenderer(session.runId, toolId, tool, packet, context, options),
      data: buildToolData(packet, tool),
      at: context.now()
    })
  );
}

/**
 * 判断某个工具是否已经完成过。
 */
export function hasFinishedTool(session: CrewAIRunSession, toolId: string): boolean {
  return session.finishedToolIds.has(toolId);
}

/**
 * 把一个工具标记为已完成。
 */
export function markToolFinished(session: CrewAIRunSession, toolId: string): void {
  session.finishedToolIds.add(toolId);
}

/**
 * 关闭一次 run 会话并清理内部状态。
 */
export function disposeRunSession(
  state: CrewAISessionState,
  session: CrewAIRunSession
): void {
  state.sessions.delete(session.runId);
  state.startedRuns.delete(session.runId);
}
