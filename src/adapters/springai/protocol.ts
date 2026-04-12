import { createMarkdownAssembler } from '../../runtime/assemblers';
import { cmd } from '../../runtime/defineProtocol';
import {
  defineAgentdownPreset,
  type AgentdownPreset
} from '../../runtime/definePreset';
import type { ProtocolContext, RuntimeCommand, RuntimeProtocol } from '../../runtime/types';
import {
  extractApproval,
  extractContent,
  extractErrorMessage,
  extractExplicitRunId,
  extractReasonRequiredDecisions,
  extractRunStatus,
  extractTool,
  extractToolName,
  extractToolResult,
  normalizeSpringAiEventName
} from './packet';
import { resolveToolRenderer } from './resolvers';
import {
  abortCurrentStream,
  buildToolData,
  closeCurrentStream,
  consumePendingTool,
  createSpringAiSessionState,
  createStreamOpenCommands,
  disposeRunSession,
  ensurePendingTool,
  ensureRunSession,
  ensureRunStarted,
  ensureToolStarted,
  resetSpringAiSessionState,
  syncResponseScope
} from './session';
import type {
  SpringAiApprovalActionRequest,
  SpringAiApprovalPayload,
  SpringAiEvent,
  SpringAiPresetOptions,
  SpringAiProtocolOptions,
  SpringAiToolPayload
} from './types';

/**
 * 去掉首尾空白，用于比较最终文本是否已经被流式输出过。
 */
function trimComparableText(value: string): string {
  return value.trim();
}

/**
 * 基于 requirement id 和索引生成默认 approval block id。
 */
function createSpringAiApprovalBlockId(
  interruptId: string,
  actionRequest: SpringAiApprovalActionRequest | undefined,
  index: number
): string {
  const requirementId = typeof actionRequest?.requirement_id === 'string'
    ? actionRequest.requirement_id
    : '';

  return requirementId.length > 0
    ? `block:approval:${requirementId}`
    : `block:approval:${interruptId}:${index}`;
}

/**
 * 基于 run id 生成默认错误 block id。
 */
function createSpringAiRunErrorBlockId(runId: string): string {
  return `block:error:${runId}`;
}

/**
 * 读取 approval request 的标题。
 */
function resolveSpringAiApprovalTitle(
  actionRequest: SpringAiApprovalActionRequest | undefined
): string {
  const name = typeof actionRequest?.name === 'string'
    ? actionRequest.name
    : '';

  return name.length > 0
    ? `工具调用确认：${name}`
    : '工具调用确认';
}

/**
 * 读取 approval request 最适合直接展示给用户的说明文案。
 */
function resolveSpringAiApprovalMessage(
  actionRequest: SpringAiApprovalActionRequest | undefined,
  index: number,
  total: number
): string {
  const name = typeof actionRequest?.name === 'string'
    ? actionRequest.name
    : '工具调用';

  if (total <= 1) {
    return `Spring AI 正在等待你确认是否执行 ${name}。`;
  }

  return `Spring AI 正在等待你确认第 ${index + 1} / ${total} 个工具调用：${name}。`;
}

/**
 * 读取当前 approval request 允许的决策列表。
 */
function resolveSpringAiAllowedDecisions(
  actionRequest: SpringAiApprovalActionRequest | undefined
): string[] {
  return Array.isArray(actionRequest?.allowed_decisions)
    ? actionRequest.allowed_decisions.filter((item): item is string => (
      typeof item === 'string' && item.length > 0
    ))
    : [];
}

/**
 * 把 approval request 映射成一个统一工具载荷，方便复用工具卡片。
 */
function createSyntheticApprovalTool(
  actionRequest: SpringAiApprovalActionRequest | undefined
): SpringAiToolPayload {
  return {
    ...(typeof actionRequest?.tool_call_id === 'string'
      ? {
          tool_call_id: actionRequest.tool_call_id
        }
      : {}),
    ...(typeof actionRequest?.name === 'string'
      ? {
          tool_name: actionRequest.name
        }
      : {}),
    ...(actionRequest?.args
      ? {
          tool_args: actionRequest.args
        }
      : {})
  };
}

