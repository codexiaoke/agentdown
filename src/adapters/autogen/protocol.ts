import { createMarkdownAssembler } from '../../runtime/assemblers';
import { cmd } from '../../runtime/defineProtocol';
import {
  defineAgentdownPreset,
  type AgentdownPreset
} from '../../runtime/definePreset';
import type { ProtocolContext, RuntimeCommand, RuntimeProtocol } from '../../runtime/types';
import {
  extractAssistantMessageId,
  extractAssistantText,
  extractErrorMessage,
  extractExecutedTools,
  extractHandoffId,
  extractHandoffTarget,
  extractRequestedTools,
  extractSummaryTools,
  extractStopReason,
  extractToolName,
  extractToolResult,
  isAutoGenHandoffStop,
  isAssistantEvent,
  isUserEvent,
  normalizeAutoGenEventName
} from './packet';
import { resolveToolRenderer } from './resolvers';
import {
  abortCurrentStream,
  buildToolData,
  closeCurrentStream,
  consumePendingTool,
  createAutoGenSessionState,
  disposeRunSession,
  ensureAssistantMessageSegment,
  ensurePendingTool,
  ensureRunSession,
  ensureRunStarted,
  ensureToolStarted,
  hasFinalizedAssistantMessage,
  hasFinishedTool,
  markAssistantMessageFinalized,
  markToolFinished,
  resetAutoGenSessionState
} from './session';
import type {
  AutoGenEvent,
  AutoGenPresetOptions,
  AutoGenProtocolOptions
} from './types';

/**
 * 生成 AutoGen HITL approval block 的稳定 id。
 */
function createAutoGenApprovalBlockId(
  packet: AutoGenEvent,
  context: ProtocolContext
): string {
  const handoffId = extractHandoffId(packet);

  return handoffId !== undefined
    ? `block:approval:${handoffId}`
    : context.makeId('autogen-approval');
}

/**
 * 读取 AutoGen HITL approval block 的标题。
 */
function resolveAutoGenApprovalTitle(packet: AutoGenEvent): string {
  const target = extractHandoffTarget(packet);

  if (target === 'human') {
    return '等待人工确认';
  }

  return target !== undefined
    ? `等待 ${target} 确认`
    : '等待确认';
}

/**
 * 把 AutoGen handoff 目标映射成内置 handoff target 类型。
 */
function resolveAutoGenHandoffTargetType(packet: AutoGenEvent): string {
  const target = extractHandoffTarget(packet)?.trim().toLowerCase();

  if (target === 'human') {
    return 'human';
  }

  if (target?.includes('team')) {
    return 'team';
  }

  if (target?.includes('system')) {
    return 'system';
  }

  return 'agent';
}

/**
 * 创建一次 AutoGen 事件到 RuntimeCommand 的映射协议。
 *
 * 当前按真实 `run_stream()` 事件工作：
 * - `ModelClientStreamingChunkEvent` 映射 assistant markdown 流式文本
 * - `ThoughtEvent` / assistant `TextMessage` 作为流式缺失时的兜底完整消息
 * - `ToolCallRequestEvent` / `ToolCallExecutionEvent` 映射工具卡片
 * - `TaskResult` 结束整次 run
 */
