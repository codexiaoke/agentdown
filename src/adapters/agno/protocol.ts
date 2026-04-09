import { createMarkdownAssembler } from '../../runtime/assemblers';
import { cmd } from '../../runtime/defineProtocol';
import {
  defineAgentdownPreset,
  type AgentdownPreset
} from '../../runtime/definePreset';
import type { RuntimeCommand, RuntimeProtocol } from '../../runtime/types';
import {
  extractContent,
  extractErrorMessage,
  extractExplicitRunId,
  extractRequirementApprovalStatus,
  extractRequirementId,
  extractRequirementMessage,
  extractRequirementTitle,
  extractRequirementTool,
  extractRequirements,
  extractTool,
  extractToolName,
  extractToolResult,
  extractTools,
  isPendingConfirmationRequirement,
  normalizeAgnoEventName
} from './packet';
import {
  abortCurrentStream,
  buildToolData,
  closeCurrentStream,
  consumePendingTool,
  createAgnoSessionState,
  disposeRunSession,
  ensurePendingTool,
  ensureRunSession,
  ensureRunStarted,
  ensureToolStarted,
  resetAgnoSessionState,
  createStreamOpenCommands
} from './session';
import { resolveToolRenderer } from './resolvers';
import type {
  AgnoEvent,
  AgnoRequirementPayload,
  AgnoPresetOptions,
  AgnoProtocolOptions
} from './types';

/**
 * 基于 requirement id 生成默认 approval block id。
 */
function createRequirementApprovalBlockId(requirementId: string): string {
  return `block:approval:${requirementId}`;
}

/**
 * 基于 run id 生成默认错误 block id。
 */
function createAgnoRunErrorBlockId(runId: string): string {
  return `block:error:${runId}`;
}

/**
 * 把 `RunPaused` 里的 confirmation requirement 映射成 approval block。
 */
function appendPausedRequirementCommands(
  session: ReturnType<typeof ensureRunSession>,
  packet: AgnoEvent,
  requirement: AgnoRequirementPayload,
  context: Parameters<NonNullable<RuntimeProtocol<AgnoEvent>['map']>>[0]['context'],
  commands: RuntimeCommand[],
  options: AgnoProtocolOptions
) {
  const requirementId = extractRequirementId(requirement);

  if (!requirementId || !isPendingConfirmationRequirement(requirement)) {
    return;
  }

  const tool = extractRequirementTool(requirement);
  const pendingTool = ensurePendingTool(session, tool);
  const approvalBlockId = createRequirementApprovalBlockId(requirementId);
  const approvalMessage = extractRequirementMessage(requirement);

  ensureToolStarted(session, pendingTool.id, tool, packet, context, commands, options, 'pending');
  commands.push(
    ...cmd.tool.update({
      id: pendingTool.id,
      title: extractToolName(tool) ?? pendingTool.name ?? '工具调用',
      renderer: resolveToolRenderer(session.runId, pendingTool.id, tool, packet, context, options),
      status: 'pending',
      data: {
        ...buildToolData(packet, tool),
        requirementId,
        requirement,
        runId: session.runId
      },
      at: context.now()
    }),
    cmd.approval.update({
      id: approvalBlockId,
      role: 'assistant',
      slot: options.slot ?? 'main',
      title: extractRequirementTitle(requirement) ?? '等待人工确认',
      ...(approvalMessage ? { message: approvalMessage } : {}),
      approvalId: requirementId,
      status: extractRequirementApprovalStatus(requirement),
      refId: session.runId,
      ...(session.groupId !== undefined ? { groupId: session.groupId } : {}),
      ...(session.conversationId !== undefined ? { conversationId: session.conversationId } : {}),
      ...(session.turnId !== undefined ? { turnId: session.turnId } : {}),
      ...(session.messageId !== undefined ? { messageId: session.messageId } : {}),
      data: {
        rawEvent: packet,
        runId: session.runId,
        requirementId,
        toolId: pendingTool.id,
        requirement,
        tool
      },
      at: context.now()
    })
  );
}

/**
 * 创建一次 Agno 事件到 RuntimeCommand 的映射协议。
 *
 * 默认映射关系：
 * - `RunStarted` -> `cmd.run.start`
 * - `RunContent` -> `cmd.content.append`
 * - `ToolCallStarted` -> 关闭当前文本分段 + `cmd.tool.start`
 * - `ToolCallCompleted` -> `cmd.tool.finish`
 * - `RunCompleted` -> 关闭当前文本分段 + `cmd.run.finish`
 * - `RunError` / `Error` -> `cmd.node.error` + `cmd.run.finish`
 *
 * 用户通常只需要改 `AgnoProtocolOptions`：
 * - 想改工具组件映射，用 `toolRenderer`
 * - 想改消息分组 / block id / stream id，用 `groupId` / `blockId` / `streamId`
 * - 想换内容组装器，用 `streamAssembler`
 */