/**
 * 把最终 `response.completed` 文本补齐到当前消息里。
 */
function syncCompletedAssistantText(
  session: ReturnType<typeof ensureRunSession>,
  finalText: string | undefined,
  commands: RuntimeCommand[],
  options: SpringAiProtocolOptions
): void {
  if (!finalText) {
    return;
  }

  const comparableFinalText = trimComparableText(finalText);

  if (comparableFinalText.length === 0) {
    return;
  }

  if (trimComparableText(session.currentMessageText) === comparableFinalText) {
    return;
  }

  if (
    session.streamOpen
    && session.currentMessageText.length > 0
    && finalText.startsWith(session.currentMessageText)
  ) {
    const remainingText = finalText.slice(session.currentMessageText.length);

    if (remainingText.length > 0) {
      commands.push(cmd.content.append(session.streamId, remainingText));
      session.currentMessageText += remainingText;
      session.segmentHasContent = true;
    }
    return;
  }

  if (trimComparableText(session.currentMessageText).length === 0) {
    commands.push(...createStreamOpenCommands(session, options));
    commands.push(cmd.content.append(session.streamId, finalText));
    session.currentMessageText = finalText;
    session.segmentHasContent = true;
    return;
  }

  if (session.streamOpen) {
    closeCurrentStream(session, commands);
  }

  commands.push(cmd.content.replace({
    id: session.blockId,
    role: 'assistant',
    slot: options.slot ?? 'main',
    nodeId: session.runId,
    ...{
      ...(session.groupId !== undefined ? { groupId: session.groupId } : {}),
      ...(session.conversationId !== undefined ? { conversationId: session.conversationId } : {}),
      ...(session.turnId !== undefined ? { turnId: session.turnId } : {}),
      ...(session.messageId !== undefined ? { messageId: session.messageId } : {})
    },
    content: finalText,
    kind: 'markdown',
    data: {
      blockId: session.blockId
    }
  }));
  session.currentMessageText = finalText;
}

/**
 * 把 Spring AI approval payload 映射成一组 approval block 和待执行工具卡片。
 */
function createSpringAiApprovalCommands(
  payload: SpringAiApprovalPayload,
  session: ReturnType<typeof ensureRunSession>,
  packet: SpringAiEvent,
  context: ProtocolContext,
  commands: RuntimeCommand[],
  options: SpringAiProtocolOptions
): void {
  const interruptId = typeof payload.interrupt_id === 'string' && payload.interrupt_id.length > 0
    ? payload.interrupt_id
    : context.makeId('springai-interrupt');
  const actionRequests = Array.isArray(payload.action_requests)
    ? payload.action_requests
    : [];
  const reasonRequiredDecisions = extractReasonRequiredDecisions(payload);

  commands.push(
    cmd.node.patch(session.runId, {
      status: 'blocked',
      message: '等待人工确认后继续执行。',
      updatedAt: context.now(),
      data: {
        rawEvent: packet
      }
    })
  );

  actionRequests.forEach((actionRequest, index) => {
    const syntheticTool = createSyntheticApprovalTool(actionRequest);
    const pendingTool = ensurePendingTool(session, syntheticTool);
    const allowedDecisions = resolveSpringAiAllowedDecisions(actionRequest);

    ensureToolStarted(
      session,
      pendingTool.id,
      syntheticTool,
      packet,
      context,
      commands,
      options,
      'pending'
    );
    commands.push(
      ...cmd.tool.update({
        id: pendingTool.id,
        title: extractToolName(syntheticTool) ?? pendingTool.name ?? '工具调用',
        renderer: resolveToolRenderer(session.runId, pendingTool.id, syntheticTool, packet, context, options),
        status: 'pending',
        data: {
          ...buildToolData(packet, syntheticTool),
          interruptId,
          requirementId: actionRequest.requirement_id,
          assistantText: payload.assistant_text
        },
        at: context.now()
      }),
      cmd.approval.update({
        id: createSpringAiApprovalBlockId(interruptId, actionRequest, index),
        role: 'assistant',
        slot: options.slot ?? 'main',
        title: resolveSpringAiApprovalTitle(actionRequest),
        message: resolveSpringAiApprovalMessage(actionRequest, index, actionRequests.length),
        status: 'pending',
        refId: interruptId,
        ...(typeof actionRequest?.requirement_id === 'string'
          ? {
              approvalId: actionRequest.requirement_id
            }
          : {}),
        ...(session.groupId !== undefined ? { groupId: session.groupId } : {}),
        ...(session.conversationId !== undefined ? { conversationId: session.conversationId } : {}),
        ...(session.turnId !== undefined ? { turnId: session.turnId } : {}),
        ...(session.messageId !== undefined ? { messageId: session.messageId } : {}),
        data: {
          rawEvent: packet,
          interruptId,
          interruptIndex: index,
          interruptCount: actionRequests.length,
          requirementId: actionRequest.requirement_id,
          toolCallId: actionRequest.tool_call_id,
          actionRequest,
          assistantText: payload.assistant_text,
          toolName: actionRequest.name,
          toolArgs: actionRequest.args,
          allowedDecisions,
          reasonRequiredDecisions
        },
        at: context.now()
      })
    );
  });
}

