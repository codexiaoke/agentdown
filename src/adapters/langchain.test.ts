import { describe, expect, it } from 'vitest';
import { effectScope, nextTick, ref, type Component } from 'vue';
import { createMarkdownAssembler } from '../runtime/assemblers';
import { createBridge } from '../runtime/createBridge';
import {
  createLangChainAdapter,
  createLangChainChatIds,
  createLangChainProtocol,
  createLangChainSseTransport,
  defineLangChainEventComponents,
  defineLangChainToolComponents,
  type LangChainEvent,
  useLangChainChatSession
} from './langchain';

/**
 * 创建一个用于测试 LangChain adapter 的同步 bridge。
 */
function createLangChainTestBridge() {
  return createBridge<LangChainEvent>({
    scheduler: 'sync',
    protocol: createLangChainProtocol({
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
 * 把一组 LangChain 事件包装成最小可用的 SSE Response。
 */
function createLangChainSseResponse(events: LangChainEvent[]): Response {
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

describe('createLangChainProtocol', () => {
  it('maps a langchain stream into assistant segments and a tool card', () => {
    const bridge = createLangChainTestBridge();

    bridge.push([
      {
        event: 'on_chain_start',
        run_id: 'run-1',
        name: 'LangGraph'
      },
      {
        event: 'on_chat_model_stream',
        run_id: 'stream-1',
        parent_ids: ['run-1'],
        data: {
          chunk: {
            content: '我来帮您查询北京天气。'
          }
        }
      },
      {
        event: 'on_tool_start',
        run_id: 'tool-1',
        parent_ids: ['run-1'],
        name: 'lookup_weather',
        data: {
          input: {
            city: '北京'
          }
        }
      },
      {
        event: 'on_tool_end',
        run_id: 'tool-1',
        parent_ids: ['run-1'],
        name: 'lookup_weather',
        data: {
          output: {
            tool_call_id: 'call-weather-1',
            content: '{"city":"北京","condition":"晴","tempC":26}'
          }
        }
      },
      {
        event: 'on_chat_model_stream',
        run_id: 'stream-2',
        parent_ids: ['run-1'],
        data: {
          chunk: {
            content: '根据查询结果，北京今日晴。'
          }
        }
      },
      {
        event: 'on_chain_end',
        run_id: 'run-1',
        name: 'LangGraph'
      }
    ]);
    bridge.flush('langchain-test');

    const snapshot = bridge.runtime.snapshot();
    const runNode = snapshot.nodes.find((node) => node.id === 'run-1');
    const toolNode = snapshot.nodes.find((node) => node.id === 'tool-1');
    const orderedRenderableBlocks = snapshot.blocks.filter((block) => block.type === 'text' || block.type === 'tool');

    expect(runNode?.status).toBe('done');
    expect(toolNode?.status).toBe('done');
    expect(toolNode?.data.input).toEqual({
      city: '北京'
    });
    expect(toolNode?.data.result).toEqual({
      city: '北京',
      condition: '晴',
      tempC: 26
    });
    expect(orderedRenderableBlocks).toHaveLength(3);
    expect(orderedRenderableBlocks[0]).toMatchObject({
      type: 'text',
      content: '我来帮您查询北京天气。'
    });
    expect(orderedRenderableBlocks[1]).toMatchObject({
      type: 'tool',
      renderer: 'tool.weather'
    });
    expect(orderedRenderableBlocks[2]).toMatchObject({
      type: 'text',
      content: '根据查询结果，北京今日晴。'
    });
  });

  it('creates a ready-to-use LangChain adapter by composing tools, events and surface renderers', async () => {
    const WeatherToolCard = {} as Component;
    const WeatherEventCard = {} as Component;
    const tools = defineLangChainToolComponents({
      'tool.weather': {
        match: 'lookup_weather',
        component: WeatherToolCard
      }
    });
    const events = defineLangChainEventComponents({
      'event.weather-summary': {
        on: 'weather_card',
        component: WeatherEventCard,
        resolve: ({ event }) => ({
          id: 'event:block:weather-summary',
          mode: 'upsert',
          groupId: 'turn:run-2',
          data: {
            payload: (event as LangChainEvent).data
          }
        })
      }
    });
    const adapter = createLangChainAdapter({
      title: '天气助手',
      tools,
      events
    });
    const session = adapter.createSession({
      source: [
        {
          event: 'on_chain_start',
          run_id: 'run-2',
          name: 'LangGraph'
        },
        {
          event: 'on_chat_model_stream',
          run_id: 'stream-2',
          parent_ids: ['run-2'],
          data: {
            chunk: {
              content: '我来为你查询天气。'
            }
          }
        },
        {
          event: 'on_tool_start',
          run_id: 'tool-2',
          parent_ids: ['run-2'],
          name: 'lookup_weather',
          data: {
            input: {
              city: '北京'
            }
          }
        },
        {
          event: 'on_tool_end',
          run_id: 'tool-2',
          parent_ids: ['run-2'],
          name: 'lookup_weather',
          data: {
            output: {
              content: '{"city":"北京","condition":"晴"}'
            }
          }
        },
        {
          event: 'weather_card',
          run_id: 'event-2',
          parent_ids: ['run-2'],
          data: {
            city: '北京',
            condition: '晴'
          }
        },
        {
          event: 'on_chain_end',
          run_id: 'run-2',
          name: 'LangGraph'
        }
      ]
    });

    await session.connect();

    const snapshot = session.runtime.snapshot();
    const toolBlock = snapshot.blocks.find((block) => block.nodeId === 'tool-2');
    const eventBlock = snapshot.blocks.find((block) => block.id === 'event:block:weather-summary');

    expect(adapter.name).toBe('langchain');
    expect(session.surface.renderers?.['tool.weather']).toBe(WeatherToolCard);
    expect(session.surface.renderers?.['event.weather-summary']).toBe(WeatherEventCard);
    expect(snapshot.nodes.find((node) => node.id === 'run-2')?.title).toBe('天气助手');
    expect(toolBlock?.renderer).toBe('tool.weather');
    expect(eventBlock).toMatchObject({
      renderer: 'event.weather-summary'
    });
    expect(eventBlock?.data.payload).toEqual({
      city: '北京',
      condition: '晴'
    });
  });

  it('provides a compact LangChain SSE transport helper for backend requests', async () => {
    let capturedInit: RequestInit | undefined;
    const transport = createLangChainSseTransport<string>({
      fetch: async (_source, init) => {
        capturedInit = init;

        return new Response('data: {"event":"on_chain_start","run_id":"run-helper","name":"LangGraph"}\n\n', {
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
    const packets: LangChainEvent[] = [];

    for await (const packet of transport.connect('/api/stream/langchain', {
      signal: new AbortController().signal
    })) {
      packets.push(packet);
    }

    expect(capturedInit?.method).toBe('POST');
    expect(new Headers(capturedInit?.headers).get('Content-Type')).toBe('application/json');
    expect(capturedInit?.body).toBe('{"city":"北京","message":"ask:/api/stream/langchain"}');
    expect(packets).toEqual([
      {
        event: 'on_chain_start',
        run_id: 'run-helper',
        name: 'LangGraph'
      }
    ]);
  });
});

describe('useLangChainChatSession', () => {
  it('seeds a user message, captures sessionId and exposes a shorter send API', async () => {
    const scope = effectScope();
    const prompt = ref('帮我查一下北京天气，并说明工具调用过程。');
    let requestCount = 0;
    const sessionState = scope.run(() => useLangChainChatSession<string>({
      source: 'http://langchain.test/api/stream',
      input: prompt,
      conversationId: 'session:demo:langchain-chat',
      title: 'LangChain 助手',
      transport: {
        fetch: (async () => {
          requestCount += 1;

          return createLangChainSseResponse([
            {
              event: 'on_chain_start',
              run_id: `run-langchain-${requestCount}`,
              name: 'LangGraph',
              metadata: {
                session_id: `langchain-session-${requestCount}`
              }
            },
            {
              event: 'on_chat_model_stream',
              run_id: `stream-${requestCount}`,
              parent_ids: [`run-langchain-${requestCount}`],
              data: {
                chunk: {
                  content: requestCount === 1
                    ? '我来为你查询天气'
                    : '我继续为你查询天气'
                }
              }
            },
            {
              event: 'on_chain_end',
              run_id: `run-langchain-${requestCount}`,
              name: 'LangGraph'
            }
          ]);
        }) as typeof fetch
      }
    }));

    if (!sessionState) {
      throw new Error('Failed to create LangChain chat session.');
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

    expect(sessionState.sessionId.value).toBe('langchain-session-1');
    expect(sessionState.busy.value).toBe(false);
    expect(userBlock?.content).toBe('帮我查一下北京天气，并说明工具调用过程。');
    expect(assistantBlock?.content).toBe('我来为你查询天气');
    expect(resolvedAssistantActions?.actions?.some((action) => {
      const key = typeof action === 'string'
        ? action
        : action.key;

      return key === 'regenerate';
    })).toBe(true);
    expect(createLangChainChatIds({
      conversationId: 'session:demo:langchain-chat',
      at: 100
    })).toEqual({
      conversationId: 'session:demo:langchain-chat',
      turnId: 'turn:session:demo:langchain-chat:100',
      userMessageId: 'message:user:session:demo:langchain-chat:100',
      assistantMessageId: 'message:assistant:session:demo:langchain-chat:100'
    });

    await sessionState.send('再查一遍');
    await nextTick();

    expect(sessionState.sessionId.value).toBe('langchain-session-1');

    scope.stop();
  });
});
