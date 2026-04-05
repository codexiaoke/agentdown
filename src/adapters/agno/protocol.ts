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
  extractTool,
  extractToolName,
  extractToolResult,
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
  AgnoPresetOptions,
  AgnoProtocolOptions
} from './types';

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
