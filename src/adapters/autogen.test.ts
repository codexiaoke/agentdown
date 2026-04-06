import { describe, expect, it } from 'vitest';
import { effectScope, nextTick, ref, type Component } from 'vue';
import { createMarkdownAssembler } from '../runtime/assemblers';
import { createBridge } from '../runtime/createBridge';
import {
  createAutoGenAdapter,
  createAutoGenChatIds,
  createAutoGenProtocol,
  createAutoGenSseTransport,
  defineAutoGenEventComponents,
  defineAutoGenToolComponents,
  type AutoGenEvent,
  useAutoGenChatSession
} from './autogen';

/**
 * 创建一个用于测试 AutoGen adapter 的同步 bridge。
 */
function createAutoGenTestBridge() {
  return createBridge<AutoGenEvent>({
    scheduler: 'sync',
    protocol: createAutoGenProtocol({
      toolRenderer: ({ tool }) => (
        tool?.name === 'lookup_weather'
          ? 'tool.weather'
          : 'tool'
      )
    }),
    assemblers: {
      markdown: createMarkdownAssembler()
    }
  });
}

/**
 * 把一组 AutoGen 事件包装成最小可用的 SSE Response。
 */
function createAutoGenSseResponse(events: AutoGenEvent[]): Response {
  const encoder = new TextEncoder();

  return new Response(new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      controller.close();
    }
  }), {
    headers: {
      'Content-Type': 'text/event-stream'
    }
  });
}