export function createAutoGenProtocol(
  options: AutoGenProtocolOptions = {}
): RuntimeProtocol<AutoGenEvent> {
  const state = createAutoGenSessionState();
  let activeRunId: string | null = null;

  return {
    map({ packet, context }) {
      const commands: RuntimeCommand[] = [];

      if (options.recordEvents) {
        commands.push(cmd.event.record(packet));
      }

      const runId = activeRunId ?? context.makeId('autogen-run');
      const session = ensureRunSession(state, runId, packet, context, options);
      const eventName = normalizeAutoGenEventName(packet.type);

      activeRunId = runId;

      switch (eventName) {
        case 'text_message':
          if (isUserEvent(packet)) {
            break;
          }

          if (!isAssistantEvent(packet)) {
            break;
          }

          {
            const content = extractAssistantText(packet);
            const messageId = extractAssistantMessageId(packet);

            if (!content || hasFinalizedAssistantMessage(session, messageId)) {
              break;
            }

            ensureRunStarted(state, session, packet, context, commands, options);

            if (session.streamOpen && session.segmentHasContent) {
              closeCurrentStream(session, commands, {
                advanceSegment: true
              });
            }

            ensureAssistantMessageSegment(session, messageId, commands, options);
            commands.push(cmd.content.append(session.streamId, content));
            session.segmentHasContent = true;
            markAssistantMessageFinalized(session, messageId);
            closeCurrentStream(session, commands);
          }
          break;
        case 'model_client_streaming_chunk_event': {
          const content = extractAssistantText(packet);
          const messageId = extractAssistantMessageId(packet);

          if (!content || !isAssistantEvent(packet)) {
            break;
          }

          ensureRunStarted(state, session, packet, context, commands, options);
          ensureAssistantMessageSegment(session, messageId, commands, options);
          commands.push(cmd.content.append(session.streamId, content));
          session.segmentHasContent = true;
          break;
        }
        case 'thought_event': {
          const content = extractAssistantText(packet);
          const messageId = extractAssistantMessageId(packet);

          if (!content || !isAssistantEvent(packet)) {
            break;
          }

          ensureRunStarted(state, session, packet, context, commands, options);

          if (session.streamOpen && session.segmentHasContent && session.activeAssistantMessageId === messageId) {
            markAssistantMessageFinalized(session, messageId);
            break;
          }

          if (hasFinalizedAssistantMessage(session, messageId)) {
            break;
          }

          if (session.streamOpen && session.segmentHasContent) {
            closeCurrentStream(session, commands, {
              advanceSegment: true
            });
          }

          ensureAssistantMessageSegment(session, messageId, commands, options);
          commands.push(cmd.content.append(session.streamId, content));
          session.segmentHasContent = true;
          markAssistantMessageFinalized(session, messageId);
          break;
        }
        case 'tool_call_request_event': {
          const tools = extractRequestedTools(packet);

          ensureRunStarted(state, session, packet, context, commands, options);
          closeCurrentStream(session, commands, {
            advanceSegment: true
          });

          for (const tool of tools) {
            const pendingTool = ensurePendingTool(session, tool);
            ensureToolStarted(session, pendingTool.id, tool, packet, context, commands, options);
          }
          break;
        }
        case 'tool_call_execution_event': {
          const tools = extractExecutedTools(packet);

          ensureRunStarted(state, session, packet, context, commands, options);

          for (const tool of tools) {
            const pendingTool = consumePendingTool(session, tool);

            if (hasFinishedTool(session, pendingTool.id)) {
              continue;
            }

            ensureToolStarted(session, pendingTool.id, tool, packet, context, commands, options);
            const errorMessage = tool.is_error ? extractErrorMessage(packet) : undefined;
            commands.push(
              ...cmd.tool.finish({
                id: pendingTool.id,
                title: extractToolName(tool) ?? pendingTool.name ?? '工具调用',
                renderer: resolveToolRenderer(session.runId, pendingTool.id, tool, packet, context, options),
                result: extractToolResult(packet, tool),
                status: tool.is_error ? 'error' : 'done',
                data: buildToolData(packet, tool),
                ...(errorMessage ? { message: errorMessage } : {}),
                at: context.now()
              })
            );
            markToolFinished(session, pendingTool.id);
          }
          break;
        }
        case 'tool_call_summary_message': {
          const tools = extractSummaryTools(packet);

          ensureRunStarted(state, session, packet, context, commands, options);

          for (const tool of tools) {
            const pendingTool = consumePendingTool(session, tool);

            if (hasFinishedTool(session, pendingTool.id)) {
              continue;
            }

            ensureToolStarted(session, pendingTool.id, tool, packet, context, commands, options);
            const errorMessage = tool.is_error ? extractErrorMessage(packet) : undefined;
            commands.push(
              ...cmd.tool.finish({
                id: pendingTool.id,
                title: extractToolName(tool) ?? pendingTool.name ?? '工具调用',
                renderer: resolveToolRenderer(session.runId, pendingTool.id, tool, packet, context, options),
                result: extractToolResult(packet, tool),
                status: tool.is_error ? 'error' : 'done',
                data: buildToolData(packet, tool),
                ...(errorMessage ? { message: errorMessage } : {}),
                at: context.now()
              })
            );
            markToolFinished(session, pendingTool.id);
          }
          break;
        }
        case 'handoff_message': {
          const target = extractHandoffTarget(packet);
          const message = extractAssistantText(packet);
          const handoffId = extractHandoffId(packet);

          ensureRunStarted(state, session, packet, context, commands, options);
          closeCurrentStream(session, commands, {
            advanceSegment: true
          });
          session.interrupted = true;
          commands.push(cmd.approval.upsert({
            id: createAutoGenApprovalBlockId(packet, context),
            role: 'assistant',
            title: resolveAutoGenApprovalTitle(packet),
            status: 'pending',
            ...(handoffId
              ? {
                  approvalId: handoffId
                }
              : {}),
            ...(message
              ? {
                  message
                }
              : {}),
            refId: session.runId,
            ...(session.groupId !== undefined ? { groupId: session.groupId } : {}),
            ...(session.conversationId !== undefined ? { conversationId: session.conversationId } : {}),
            ...(session.turnId !== undefined ? { turnId: session.turnId } : {}),
            ...(session.messageId !== undefined ? { messageId: session.messageId } : {}),
            data: {
              rawEvent: packet,
              ...(handoffId
                ? {
                    handoffId
                  }
                : {}),
              targetType: resolveAutoGenHandoffTargetType(packet),
              ...(target
                ? {
                    target,
                    assignee: target
                  }
                : {}),
              ...(packet.context
                ? {
                    context: packet.context
                  }
                : {})
            },
            at: context.now()
          }));
          break;
        }
        case 'task_result':
          ensureRunStarted(state, session, packet, context, commands, options);
          closeCurrentStream(session, commands);
          session.interrupted = session.interrupted || isAutoGenHandoffStop(packet);

          commands.push(
            cmd.run.finish({
              id: session.runId,
              ...(session.title ? { title: session.title } : {}),
              ...(session.interrupted
                ? {
                    status: 'paused',
                    message: 'AutoGen 正在等待人工继续。'
                  }
                : {}),
              data: {
                rawEvent: packet,
                stopReason: extractStopReason(packet)
              },
              at: context.now()
            })
          );

          disposeRunSession(state, session);

          if (activeRunId === session.runId) {
            activeRunId = null;
          }
          break;
        case 'error_event':
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
          break;
        default:
          break;
      }

      return commands;
    },
    reset() {
      resetAutoGenSessionState(state);
      activeRunId = null;
    }
  };
}

/**
 * 为 AutoGen 事件流创建一个开箱即用的 preset。
 */
export function defineAutoGenPreset<
  TSource = AsyncIterable<AutoGenEvent> | Iterable<AutoGenEvent>
>(options: AutoGenPresetOptions<TSource> = {}): AgentdownPreset<AutoGenEvent, TSource> {
  return defineAgentdownPreset<AutoGenEvent, TSource>({
    ...options,
    protocol: options.protocol ?? createAutoGenProtocol(options.protocolOptions),
    assemblers: {
      markdown: createMarkdownAssembler(),
      ...(options.assemblers ?? {})
    }
  });
}
