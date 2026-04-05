import { createMarkdownAssembler } from '../../runtime/assemblers';
import { cmd } from '../../runtime/defineProtocol';
import {
  defineAgentdownPreset,
  type AgentdownPreset
} from '../../runtime/definePreset';
import type { RuntimeCommand, RuntimeProtocol } from '../../runtime/types';
import {
  extractCrewOutputAssistantText,
  extractCrewOutputToolCalls,
  extractCrewOutputToolResults,
  extractErrorMessage,
  extractExplicitRunId,
  extractStreamingTool,
  extractTextContent,
  extractToolName,
  extractToolResult,
  isCrewOutputEvent,
  isErrorEvent,
  isTextChunk,
  isToolCallChunk
} from './packet';
import { resolveToolRenderer } from './resolvers';
import {
  abortCurrentStream,
  appendAssistantText,
  buildToolData,
  closeCurrentStream,
  consumePendingTool,
  createCrewAISessionState,
  createStreamOpenCommands,
  disposeRunSession,
  ensurePendingTool,
  ensureRunSession,
  ensureRunStarted,
  ensureToolStarted,
  getLatestAssistantText,
  hasFinishedTool,
  markToolFinished,
  resetCrewAISessionState
} from './session';
import type {
  CrewAIEvent,
  CrewAIPresetOptions,
  CrewAIProtocolOptions,
  CrewAIToolPayload
} from './types';

/**
 * 去掉首尾空白，用于比较最终文本是否已经被流式输出过。
 */
function trimComparableText(value: string): string {
  return value.trim();
}

/**
 * 把最终 `CrewOutput` 文本补齐到当前会话里。
 *
 * 规则：
 * - 如果流式文本已经完整输出，不再重复插入
 * - 如果当前分段是最终文本的前缀，则只补后半段
 * - 如果此前完全没有文本，则直接插入完整最终答案
 * - 如果前后完全对不上，则新开一段插入最终答案，避免把不同语义硬拼到同一个 block
 */
function syncFinalAssistantText(
  session: ReturnType<typeof ensureRunSession>,
  finalText: string | undefined,
  commands: RuntimeCommand[],
  options: CrewAIProtocolOptions
): void {
  if (!finalText) {
    return;
  }

  const comparableFinalText = trimComparableText(finalText);

  if (comparableFinalText.length === 0) {
    return;
  }

  const latestText = getLatestAssistantText(session);

  if (trimComparableText(latestText) === comparableFinalText) {
    return;
  }

  if (
    session.streamOpen
    && session.currentSegmentText.length > 0
    && finalText.startsWith(session.currentSegmentText)
  ) {
    const remainingText = finalText.slice(session.currentSegmentText.length);

    if (remainingText.length > 0) {
      commands.push(cmd.content.append(session.streamId, remainingText));
      appendAssistantText(session, remainingText);
    }
    return;
  }

  if (trimComparableText(latestText).length === 0) {
    commands.push(...createStreamOpenCommands(session, options));
    commands.push(cmd.content.append(session.streamId, finalText));
    appendAssistantText(session, finalText);
    return;
  }

  if (session.streamOpen) {
    closeCurrentStream(session, commands, {
      advanceSegment: true
    });
  }

  commands.push(...createStreamOpenCommands(session, options));
  commands.push(cmd.content.append(session.streamId, finalText));
  appendAssistantText(session, finalText);
}

/**
 * 把 pending tool 上已经拿到的输入信息并回最终工具结果里。
 *
 * CrewAI 的真实流式过程中：
 * - `tool_call` chunk 先到
 * - 真正的工具返回值要等 `CrewOutput`
 *
 * 所以 finish 时要把两段信息拼起来，组件才能同时拿到 `input` 和 `result`。
 */
function mergePendingToolData(
  pendingTool: ReturnType<typeof consumePendingTool>,
  tool: CrewAIToolPayload
): CrewAIToolPayload {
  return {
    ...tool,
    ...(tool.name === undefined && pendingTool.name !== undefined
      ? { name: pendingTool.name }
      : {}),
    ...(tool.input === undefined && pendingTool.input !== undefined
      ? { input: pendingTool.input }
      : {}),
    ...(tool.argumentsText === undefined && pendingTool.argumentsText !== undefined
      ? { argumentsText: pendingTool.argumentsText }
      : {})
  };
}

/**
 * 创建一次 CrewAI 事件到 RuntimeCommand 的映射协议。
 *
 * 当前直接消费 CrewAI 官方 SSE：
 * - 普通 `text` chunk 映射 assistant markdown 增量
 * - `tool_call` chunk 映射工具开始
 * - 最终 `CrewOutput` 负责补齐工具结果和最终答案
 */
