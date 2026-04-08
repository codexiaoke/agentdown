import { createMarkdownAssembler } from '../../runtime/assemblers';
import { cmd } from '../../runtime/defineProtocol';
import {
  defineAgentdownPreset,
  type AgentdownPreset
} from '../../runtime/definePreset';
import type { ProtocolContext, RuntimeCommand, RuntimeProtocol } from '../../runtime/types';
import {
  extractContent,
  extractErrorMessage,
  extractExplicitRunId,
  extractInterrupts,
  extractTool,
  extractToolName,
  extractToolResult,
  isRootChainEnd,
  isRootChainStart,
  normalizeLangChainEventName
} from './packet';
import { resolveToolRenderer } from './resolvers';
import {
  abortCurrentStream,
  buildToolData,
  closeCurrentStream,
  consumePendingTool,
  createLangChainSessionState,
  createStreamOpenCommands,
  disposeRunSession,
  ensurePendingTool,
  ensureRunSession,
  ensureRunStarted,
  ensureToolStarted,
  resetLangChainSessionState
} from './session';
import type {
  LangChainEvent,
  LangChainInterruptActionRequest,
  LangChainInterruptPayload,
  LangChainInterruptReviewConfig,
  LangChainPresetOptions,
  LangChainProtocolOptions
} from './types';

/**
 * 基于 interrupt id 和索引生成默认 approval block id。
 */
function createLangChainApprovalBlockId(interruptId: string, index: number): string {
  return `block:approval:${interruptId}:${index}`;
}

/**
 * 读取 interrupt request 对应的标题。
 */
function resolveLangChainApprovalTitle(
  actionRequest: LangChainInterruptActionRequest | undefined
): string {
  const name = typeof actionRequest?.name === 'string'
    ? actionRequest.name
    : '';

  return name.length > 0
    ? `工具调用确认：${name}`
    : '工具调用确认';
}

/**
 * 读取 interrupt request 最适合直接展示给用户的说明文案。
 */
function resolveLangChainApprovalMessage(
  actionRequest: LangChainInterruptActionRequest | undefined,
  index: number,
  total: number
): string {
  if (typeof actionRequest?.description === 'string' && actionRequest.description.length > 0) {
    return actionRequest.description;
  }

  const name = typeof actionRequest?.name === 'string'
    ? actionRequest.name
    : '工具调用';

  if (total <= 1) {
    return `LangChain 正在等待你确认是否执行 ${name}。`;
  }

  return `LangChain 正在等待你确认第 ${index + 1} / ${total} 个工具调用：${name}。`;
}

/**
 * 读取当前 interrupt request 允许的决策列表。
 */
function resolveLangChainAllowedDecisions(
  reviewConfig: LangChainInterruptReviewConfig | undefined
): string[] {
  return Array.isArray(reviewConfig?.allowed_decisions)
    ? reviewConfig.allowed_decisions.filter((item): item is string => (
      typeof item === 'string' && item.length > 0
    ))
    : [];
}

/**
 * 把 LangChain interrupt 映射成一组 approval block。
 */
function createLangChainInterruptCommands(
  interrupt: LangChainInterruptPayload,
  session: ReturnType<typeof ensureRunSession>,
  context: ProtocolContext,
  options: LangChainProtocolOptions
): RuntimeCommand[] {
  const interruptId = typeof interrupt.id === 'string' && interrupt.id.length > 0
    ? interrupt.id
    : context.makeId('langchain-interrupt');
  const value = interrupt.value;
  const actionRequests = Array.isArray(value?.action_requests)
    ? value.action_requests
    : [];
  const reviewConfigs = Array.isArray(value?.review_configs)
    ? value.review_configs
    : [];

  return actionRequests.map((actionRequest, index) => {
    const reviewConfig = reviewConfigs[index];
    const allowedDecisions = resolveLangChainAllowedDecisions(reviewConfig);
    const approvalId = `${interruptId}:${index}`;

    return cmd.approval.update({
      id: createLangChainApprovalBlockId(interruptId, index),
      role: 'assistant',
      slot: options.slot ?? 'main',
      title: resolveLangChainApprovalTitle(actionRequest),
      message: resolveLangChainApprovalMessage(actionRequest, index, actionRequests.length),
      approvalId,
      refId: interruptId,
      status: 'pending',
      ...(session.groupId !== undefined ? { groupId: session.groupId } : {}),
      ...(session.conversationId !== undefined ? { conversationId: session.conversationId } : {}),
      ...(session.turnId !== undefined ? { turnId: session.turnId } : {}),
      ...(session.messageId !== undefined ? { messageId: session.messageId } : {}),
      data: {
        rawEvent: interrupt,
        interruptId,
        interruptIndex: index,
        interruptCount: actionRequests.length,
        actionRequest,
        reviewConfig,
        toolName: actionRequest?.name,
        toolArgs: actionRequest?.args,
        allowedDecisions
      },
      at: context.now()
    });
  });
}