describe('createAutoGenProtocol', () => {
  it('maps a real autogen stream into assistant text and a tool card', () => {
    const bridge = createAutoGenTestBridge();

    bridge.push([
      {
        type: 'TextMessage',
        id: 'user-1',
        source: 'user',
        content: '帮我查一下北京天气，并说明工具调用过程。'
      },
      {
        type: 'ModelClientStreamingChunkEvent',
        id: 'chunk-1',
        source: 'assistant',
        full_message_id: 'assistant-msg-1',
        content: '我来帮您查询北京的天气。'
      },
      {
        type: 'ThoughtEvent',
        id: 'assistant-msg-1',
        source: 'assistant',
        content: '我来帮您查询北京的天气。'
      },
      {
        type: 'ToolCallRequestEvent',
        id: 'tool-request-1',
        source: 'assistant',
        content: [
          {
            id: 'call-weather-1',
            name: 'lookup_weather',
            arguments: '{"city":"北京"}'
          }
        ]
      },
      {
        type: 'ToolCallExecutionEvent',
        id: 'tool-execution-1',
        source: 'assistant',
        content: [
          {
            call_id: 'call-weather-1',
            name: 'lookup_weather',
            content: "{'city': '北京', 'condition': '局部多云', 'tempC': 14.3, 'humidity': 14}",
            is_error: false
          }
        ]
      },
      {
        type: 'TaskResult',
        id: 'task-result-1',
        messages: []
      }
    ]);
    bridge.flush('autogen-test');

    const snapshot = bridge.runtime.snapshot();
    const runNode = snapshot.nodes.find((node) => node.type === 'run');
    const toolNode = snapshot.nodes.find((node) => node.type === 'tool');
    const orderedRenderableBlocks = snapshot.blocks.filter((block) => block.type === 'text' || block.type === 'tool');

    expect(runNode?.status).toBe('done');
    expect(toolNode?.status).toBe('done');
    expect(toolNode?.data.input).toEqual({
      city: '北京'
    });
    expect(toolNode?.data.result).toEqual({
      city: '北京',
      condition: '局部多云',
      tempC: 14.3,
      humidity: 14
    });
    expect(orderedRenderableBlocks).toHaveLength(2);
    expect(orderedRenderableBlocks[0]).toMatchObject({
      type: 'text',
      content: '我来帮您查询北京的天气。'
    });
    expect(orderedRenderableBlocks[1]).toMatchObject({
      type: 'tool',
      renderer: 'tool.weather'
    });
  });

  it('finishes pending tools from ToolCallSummaryMessage when execution events are missing', () => {
    const bridge = createAutoGenTestBridge();

    bridge.push([
      {
        type: 'ToolCallRequestEvent',
        id: 'tool-request-2',
        source: 'assistant',
        content: [
          {
            id: 'call-weather-2',
            name: 'lookup_weather',
            arguments: '{"city":"上海"}'
          }
        ]
      },
      {
        type: 'ToolCallSummaryMessage',
        id: 'tool-summary-2',
        source: 'assistant',
        tool_calls: [
          {
            id: 'call-weather-2',
            name: 'lookup_weather',
            arguments: '{"city":"上海"}'
          }
        ],
        results: [
          {
            call_id: 'call-weather-2',
            name: 'lookup_weather',
            content: '{"city":"上海","condition":"多云"}',
            is_error: false
          }
        ]
      },
      {
        type: 'TaskResult',
        id: 'task-result-2',
        messages: []
      }
    ]);
    bridge.flush('autogen-summary-fallback');

    const snapshot = bridge.runtime.snapshot();
    const toolNode = snapshot.nodes.find((node) => node.type === 'tool');
    const toolBlock = snapshot.blocks.find((block) => block.nodeId === toolNode?.id);

    expect(toolNode?.status).toBe('done');
    expect(toolNode?.data.result).toEqual({
      city: '上海',
      condition: '多云'
    });
    expect(toolBlock?.renderer).toBe('tool.weather');
  });

  it('creates a ready-to-use AutoGen adapter by composing tools, events and surface renderers', async () => {
    const WeatherToolCard = {} as Component;
    const WeatherEventCard = {} as Component;
    const tools = defineAutoGenToolComponents({
      'tool.weather': {
        match: 'lookup_weather',
        component: WeatherToolCard
      }
    });
    const events = defineAutoGenEventComponents({
      'event.weather-summary': {
        on: 'weather_card',
        component: WeatherEventCard,
        resolve: ({ event }) => ({
          id: 'event:block:weather-summary',
          mode: 'upsert',
          groupId: 'turn:autogen-adapter',
          data: {
            payload: (event as AutoGenEvent).content
          }
        })
      }
    });
    const adapter = createAutoGenAdapter({
      title: '天气助手',
      tools,
      events
    });
    const session = adapter.createSession({
      source: [
        {
          type: 'ModelClientStreamingChunkEvent',
          id: 'chunk-1',
          source: 'assistant',
          full_message_id: 'assistant-msg-5',
          content: '我来为你查询天气。'
        },
        {
          type: 'ToolCallRequestEvent',
          id: 'tool-request-5',
          source: 'assistant',
          content: [
            {
              id: 'call-weather-5',
              name: 'lookup_weather',
              arguments: '{"city":"北京"}'
            }
          ]
        },
        {
          type: 'ToolCallExecutionEvent',
          id: 'tool-execution-5',
          source: 'assistant',
          content: [
            {
              call_id: 'call-weather-5',
              name: 'lookup_weather',
              content: '{"city":"北京","condition":"晴"}',
              is_error: false
            }
          ]
        },
        {
          type: 'weather_card',
          id: 'event-5',
          source: 'assistant',
          content: {
            city: '北京',
            condition: '晴'
          }
        },
        {
          type: 'TaskResult',
          id: 'task-result-5',
          messages: []
        }
      ]
    });

    await session.connect();

    const snapshot = session.runtime.snapshot();
    const toolBlock = snapshot.blocks.find((block) => block.nodeId === 'call-weather-5');
    const eventBlock = snapshot.blocks.find((block) => block.id === 'event:block:weather-summary');

    expect(adapter.name).toBe('autogen');
    expect(session.surface.renderers?.['tool.weather']).toBe(WeatherToolCard);
    expect(session.surface.renderers?.['event.weather-summary']).toBe(WeatherEventCard);
    expect(snapshot.nodes.find((node) => node.type === 'run')?.title).toBe('天气助手');
    expect(toolBlock?.renderer).toBe('tool.weather');
    expect(eventBlock).toMatchObject({
      renderer: 'event.weather-summary'
    });
    expect(eventBlock?.data.payload).toEqual({
      city: '北京',
      condition: '晴'
    });
  });

  it('provides a compact AutoGen SSE transport helper for backend requests', async () => {
    let capturedInit: RequestInit | undefined;
    const transport = createAutoGenSseTransport<string>({
      fetch: async (_source, init) => {
        capturedInit = init;

        return new Response('data: {"type":"TaskResult","id":"task-helper","messages":[]}\n\n', {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream'
          }
        });
      },
      message(source) {
        return `ask:${source}`;
      },
      body: {
        city: '北京'
      }
    });
    const packets: AutoGenEvent[] = [];

    for await (const packet of transport.connect('/api/stream/autogen', {
      signal: new AbortController().signal
    })) {
      packets.push(packet);
    }

    expect(capturedInit?.method).toBe('POST');
    expect(new Headers(capturedInit?.headers).get('Content-Type')).toBe('application/json');
    expect(capturedInit?.body).toBe('{"city":"北京","message":"ask:/api/stream/autogen"}');
    expect(packets).toEqual([
      {
        type: 'TaskResult',
        id: 'task-helper',
        messages: []
      }
    ]);
  });
});