/**
 * 创建一次 Spring AI 事件到 RuntimeCommand 的映射协议。
 */
export function createSpringAiProtocol(
  options: SpringAiProtocolOptions = {}
): RuntimeProtocol<SpringAiEvent> {
  const state = createSpringAiSessionState();
  let activeRunId: string | null = null;

  return {
    map({ packet, context }) {
      const commands: RuntimeCommand[] = [];

      if (options.recordEvents) {
        commands.push(cmd.event.record(packet));
      }

      const normalizedEventName = normalizeSpringAiEventName(packet.event);

      if (normalizedEventName === 'session_created' || normalizedEventName === 'session_resumed') {
        return commands;
      }

      const explicitRunId = extractExplicitRunId(packet);
      const runId = explicitRunId ?? activeRunId ?? context.makeId('springai-run');
      const session = ensureRunSession(state, runId, packet, context, options);

      activeRunId = runId;

      switch (normalizedEventName) {
        case 'run_started':
          ensureRunStarted(state, session, packet, context, commands, options);
          break;
        case 'response_started':
          ensureRunStarted(state, session, packet, context, commands, options);
          closeCurrentStream(session, commands);
          syncResponseScope(session, packet, context, options);

          if (options.openStreamOnResponseStarted ?? true) {
            commands.push(...createStreamOpenCommands(session, options));
          }
          break;
        case 'response_delta': {
          const content = extractContent(packet);

          ensureRunStarted(state, session, packet, context, commands, options);
          syncResponseScope(session, packet, context, options);

          if (!content) {
            break;
          }

          commands.push(...createStreamOpenCommands(session, options));
          commands.push(cmd.content.append(session.streamId, content));
          session.currentMessageText += content;
          session.segmentHasContent = true;
          break;
        }
        case 'response_completed':
          ensureRunStarted(state, session, packet, context, commands, options);
          syncResponseScope(session, packet, context, options);
          syncCompletedAssistantText(session, extractContent(packet), commands, options);
          closeCurrentStream(session, commands);
          break;
        case 'tool_started': {
          const tool = extractTool(packet);
          const pendingTool = ensurePendingTool(session, tool);

          ensureRunStarted(state, session, packet, context, commands, options);
          syncResponseScope(session, packet, context, options);
          closeCurrentStream(session, commands, {
            advanceSegment: true
          });
          ensureToolStarted(session, pendingTool.id, tool, packet, context, commands, options);
          commands.push(
            ...cmd.tool.update({
              id: pendingTool.id,
              title: extractToolName(tool) ?? pendingTool.name ?? '工具调用',
              renderer: resolveToolRenderer(session.runId, pendingTool.id, tool, packet, context, options),
              status: 'running',
              data: buildToolData(packet, tool),
              at: context.now()
            })
          );
          break;
        }
        case 'tool_completed': {
          const tool = extractTool(packet);
          const pendingTool = consumePendingTool(session, tool);

          ensureRunStarted(state, session, packet, context, commands, options);
          syncResponseScope(session, packet, context, options);
          ensureToolStarted(session, pendingTool.id, tool, packet, context, commands, options);
          commands.push(
            ...cmd.tool.finish({
              id: pendingTool.id,
              title: extractToolName(tool) ?? pendingTool.name ?? '工具调用',
              renderer: resolveToolRenderer(session.runId, pendingTool.id, tool, packet, context, options),
              result: extractToolResult(packet, tool),
              data: buildToolData(packet, tool),
              at: context.now()
            })
          );
          break;
        }
        case 'tool_error': {
          const tool = extractTool(packet);
          const pendingTool = consumePendingTool(session, tool);
          const errorMessage = extractErrorMessage(packet);

          ensureRunStarted(state, session, packet, context, commands, options);
          syncResponseScope(session, packet, context, options);
          ensureToolStarted(session, pendingTool.id, tool, packet, context, commands, options);
          commands.push(
            ...cmd.tool.finish({
              id: pendingTool.id,
              title: extractToolName(tool) ?? pendingTool.name ?? '工具调用',
              renderer: resolveToolRenderer(session.runId, pendingTool.id, tool, packet, context, options),
              result: extractToolResult(packet, tool),
              status: 'error',
              data: buildToolData(packet, tool),
              message: errorMessage,
              at: context.now()
            })
          );
          break;
        }
        case 'approval_required': {
          const approval = extractApproval(packet);

          ensureRunStarted(state, session, packet, context, commands, options);
          syncResponseScope(session, packet, context, options);
          closeCurrentStream(session, commands);

          if (approval) {
            createSpringAiApprovalCommands(approval, session, packet, context, commands, options);
          }
          break;
        }
        case 'approval_resolved':
          ensureRunStarted(state, session, packet, context, commands, options);
          syncResponseScope(session, packet, context, options);
          break;
        case 'run_completed': {
          const runStatus = extractRunStatus(packet);

          ensureRunStarted(state, session, packet, context, commands, options);
          closeCurrentStream(session, commands);
          commands.push(
            cmd.run.finish({
              id: session.runId,
              ...(session.title ? { title: session.title } : {}),
              ...(runStatus === 'paused'
                ? {
                    status: 'paused',
                    message: '等待人工确认后继续执行。'
                  }
                : runStatus && runStatus !== 'completed'
                  ? {
                      status: runStatus
                    }
                  : {}),
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
        }
        case 'error': {
          const errorMessage = extractErrorMessage(packet);

          ensureRunStarted(state, session, packet, context, commands, options);
          abortCurrentStream(session, commands, errorMessage);
          commands.push(
            cmd.error.upsert({
              id: createSpringAiRunErrorBlockId(session.runId),
              role: 'assistant',
              slot: options.slot ?? 'main',
              title: '运行失败',
              message: errorMessage,
              refId: session.runId,
              ...(session.groupId !== undefined ? { groupId: session.groupId } : {}),
              ...(session.conversationId !== undefined ? { conversationId: session.conversationId } : {}),
              ...(session.turnId !== undefined ? { turnId: session.turnId } : {}),
              ...(session.messageId !== undefined ? { messageId: session.messageId } : {}),
              data: {
                rawEvent: packet,
                runId: session.runId
              },
              at: context.now()
            }),
            cmd.node.error({
              id: session.runId,
              ...(session.title ? { title: session.title } : {}),
              message: errorMessage,
              data: {
                rawEvent: packet
              },
              at: context.now()
            }),
            cmd.run.finish({
              id: session.runId,
              ...(session.title ? { title: session.title } : {}),
              message: errorMessage,
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
        }
        case 'done':
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
      resetSpringAiSessionState(state);
      activeRunId = null;
    }
  };
}

/**
 * 为 Spring AI 事件流创建一个开箱即用的 preset。
 */
export function defineSpringAiPreset<
  TSource = AsyncIterable<SpringAiEvent> | Iterable<SpringAiEvent>
>(options: SpringAiPresetOptions<TSource> = {}): AgentdownPreset<SpringAiEvent, TSource> {
  return defineAgentdownPreset<SpringAiEvent, TSource>({
    ...options,
    protocol: options.protocol ?? createSpringAiProtocol(options.protocolOptions),
    assemblers: {
      markdown: createMarkdownAssembler(),
      ...(options.assemblers ?? {})
    }
  });
}