/**
 * 创建一次 LangChain 事件到 RuntimeCommand 的映射协议。
 *
 * 这里直接消费官方 `astream_events(version="v2")` 事件：
 * - 根 `on_chain_start` / `on_chain_end` 映射 run 生命周期
 * - `on_chat_model_stream` 映射 assistant markdown 增量
 * - `on_tool_start` / `on_tool_end` 映射工具卡片
 *
 * 为了避免文本被整段拼接到一起，工具开始前会先关闭当前文本分段。
 */
export function createLangChainProtocol(
  options: LangChainProtocolOptions = {}
): RuntimeProtocol<LangChainEvent> {
  const state = createLangChainSessionState();
  let activeRunId: string | null = null;

  return {
    map({ packet, context }) {
      const commands: RuntimeCommand[] = [];

      if (options.recordEvents) {
        commands.push(cmd.event.record(packet));
      }

      const explicitRunId = extractExplicitRunId(packet);
      const runId = explicitRunId ?? activeRunId ?? context.makeId('langchain-run');
      const session = ensureRunSession(state, runId, packet, context, options);
      const eventName = normalizeLangChainEventName(packet.event);

      activeRunId = runId;

      switch (eventName) {
        case 'on_chain_start':
          if (isRootChainStart(packet)) {
            ensureRunStarted(state, session, packet, context, commands, options);
          }
          break;
        case 'on_chat_model_stream': {
          const content = extractContent(packet);

          ensureRunStarted(state, session, packet, context, commands, options);

          if (!content) {
            break;
          }

          commands.push(...createStreamOpenCommands(session, options));
          commands.push(cmd.content.append(session.streamId, content));
          session.segmentHasContent = true;
          break;
        }
        case 'on_chain_stream': {
          const interrupts = extractInterrupts(packet);

          if (interrupts.length === 0) {
            break;
          }

          ensureRunStarted(state, session, packet, context, commands, options);
          closeCurrentStream(session, commands, {
            advanceSegment: true
          });
          session.interrupted = true;

          for (const interrupt of interrupts) {
            commands.push(...createLangChainInterruptCommands(interrupt, session, context, options));
          }

          break;
        }
        case 'on_tool_start': {
          const tool = extractTool(packet);
          const pendingTool = ensurePendingTool(session, tool);

          ensureRunStarted(state, session, packet, context, commands, options);
          closeCurrentStream(session, commands, {
            advanceSegment: true
          });
          ensureToolStarted(session, pendingTool.id, tool, packet, context, commands, options);
          break;
        }
        case 'on_tool_end': {
          const tool = extractTool(packet);
          const pendingTool = consumePendingTool(session, tool);

          ensureRunStarted(state, session, packet, context, commands, options);
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
        case 'on_tool_error': {
          const tool = extractTool(packet);
          const pendingTool = consumePendingTool(session, tool);

          ensureRunStarted(state, session, packet, context, commands, options);
          ensureToolStarted(session, pendingTool.id, tool, packet, context, commands, options);
          commands.push(
            ...cmd.tool.finish({
              id: pendingTool.id,
              title: extractToolName(tool) ?? pendingTool.name ?? '工具调用',
              renderer: resolveToolRenderer(session.runId, pendingTool.id, tool, packet, context, options),
              message: extractErrorMessage(packet),
              status: 'error',
              data: buildToolData(packet, tool),
              at: context.now()
            })
          );
          break;
        }
        case 'on_chain_end':
          if (isRootChainEnd(packet)) {
            ensureRunStarted(state, session, packet, context, commands, options);
            closeCurrentStream(session, commands);

            commands.push(
              cmd.run.finish({
                id: session.runId,
                ...(session.title ? { title: session.title } : {}),
                ...(session.interrupted
                  ? {
                      status: 'paused',
                      message: 'LangChain 正在等待人工确认。'
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
          }
          break;
        case 'error': {
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
        }
        default:
          break;
      }

      return commands;
    },
    reset() {
      resetLangChainSessionState(state);
      activeRunId = null;
    }
  };
}

/**
 * 为 LangChain 事件流创建一个开箱即用的 preset。
 */
export function defineLangChainPreset<
  TSource = AsyncIterable<LangChainEvent> | Iterable<LangChainEvent>
>(options: LangChainPresetOptions<TSource> = {}): AgentdownPreset<LangChainEvent, TSource> {
  return defineAgentdownPreset<LangChainEvent, TSource>({
    ...options,
    protocol: options.protocol ?? createLangChainProtocol(options.protocolOptions),
    assemblers: {
      markdown: createMarkdownAssembler(),
      ...(options.assemblers ?? {})
    }
  });
}