export function createCrewAIProtocol(
  options: CrewAIProtocolOptions = {}
): RuntimeProtocol<CrewAIEvent> {
  const state = createCrewAISessionState();
  let activeRunId: string | null = null;

  return {
    map({ packet, context }) {
      const commands: RuntimeCommand[] = [];

      if (options.recordEvents) {
        commands.push(cmd.event.record(packet));
      }

      const explicitRunId = extractExplicitRunId(packet);
      const runId = explicitRunId ?? activeRunId ?? context.makeId('crewai-run');
      const session = ensureRunSession(state, runId, packet, context, options);

      activeRunId = runId;

      if (isTextChunk(packet)) {
        const content = extractTextContent(packet);

        ensureRunStarted(state, session, packet, context, commands, options);

        if (!content) {
          return commands;
        }

        commands.push(...createStreamOpenCommands(session, options));
        commands.push(cmd.content.append(session.streamId, content));
        appendAssistantText(session, content);
        return commands;
      }

      if (isToolCallChunk(packet)) {
        const tool = extractStreamingTool(packet);
        const pendingTool = ensurePendingTool(session, tool);

        ensureRunStarted(state, session, packet, context, commands, options);
        closeCurrentStream(session, commands, {
          advanceSegment: true
        });
        ensureToolStarted(session, pendingTool.id, tool, packet, context, commands, options);
        return commands;
      }

      if (isCrewOutputEvent(packet)) {
        ensureRunStarted(state, session, packet, context, commands, options);

        for (const toolCall of extractCrewOutputToolCalls(packet)) {
          const pendingTool = ensurePendingTool(session, toolCall);
          ensureToolStarted(session, pendingTool.id, toolCall, packet, context, commands, options);
        }

        for (const tool of extractCrewOutputToolResults(packet)) {
          const pendingTool = consumePendingTool(session, tool);
          const resolvedTool = mergePendingToolData(pendingTool, tool);

          if (hasFinishedTool(session, pendingTool.id)) {
            continue;
          }

          ensureToolStarted(session, pendingTool.id, resolvedTool, packet, context, commands, options);
          commands.push(
            ...cmd.tool.finish({
              id: pendingTool.id,
              title: extractToolName(resolvedTool) ?? pendingTool.name ?? '工具调用',
              renderer: resolveToolRenderer(
                session.runId,
                pendingTool.id,
                resolvedTool,
                packet,
                context,
                options
              ),
              result: extractToolResult(packet, resolvedTool),
              data: buildToolData(packet, resolvedTool),
              at: context.now()
            })
          );
          markToolFinished(session, pendingTool.id);
        }

        syncFinalAssistantText(
          session,
          extractCrewOutputAssistantText(packet),
          commands,
          options
        );
        closeCurrentStream(session, commands);

        commands.push(
          cmd.run.finish({
            id: session.runId,
            ...(session.title ? { title: session.title } : {}),
            data: {
              rawEvent: packet
            },
            at: context.now()
          })
        );

        disposeRunSession(state, session);

        if (activeRunId === session.runId) {
          activeRunId = null;
        }

        return commands;
      }

      if (isErrorEvent(packet)) {
        ensureRunStarted(state, session, packet, context, commands, options);
        abortCurrentStream(session, commands, extractErrorMessage(packet));

        commands.push(
          cmd.node.error({
            id: session.runId,
            ...(session.title ? { title: session.title } : {}),
            message: extractErrorMessage(packet),
            data: {
              rawEvent: packet
            },
            at: context.now()
          }),
          cmd.run.finish({
            id: session.runId,
            ...(session.title ? { title: session.title } : {}),
            message: extractErrorMessage(packet),
            status: 'error',
            data: {
              rawEvent: packet
            },
            at: context.now()
          })
        );

        disposeRunSession(state, session);

        if (activeRunId === session.runId) {
          activeRunId = null;
        }
      }

      return commands;
    },
    reset() {
      resetCrewAISessionState(state);
      activeRunId = null;
    }
  };
}

/**
 * 为 CrewAI 事件流创建一个开箱即用的 preset。
 */
export function defineCrewAIPreset<
  TSource = AsyncIterable<CrewAIEvent> | Iterable<CrewAIEvent>
>(options: CrewAIPresetOptions<TSource> = {}): AgentdownPreset<CrewAIEvent, TSource> {
  return defineAgentdownPreset<CrewAIEvent, TSource>({
    ...options,
    protocol: options.protocol ?? createCrewAIProtocol(options.protocolOptions),
    assemblers: {
      markdown: createMarkdownAssembler(),
      ...(options.assemblers ?? {})
    }
  });
}
