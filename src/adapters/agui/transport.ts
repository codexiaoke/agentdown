import {
  EventSchemas,
  RunAgentInputSchema,
  type AGUIEvent,
  type Context,
  type Message,
  type RunAgentInput,
  type Tool
} from '@ag-ui/core';
import {
  attachAgentdownRecoveryMetadata,
  parseAgentdownEventCursor,
  type AgentdownEventRecoveryMetadata
} from '../../recovery/backendConversation';
import { createJsonSseTransport, type FetchTransportSource } from '../../runtime/transports';
import type { FrameworkChatTransportContext } from '../shared/chatFactory';
import type { FrameworkJsonTransportResolvable } from '../shared/jsonSseTransportFactory';
import type { AgUiSseTransportOptions } from './types';

async function resolveValue<TSource, TValue, TContext>(
  source: TSource,
  value: FrameworkJsonTransportResolvable<TSource, TValue, TContext> | undefined,
  context: TContext | undefined
): Promise<TValue | undefined> {
  if (value === undefined) return undefined;
  if (typeof value === 'function') {
    return await (value as (
      source: TSource,
      context: TContext | undefined
    ) => Promise<TValue> | TValue)(source, context);
  }
  return value;
}

function readChatContext(value: unknown): FrameworkChatTransportContext | undefined {
  return value && typeof value === 'object'
    ? value as FrameworkChatTransportContext
    : undefined;
}

function makeId(prefix: string): string {
  const suffix = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${suffix}`;
}

async function resolveRunInput<TSource, TContext>(
  source: TSource,
  options: AgUiSseTransportOptions<TSource, TContext>,
  context: TContext | undefined
): Promise<RunAgentInput> {
  const configured = await resolveValue(source, options.runInput, context);
  if (configured) {
    return RunAgentInputSchema.parse(configured);
  }

  const chatContext = readChatContext(context);
  const threadId = chatContext?.sessionId || makeId('thread');
  const runId = chatContext?.clientRequestId || makeId('run');
  const text = await resolveValue(source, options.message, context);
  const configuredMessages = await resolveValue(source, options.messages, context);
  const messages: Message[] = configuredMessages ?? (
    typeof text === 'string' && text.length > 0
      ? [{ id: `message:user:${runId}`, role: 'user', content: text }]
      : []
  );
  const tools = await resolveValue(source, options.tools, context) ?? [] as Tool[];
  const agUiContext = await resolveValue(source, options.context, context) ?? [] as Context[];
  const state = await resolveValue(source, options.state, context) ?? {};
  const forwardedProps = await resolveValue(source, options.forwardedProps, context);
  const parentRunId = await resolveValue(source, options.parentRunId, context);

  return RunAgentInputSchema.parse({
    threadId,
    runId,
    messages,
    tools,
    context: agUiContext,
    state,
    ...(forwardedProps !== undefined ? { forwardedProps } : {}),
    ...(parentRunId ? { parentRunId } : {})
  });
}

/** 创建发送标准 RunAgentInput、接收标准 AG-UI SSE events 的 transport。 */
export function createAgUiSseTransport<
  TSource = FetchTransportSource,
  TContext = FrameworkChatTransportContext
>(options: AgUiSseTransportOptions<TSource, TContext> = {}) {
  return createJsonSseTransport<AGUIEvent, TSource, RunAgentInput>({
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.init ? { init: options.init } : {}),
    parse(message) {
      if (!message.data || message.data === '[DONE]') return null;
      const event = EventSchemas.parse(JSON.parse(message.data)) as AGUIEvent;
      const cursor = parseAgentdownEventCursor(message.id);

      if (cursor === null || !message.id) return event;
      const metadata: AgentdownEventRecoveryMetadata = { eventId: message.id, cursor };
      if (options.recovery?.isDuplicate?.(metadata)) return null;
      options.recovery?.onEvent?.(metadata);
      return attachAgentdownRecoveryMetadata(event, metadata);
    },
    request: {
      method: async (source) => {
        const context = options.resolveContext?.();
        const chat = readChatContext(context);
        if (chat?.replayOnly) return 'GET';
        return await resolveValue(source, options.request?.method, context) ?? 'POST';
      },
      headers: async (source) => {
        const context = options.resolveContext?.();
        const chat = readChatContext(context);
        const configured = await resolveValue(source, options.request?.headers, context);
        const headers = new Headers(configured);
        headers.set('Accept', 'text/event-stream, application/vnd.ag-ui.event-stream');

        if (chat?.replayOnly && chat.afterCursor > 0) {
          headers.set('Last-Event-ID', String(chat.afterCursor));
        } else if (chat?.clientRequestId) {
          headers.set('Idempotency-Key', chat.clientRequestId);
        }
        return headers;
      },
      body: async (source) => {
        const context = options.resolveContext?.();
        const chat = readChatContext(context);
        if (chat?.replayOnly) return undefined;
        return await resolveRunInput(source, options, context);
      }
    }
  });
}
