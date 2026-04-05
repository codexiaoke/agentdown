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
  LangChainPresetOptions,
  LangChainProtocolOptions
} from './types';

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
