import { EventType, type AGUIEvent } from '@ag-ui/core';
import { A2uiMessageSchema, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { A2UI_SURFACE_RENDERER } from '../../a2ui';
import { cmd } from '../../runtime/defineProtocol';
import type {
  ProtocolContext,
  RuntimeChatSemantics,
  RuntimeCommand,
  RuntimeData
} from '../../runtime/types';
import { createAgUiStateStore } from './state';
import type { AgUiEvent, AgUiProtocol, AgUiProtocolOptions, AgUiValueResolver } from './types';

const DEFAULT_A2UI_EVENT_NAMES = new Set(['a2ui', 'a2ui.message', 'a2ui.surface']);

function resolveValue<T>(
  resolver: AgUiValueResolver<T> | undefined,
  event: AgUiEvent,
  context: ProtocolContext,
  fallback: T
): T {
  if (typeof resolver === 'function') {
    return (resolver as (event: AgUiEvent, context: ProtocolContext) => T)(event, context);
  }
  return resolver === undefined ? fallback : resolver;
}

function eventAt(event: AgUiEvent, context: ProtocolContext): number {
  return typeof event.timestamp === 'number' ? event.timestamp : context.now();
}

function readEventMessageId(event: AgUiEvent): string | undefined {
  return 'messageId' in event && typeof event.messageId === 'string' ? event.messageId : undefined;
}

function readEventDelta(event: AgUiEvent): string | undefined {
  return 'delta' in event && typeof event.delta === 'string' ? event.delta : undefined;
}

function readA2UiSurfaceId(message: A2uiMessage): string {
  if ('createSurface' in message) return message.createSurface.surfaceId;
  if ('updateComponents' in message) return message.updateComponents.surfaceId;
  if ('updateDataModel' in message) return message.updateDataModel.surfaceId;
  return message.deleteSurface.surfaceId;
}

function parseA2UiMessages(value: unknown): A2uiMessage[] {
  const candidates = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && 'messages' in value && Array.isArray(value.messages)
      ? value.messages
      : [value];

  const messages: A2uiMessage[] = [];
  for (const candidate of candidates) {
    const parsed = A2uiMessageSchema.safeParse(candidate);
    if (parsed.success) {
      messages.push(parsed.data as A2uiMessage);
    }
  }
  return messages;
}

function extractA2UiMessages(event: AgUiEvent, names: ReadonlySet<string>): A2uiMessage[] {
  if (event.type === EventType.CUSTOM && names.has(event.name)) {
    return parseA2UiMessages(event.value);
  }
  if (event.type === EventType.RAW) {
    return parseA2UiMessages(event.event);
  }
  return [];
}

function createA2UiBlockId(surfaceId: string): string {
  return `block:a2ui:${surfaceId}`;
}

function createActivityBlockId(messageId: string): string {
  return `block:agui:activity:${messageId}`;
}

/** 将标准 AG-UI event stream 映射为 Agentdown RuntimeCommand。 */
export function createAgUiProtocol(options: AgUiProtocolOptions = {}): AgUiProtocol {
  const store = createAgUiStateStore();
  const openTextStreams = new Set<string>();
  const openReasoningStreams = new Set<string>();
  const toolNames = new Map<string, string>();
  const toolArguments = new Map<string, string>();
  const a2uiSurfaces = new Map<string, A2uiMessage[]>();
  const a2uiNames = options.a2uiEventNames ?? DEFAULT_A2UI_EVENT_NAMES;
  let activeRunId: string | null = null;
  let activeThreadId: string | null = null;
  let activeTextMessageId: string | null = null;
  let activeReasoningMessageId: string | null = null;
  let activeToolCallId: string | null = null;
  let activeThinkingNodeId: string | null = null;

  function semantics(
    event: AgUiEvent,
    context: ProtocolContext,
    messageId?: string
  ): RuntimeChatSemantics & { groupId?: string | null } {
    const conversationId = resolveValue(
      options.conversationId,
      event,
      context,
      activeThreadId
    );
    const turnId = resolveValue(options.turnId, event, context, activeRunId);
    const resolvedMessageId = resolveValue(
      options.messageId,
      event,
      context,
      messageId ?? readEventMessageId(event) ?? null
    );
    const groupId = resolveValue(options.groupId, event, context, turnId);

    return {
      ...(conversationId !== undefined ? { conversationId } : {}),
      ...(turnId !== undefined ? { turnId } : {}),
      ...(resolvedMessageId !== undefined ? { messageId: resolvedMessageId } : {}),
      ...(groupId !== undefined ? { groupId } : {})
    };
  }

  function openText(messageId: string, event: AgUiEvent, context: ProtocolContext): RuntimeCommand[] {
    if (openTextStreams.has(messageId)) return [];
    openTextStreams.add(messageId);
    return [cmd.content.open({
      streamId: `agui:text:${messageId}`,
      slot: options.slot ?? 'main',
      assembler: options.streamAssembler ?? 'markdown',
      nodeId: activeRunId,
      ...semantics(event, context, messageId),
      data: { blockId: `block:agui:message:${messageId}` }
    })];
  }

  function openReasoning(messageId: string, event: AgUiEvent, context: ProtocolContext): RuntimeCommand[] {
    if (openReasoningStreams.has(messageId)) return [];
    openReasoningStreams.add(messageId);
    return [cmd.content.open({
      streamId: `agui:reasoning:${messageId}`,
      slot: options.slot ?? 'main',
      assembler: 'text',
      nodeId: activeRunId,
      ...semantics(event, context, messageId),
      data: {
        blockId: `block:agui:reasoning:${messageId}`,
        blockType: 'reasoning',
        draftRenderer: 'text.draft',
        stableRenderer: 'text',
        blockData: { reasoning: true, title: '思考过程' }
      }
    })];
  }

  function resolveToolRenderer(
    event: AgUiEvent,
    context: ProtocolContext,
    toolCallId: string,
    toolCallName?: string
  ): string | undefined {
    if (typeof options.toolRenderer === 'function') {
      return options.toolRenderer({
        event,
        toolCallId,
        ...(toolCallName !== undefined ? { toolCallName } : {}),
        context
      });
    }
    return options.toolRenderer;
  }

  return {
    store,
    map({ packet, context }) {
      const event = packet as AGUIEvent;
      const commands: RuntimeCommand[] = [];
      const at = eventAt(event, context);

      if (event.type === EventType.RUN_STARTED) {
        openTextStreams.clear();
        openReasoningStreams.clear();
        toolNames.clear();
        toolArguments.clear();
        a2uiSurfaces.clear();
        activeToolCallId = null;
        activeThinkingNodeId = null;
        store.reset();
      }
      store.apply(event);
      if (options.recordEvents) {
        commands.push(cmd.event.record(event as unknown as RuntimeData));
      }

      const a2uiMessages = extractA2UiMessages(event, a2uiNames);
      for (const message of a2uiMessages) {
        const surfaceId = readA2UiSurfaceId(message);
        const blockId = createA2UiBlockId(surfaceId);

        if ('deleteSurface' in message) {
          a2uiSurfaces.delete(surfaceId);
          commands.push(cmd.block.remove(blockId));
          continue;
        }

        const history = 'createSurface' in message
          ? [message]
          : [...(a2uiSurfaces.get(surfaceId) ?? []), message];
        a2uiSurfaces.set(surfaceId, history);
        commands.push(cmd.block.upsert({
          id: blockId,
          slot: options.slot ?? 'main',
          type: 'a2ui',
          renderer: A2UI_SURFACE_RENDERER,
          state: 'stable',
          nodeId: activeRunId,
          ...semantics(event, context, `message:a2ui:${surfaceId}`),
          data: { surfaceId, messages: history },
          createdAt: at,
          updatedAt: at
        }));
      }

      switch (event.type) {
        case EventType.RUN_STARTED:
          activeRunId = event.runId;
          activeThreadId = event.threadId;
          {
            const title = resolveValue(options.defaultRunTitle, event, context, 'AG-UI Agent');
            commands.push(cmd.run.start({
            id: event.runId,
            parentId: event.parentRunId ?? null,
            ...(title !== undefined ? { title } : {}),
            data: { threadId: event.threadId, rawEvent: event as unknown as RuntimeData },
            at
            }));
          }
          break;

        case EventType.TEXT_MESSAGE_START:
          activeTextMessageId = event.messageId;
          commands.push(...openText(event.messageId, event, context));
          break;
        case EventType.TEXT_MESSAGE_CONTENT:
          commands.push(...openText(event.messageId, event, context));
          commands.push(cmd.content.append(`agui:text:${event.messageId}`, event.delta));
          break;
        case EventType.TEXT_MESSAGE_CHUNK: {
          const messageId = event.messageId ?? activeTextMessageId;
          if (messageId) {
            commands.push(...openText(messageId, event, context));
            if (event.delta) commands.push(cmd.content.append(`agui:text:${messageId}`, event.delta));
          }
          break;
        }
        case EventType.TEXT_MESSAGE_END:
          if (openTextStreams.delete(event.messageId)) {
            commands.push(cmd.content.close(`agui:text:${event.messageId}`));
          }
          if (activeTextMessageId === event.messageId) activeTextMessageId = null;
          break;

        case EventType.REASONING_START:
        case EventType.REASONING_MESSAGE_START:
        case EventType.THINKING_TEXT_MESSAGE_START: {
          const messageId = readEventMessageId(event);
          if (messageId) {
            activeReasoningMessageId = messageId;
            commands.push(...openReasoning(messageId, event, context));
          }
          break;
        }
        case EventType.REASONING_MESSAGE_CONTENT:
        case EventType.THINKING_TEXT_MESSAGE_CONTENT: {
          const messageId = readEventMessageId(event);
          const delta = readEventDelta(event);
          if (messageId) {
            commands.push(...openReasoning(messageId, event, context));
            if (delta) commands.push(cmd.content.append(`agui:reasoning:${messageId}`, delta));
          }
          break;
        }
        case EventType.REASONING_MESSAGE_CHUNK: {
          const messageId = event.messageId ?? activeReasoningMessageId;
          if (messageId) {
            commands.push(...openReasoning(messageId, event, context));
            if (event.delta) commands.push(cmd.content.append(`agui:reasoning:${messageId}`, event.delta));
          }
          break;
        }
        case EventType.REASONING_END:
        case EventType.REASONING_MESSAGE_END:
        case EventType.THINKING_TEXT_MESSAGE_END: {
          const messageId = readEventMessageId(event);
          if (messageId && openReasoningStreams.delete(messageId)) {
            commands.push(cmd.content.close(`agui:reasoning:${messageId}`));
          }
          if (activeReasoningMessageId === messageId) activeReasoningMessageId = null;
          break;
        }

        case EventType.TOOL_CALL_START: {
          activeToolCallId = event.toolCallId;
          toolNames.set(event.toolCallId, event.toolCallName);
          toolArguments.set(event.toolCallId, '');
          const renderer = resolveToolRenderer(event, context, event.toolCallId, event.toolCallName);
          commands.push(...cmd.tool.start({
            id: event.toolCallId,
            title: event.toolCallName,
            parentId: activeRunId,
            ...(renderer !== undefined ? { renderer } : {}),
            ...semantics(event, context, event.parentMessageId),
            data: { arguments: '', rawEvent: event as unknown as RuntimeData },
            at
          }));
          break;
        }
        case EventType.TOOL_CALL_CHUNK: {
          const toolCallId = event.toolCallId ?? activeToolCallId;
          if (!toolCallId) break;

          activeToolCallId = toolCallId;
          const wasKnown = toolNames.has(toolCallId);
          const toolCallName = event.toolCallName
            ?? toolNames.get(toolCallId)
            ?? '工具调用';
          toolNames.set(toolCallId, toolCallName);

          if (!wasKnown) {
            toolArguments.set(toolCallId, '');
            const renderer = resolveToolRenderer(event, context, toolCallId, toolCallName);
            commands.push(...cmd.tool.start({
              id: toolCallId,
              title: toolCallName,
              parentId: activeRunId,
              ...(renderer !== undefined ? { renderer } : {}),
              ...semantics(event, context, event.parentMessageId),
              data: { arguments: '', rawEvent: event as unknown as RuntimeData },
              at
            }));
          }

          if (event.delta) {
            const args = `${toolArguments.get(toolCallId) ?? ''}${event.delta}`;
            toolArguments.set(toolCallId, args);
            const renderer = resolveToolRenderer(event, context, toolCallId, toolCallName);
            commands.push(...cmd.tool.update({
              id: toolCallId,
              title: toolCallName,
              ...(renderer !== undefined ? { renderer } : {}),
              data: { arguments: args, rawEvent: event as unknown as RuntimeData },
              at
            }));
          }
          break;
        }
        case EventType.TOOL_CALL_ARGS: {
          const args = `${toolArguments.get(event.toolCallId) ?? ''}${event.delta}`;
          toolArguments.set(event.toolCallId, args);
          const title = toolNames.get(event.toolCallId) ?? '工具调用';
          const renderer = resolveToolRenderer(event, context, event.toolCallId, title);
          commands.push(...cmd.tool.update({
            id: event.toolCallId,
            title,
            ...(renderer !== undefined ? { renderer } : {}),
            data: { arguments: args, rawEvent: event as unknown as RuntimeData },
            at
          }));
          break;
        }
        case EventType.TOOL_CALL_END:
          if (activeToolCallId === event.toolCallId) activeToolCallId = null;
          commands.push(...cmd.tool.update({
            id: event.toolCallId,
            title: toolNames.get(event.toolCallId) ?? '工具调用',
            status: 'waiting',
            data: { arguments: toolArguments.get(event.toolCallId) ?? '' },
            at
          }));
          break;
        case EventType.TOOL_CALL_RESULT:
          commands.push(...cmd.tool.finish({
            id: event.toolCallId,
            title: toolNames.get(event.toolCallId) ?? '工具调用',
            result: event.content,
            data: {
              arguments: toolArguments.get(event.toolCallId) ?? '',
              resultMessageId: event.messageId,
              rawEvent: event as unknown as RuntimeData
            },
            at
          }));
          toolNames.delete(event.toolCallId);
          toolArguments.delete(event.toolCallId);
          if (activeToolCallId === event.toolCallId) activeToolCallId = null;
          break;

        case EventType.THINKING_START: {
          activeThinkingNodeId = `agui:thinking:${activeRunId ?? context.makeId('run')}`;
          commands.push(cmd.node.upsert({
            id: activeThinkingNodeId,
            type: 'reasoning',
            status: 'running',
            parentId: activeRunId,
            title: event.title ?? '思考过程',
            data: { rawEvent: event as unknown as RuntimeData },
            startedAt: at,
            updatedAt: at
          }));
          break;
        }
        case EventType.THINKING_END:
          if (activeThinkingNodeId) {
            commands.push(cmd.node.patch(activeThinkingNodeId, {
              status: 'done',
              data: { rawEvent: event as unknown as RuntimeData },
              endedAt: at,
              updatedAt: at
            }));
            activeThinkingNodeId = null;
          }
          break;

        case EventType.STEP_STARTED:
          commands.push(cmd.node.upsert({
            id: `agui:step:${activeRunId ?? 'run'}:${event.stepName}`,
            type: 'step',
            status: 'running',
            parentId: activeRunId,
            title: event.stepName,
            data: { rawEvent: event as unknown as RuntimeData },
            startedAt: at,
            updatedAt: at
          }));
          break;
        case EventType.STEP_FINISHED:
          commands.push(cmd.node.patch(`agui:step:${activeRunId ?? 'run'}:${event.stepName}`, {
            status: 'done',
            endedAt: at,
            updatedAt: at,
            data: { rawEvent: event as unknown as RuntimeData }
          }));
          break;

        case EventType.ACTIVITY_SNAPSHOT:
        case EventType.ACTIVITY_DELTA: {
          const activity = store.snapshot.activities[event.messageId];
          if (activity) {
            commands.push(cmd.message.insert({
              id: createActivityBlockId(event.messageId),
              role: 'assistant',
              slot: options.slot ?? 'main',
              type: 'activity',
              renderer: 'tool',
              state: 'stable',
              nodeId: activeRunId,
              ...semantics(event, context, event.messageId),
              data: {
                title: activity.activityType,
                status: 'running',
                content: activity.content
              },
              at
            }));
          }
          break;
        }

        case EventType.RUN_FINISHED: {
          for (const messageId of openTextStreams) {
            commands.push(cmd.content.close(`agui:text:${messageId}`));
          }
          for (const messageId of openReasoningStreams) {
            commands.push(cmd.content.close(`agui:reasoning:${messageId}`));
          }
          openTextStreams.clear();
          openReasoningStreams.clear();
          if (activeThinkingNodeId) {
            commands.push(cmd.node.patch(activeThinkingNodeId, {
              status: 'done',
              endedAt: at,
              updatedAt: at
            }));
          }
          activeThinkingNodeId = null;
          activeToolCallId = null;
          for (const surfaceId of a2uiSurfaces.keys()) {
            commands.push(cmd.block.patch(createA2UiBlockId(surfaceId), { state: 'settled', updatedAt: at }));
          }
          commands.push(cmd.run.finish({
            id: event.runId,
            status: event.outcome?.type === 'interrupt' ? 'blocked' : 'done',
            data: { result: event.result, outcome: event.outcome, rawEvent: event as unknown as RuntimeData },
            at
          }));
          activeRunId = null;
          break;
        }
        case EventType.RUN_ERROR: {
          const runId = activeRunId ?? context.makeId('agui-run');
          for (const messageId of openTextStreams) {
            commands.push(cmd.content.abort(`agui:text:${messageId}`, event.message));
          }
          for (const messageId of openReasoningStreams) {
            commands.push(cmd.content.abort(`agui:reasoning:${messageId}`, event.message));
          }
          openTextStreams.clear();
          openReasoningStreams.clear();
          if (activeThinkingNodeId) {
            commands.push(cmd.node.error({
              id: activeThinkingNodeId,
              message: event.message,
              at
            }));
          }
          activeThinkingNodeId = null;
          activeToolCallId = null;
          commands.push(
            cmd.error.upsert({
              id: `block:agui:error:${runId}`,
              role: 'assistant',
              title: 'AG-UI 运行失败',
              message: event.message,
              ...(event.code ? { code: event.code } : {}),
              ...semantics(event, context),
              at
            }),
            cmd.node.error({
              id: runId,
              message: event.message,
              ...(event.code ? { code: event.code } : {}),
              at
            }),
            cmd.run.finish({ id: runId, status: 'error', message: event.message, at })
          );
          activeRunId = null;
          break;
        }
      }

      return commands;
    }
  };
}