describe('useAutoGenChatSession', () => {
  it('seeds a user message, captures sessionId and exposes a shorter send API', async () => {
    const scope = effectScope();
    const prompt = ref('帮我查一下北京天气，并说明工具调用过程。');
    let requestCount = 0;
    const sessionState = scope.run(() => useAutoGenChatSession<string>({
      source: 'http://autogen.test/api/stream',
      input: prompt,
      conversationId: 'session:demo:autogen-chat',
      title: 'AutoGen 助手',
      transport: {
        fetch: (async () => {
          requestCount += 1;

          return createAutoGenSseResponse([
            {
              type: 'TaskStarted',
              id: `task-${requestCount}`,
              source: 'assistant',
              metadata: {
                session_id: `autogen-session-${requestCount}`
              }
            },
            {
              type: 'ModelClientStreamingChunkEvent',
              id: `chunk-${requestCount}`,
              source: 'assistant',
              full_message_id: `assistant-msg-${requestCount}`,
              content: requestCount === 1
                ? '我来为你查询天气'
                : '我继续为你查询天气'
            },
            {
              type: 'TaskResult',
              id: `result-${requestCount}`,
              messages: []
            }
          ]);
        }) as typeof fetch
      }
    }));

    if (!sessionState) {
      throw new Error('Failed to create AutoGen chat session.');
    }

    await sessionState.send();
    await nextTick();

    const snapshot = sessionState.runtime.snapshot();
    const userBlock = snapshot.blocks.find((block) => block.messageId === sessionState.chatIds.value?.userMessageId);
    const assistantBlock = snapshot.blocks.find((block) => block.messageId === sessionState.chatIds.value?.assistantMessageId);
    const assistantActions = sessionState.surface.value.messageActions?.assistant;
    const resolvedAssistantActions = assistantActions === false
      ? undefined
      : assistantActions;

    expect(sessionState.sessionId.value).toBe('autogen-session-1');
    expect(sessionState.busy.value).toBe(false);
    expect(userBlock?.content).toBe('帮我查一下北京天气，并说明工具调用过程。');
    expect(assistantBlock?.content).toBe('我来为你查询天气');
    expect(resolvedAssistantActions?.actions?.some((action) => {
      const key = typeof action === 'string'
        ? action
        : action.key;

      return key === 'regenerate';
    })).toBe(true);
    expect(createAutoGenChatIds({
      conversationId: 'session:demo:autogen-chat',
      at: 100
    })).toEqual({
      conversationId: 'session:demo:autogen-chat',
      turnId: 'turn:session:demo:autogen-chat:100',
      userMessageId: 'message:user:session:demo:autogen-chat:100',
      assistantMessageId: 'message:assistant:session:demo:autogen-chat:100'
    });

    await sessionState.send('再查一遍');
    await nextTick();

    expect(sessionState.sessionId.value).toBe('autogen-session-1');

    scope.stop();
  });
});