export function createAgnoProtocol(options: AgnoProtocolOptions = {}): RuntimeProtocol<AgnoEvent> {
  const state = createAgnoSessionState();
  let activeRunId: string | null = null;

  return {
    map({ packet, context }) {
      const commands: RuntimeCommand[] = [];

      if (options.recordEvents) {
        commands.push(cmd.event.record(packet));
      }

      const explicitRunId = extractExplicitRunId(packet);
      const runId = explicitRunId ?? activeRunId ?? context.makeId('agno-run');
      const session = ensureRunSession(state, runId, packet, context, options);
      const eventName = normalizeAgnoEventName(packet.event);

      activeRunId = runId;

      switch (eventName) {
        case 'run_started':
          // 建立 run 节点；如果配置了自动打开流，这里也会生成一个 draft block。
          ensureRunStarted(state, session, packet, context, commands, options);
          break;
        case 'run_content': {
          const content = extractContent(packet);

          // 文本始终追加到“当前分段”里；如果 tool 刚刚开始过，这里会自动落到新的分段。
          ensureRunStarted(state, session, packet, context, commands, options);
          commands.push(...createStreamOpenCommands(session, options));

          if (content) {
            commands.push(cmd.content.append(session.streamId, content));
            session.segmentHasContent = true;
          }
          break;
        }
        case 'run_content_completed':
          // 明确告诉 runtime：当前 assistant 文本分段已经结束。
          ensureRunStarted(state, session, packet, context, commands, options);
          closeCurrentStream(session, commands);
          break;
        case 'tool_call_started': {
          const tool = extractTool(packet);
          const pendingTool = ensurePendingTool(session, tool);

          // 关键点：工具开始前先把当前文本段关闭，避免后续文本继续拼到前一段里。
          ensureRunStarted(state, session, packet, context, commands, options);
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
        case 'tool_call_completed': {
          const tool = extractTool(packet);
          const pendingTool = consumePendingTool(session, tool);

          // tool.finish 只更新工具块自身，后续新的 run_content 会落到下一个文本段。
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
        case 'run_completed': {
          // run 结束时收尾当前文本流，并把 run 标记成 done。
          ensureRunStarted(state, session, packet, context, commands, options);
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
          break;
        }
        case 'run_paused': {
          // Agno 真正的人机交互入口：run 进入 paused，并暴露 active requirements。
          ensureRunStarted(state, session, packet, context, commands, options);
          closeCurrentStream(session, commands);

          commands.push(
            cmd.node.patch(session.runId, {
              status: 'blocked',
              message: extractContent(packet) ?? '等待人工确认后继续执行。',
              updatedAt: context.now(),
              data: {
                rawEvent: packet
              }
            })
          );

          for (const tool of extractTools(packet)) {
            const pendingTool = ensurePendingTool(session, tool);

            ensureToolStarted(session, pendingTool.id, tool, packet, context, commands, options, 'pending');
            commands.push(
              ...cmd.tool.update({
                id: pendingTool.id,
                title: extractToolName(tool) ?? pendingTool.name ?? '工具调用',
                renderer: resolveToolRenderer(session.runId, pendingTool.id, tool, packet, context, options),
                status: 'pending',
                data: buildToolData(packet, tool),
                at: context.now()
              })
            );
          }

          for (const requirement of extractRequirements(packet)) {
            appendPausedRequirementCommands(session, packet, requirement, context, commands, options);
          }
          break;
        }
        case 'run_continued':
          // requirement 被处理后，run 会重新回到 running 状态。
          ensureRunStarted(state, session, packet, context, commands, options);
          {
            const nextPatch: Parameters<typeof cmd.node.patch>[1] = {
              status: 'running',
              updatedAt: context.now(),
              data: {
                rawEvent: packet
              }
            };

            commands.push(cmd.node.patch(session.runId, nextPatch));
          }
          break;
        case 'run_cancelled': {
          // 取消场景要先中止打开中的流，再结束 run。
          ensureRunStarted(state, session, packet, context, commands, options);
          abortCurrentStream(session, commands, extractErrorMessage(packet));

          commands.push(
            cmd.run.finish({
              id: session.runId,
              ...(session.title ? { title: session.title } : {}),
              message: extractErrorMessage(packet),
              status: 'cancelled',
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
        case 'run_error':
        case 'error': {
          // 错误场景除了结束 run，还会额外给 run 节点打一条 error 意图。
          ensureRunStarted(state, session, packet, context, commands, options);
          const errorMessage = extractErrorMessage(packet);

          abortCurrentStream(session, commands, errorMessage);

          commands.push(
            cmd.error.upsert({
              id: createAgnoRunErrorBlockId(session.runId),
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
        default:
          break;
      }

      return commands;
    },
    reset() {
      resetAgnoSessionState(state);
      activeRunId = null;
    }
  };
}

/**
 * 为 Agno 事件流创建一个开箱即用的 preset。
 *
 * 这个 preset 默认内置：
 * - Agno protocol
 * - markdown assembler
 *
 * 所以大多数接入只需要配置 `protocolOptions` 和 `renderers`。
 */
export function defineAgnoPreset<
  TSource = AsyncIterable<AgnoEvent> | Iterable<AgnoEvent>
>(options: AgnoPresetOptions<TSource> = {}): AgentdownPreset<AgnoEvent, TSource> {
  return defineAgentdownPreset<AgnoEvent, TSource>({
    ...options,
    protocol: options.protocol ?? createAgnoProtocol(options.protocolOptions),
    assemblers: {
      markdown: createMarkdownAssembler(),
      ...(options.assemblers ?? {})
    }
  });
}
