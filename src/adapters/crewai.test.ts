import { describe, expect, it } from 'vitest';
import { effectScope, nextTick, ref, type Component } from 'vue';
import { createMarkdownAssembler } from '../runtime/assemblers';
import { createBridge } from '../runtime/createBridge';
import {
  createCrewAIAdapter,
  createCrewAIChatIds,
  createCrewAIProtocol,
  createCrewAISseTransport,
  defineCrewAIEventComponents,
  defineCrewAIToolComponents,
  type CrewAIEvent,
  useCrewAIChatSession
} from './crewai';

/**
 * 创建一个用于测试 CrewAI adapter 的同步 bridge。
 */
function createCrewAITestBridge() {
  return createBridge<CrewAIEvent>({
    scheduler: 'sync',
    protocol: createCrewAIProtocol({
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
 * 把一组 CrewAI 事件包装成最小可用的 SSE Response。
 */
function createCrewAISseResponse(events: CrewAIEvent[]): Response {
  const encoder = new TextEncoder();

  return new Response(new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`event: ${event.event ?? 'message'}\n`));
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

describe('createCrewAIProtocol', () => {
  it('maps a real crewai stream into assistant segments and a tool card', () => {
    const bridge = createCrewAITestBridge();

    bridge.push([
      {
        agent_id: 'agent-1',
        agent_role: 'Weather Researcher',
        chunk_type: {
          _value_: 'text'
        },
        content: '我来帮您查询北京的天气。'
      },
      {
        agent_id: 'agent-1',
        agent_role: 'Weather Researcher',
        chunk_type: {
          _value_: 'tool_call'
        },
        content: '',
        tool_call: {
          tool_id: 'call-weather-1',
          tool_name: 'lookup_weather',
          arguments: ''
        }
      },
      {
        agent_id: 'agent-1',
        agent_role: 'Weather Researcher',
        chunk_type: {
          _value_: 'text'
        },
        content: '北京当前天气：阴天，温度13.7°C。'
      },
      {
        event: 'CrewOutput',
        type: 'CrewOutput',
        raw: '北京当前天气：阴天，温度13.7°C。',
        tasks_output: [
          {
            agent: 'Weather Researcher',
            messages: [
              {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'call-weather-1',
                    type: 'function',
                    function: {
                      name: 'lookup_weather',
                      arguments: '{"city":"北京"}'
                    }
                  }
                ]
              },
              {
                role: 'tool',
                name: 'lookup_weather',
                tool_call_id: 'call-weather-1',
                content: '{\n  "city": "北京",\n  "condition": "阴天",\n  "tempC": 13.7,\n  "humidity": 15\n}'
              },
              {
                role: 'assistant',
                content: '北京当前天气：阴天，温度13.7°C。'
              }
            ]
          }
        ]
      }
    ]);
    bridge.flush('crewai-test');

    const snapshot = bridge.runtime.snapshot();
    const runNode = snapshot.nodes.find((node) => node.id === 'agent-1');
    const toolNode = snapshot.nodes.find((node) => node.id === 'call-weather-1');
    const orderedRenderableBlocks = snapshot.blocks.filter((block) => block.type === 'text' || block.type === 'tool');

    expect(runNode?.status).toBe('done');
    expect(toolNode?.status).toBe('done');
    expect(toolNode?.data.input).toEqual({
      city: '北京'
    });
    expect(toolNode?.data.result).toEqual({
      city: '北京',
      condition: '阴天',
      tempC: 13.7,
      humidity: 15
    });
    expect(orderedRenderableBlocks).toHaveLength(3);
    expect(orderedRenderableBlocks[0]).toMatchObject({
      type: 'text',
      nodeId: 'agent-1',
      content: '我来帮您查询北京的天气。'
    });
    expect(orderedRenderableBlocks[1]).toMatchObject({
      type: 'tool',
      nodeId: 'call-weather-1',
      renderer: 'tool.weather'
    });
    expect(orderedRenderableBlocks[2]).toMatchObject({
      type: 'text',
      nodeId: 'agent-1',
      content: '北京当前天气：阴天，温度13.7°C。'
    });
  });

  it('creates a visible assistant error block when the run fails', () => {
    const bridge = createCrewAITestBridge();

    bridge.push([
      {
        agent_id: 'agent-error-1',
        agent_role: 'Weather Researcher',
        chunk_type: {
          _value_: 'text'
        },
        content: '我来帮您查询天气。'
      },
      {
        event: 'ErrorEvent',
        type: 'ErrorEvent',
        agent_id: 'agent-error-1',
        message: 'Weather API timeout.'
      }
    ]);
    bridge.flush('crewai-run-error');

    const snapshot = bridge.runtime.snapshot();
    const errorBlock = snapshot.blocks.find((block) => block.type === 'error');

    expect(errorBlock).toMatchObject({
      renderer: 'error',
      data: {
        kind: 'error',
        title: '运行失败',
        message: 'Weather API timeout.',
        refId: 'agent-error-1'
      }
    });
  });

  it('handles actual CrewAI-style string chunk types and incremental tool-call arguments', () => {
    const bridge = createCrewAITestBridge();

    bridge.push([
      {
        event: 'Chunk',
        type: 'Chunk',
        session_id: 'crewai-session-real-1',
        agent_id: 'agent-real-1',
        agent_role: 'Weather Researcher',
        chunk_type: 'text',
        content: '我来帮您查询北京的天气。'
      },
      {
        event: 'Chunk',
        type: 'Chunk',
        session_id: 'crewai-session-real-1',
        agent_id: 'agent-real-1',
        agent_role: 'Weather Researcher',
        chunk_type: 'tool_call',
        content: '',
        tool_call: {
          tool_id: 'call-weather-real-1',
          tool_name: 'lookup_weather',
          arguments: '',
          index: 0
        }
      },
      {
        event: 'Chunk',
        type: 'Chunk',
        session_id: 'crewai-session-real-1',
        agent_id: 'agent-real-1',
        agent_role: 'Weather Researcher',
        chunk_type: 'tool_call',
        content: '{',
        tool_call: {
          tool_id: 'call-weather-real-1',
          tool_name: 'lookup_weather',
          arguments: '{',
          index: 0
        }
      },
      {
        event: 'Chunk',
        type: 'Chunk',
        session_id: 'crewai-session-real-1',
        agent_id: 'agent-real-1',
        agent_role: 'Weather Researcher',
        chunk_type: 'tool_call',
        content: '"city": "北京"}',
        tool_call: {
          tool_id: 'call-weather-real-1',
          tool_name: 'lookup_weather',
          arguments: '{"city": "北京"}',
          index: 0
        }
      },
      {
        event: 'CrewOutput',
        type: 'CrewOutput',
        session_id: 'crewai-session-real-1',
        raw: '北京当前天气：晴，温度9.6°C。',
        tasks_output: [
          {
            agent: 'Weather Researcher',
            messages: [
              {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'call-weather-real-1',
                    type: 'function',
                    function: {
                      name: 'lookup_weather',
                      arguments: '{"city": "北京"}'
                    }
                  }
                ]
              },
              {
                role: 'tool',
                name: 'lookup_weather',
                tool_call_id: 'call-weather-real-1',
                content: '{"city":"北京","condition":"晴","tempC":9.6}'
              },
              {
                role: 'assistant',
                content: '北京当前天气：晴，温度9.6°C。'
              }
            ]
          }
        ]
      }
    ]);
    bridge.flush('crewai-real-like');

    const snapshot = bridge.runtime.snapshot();
    const toolNode = snapshot.nodes.find((node) => node.id === 'call-weather-real-1');
    const toolBlock = snapshot.blocks.find((block) => block.nodeId === 'call-weather-real-1');
    const assistantText = snapshot.blocks.find((block) => block.type === 'text');

    expect(toolNode?.status).toBe('done');
    expect(toolNode?.data.input).toEqual({
      city: '北京'
    });
    expect(toolNode?.data.result).toEqual({
      city: '北京',
      condition: '晴',
      tempC: 9.6
    });
    expect(toolBlock?.renderer).toBe('tool.weather');
    expect(assistantText?.content).toContain('我来帮您查询北京的天气。');
  });

  it('creates a synthetic tool card and final answer when only CrewOutput is observed', () => {
    const bridge = createCrewAITestBridge();

    bridge.push([
      {
        event: 'CrewOutput',
        type: 'CrewOutput',
        raw: '上海当前天气：多云，温度21°C。',
        tasks_output: [
          {
            agent: 'Weather Researcher',
            messages: [
              {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'call-weather-2',
                    type: 'function',
                    function: {
                      name: 'lookup_weather',
                      arguments: '{"city":"上海"}'
                    }
                  }
                ]
              },
              {
                role: 'tool',
                name: 'lookup_weather',
                tool_call_id: 'call-weather-2',
                content: '{"city":"上海","condition":"多云","tempC":21}'
              },
              {
                role: 'assistant',
                content: '上海当前天气：多云，温度21°C。'
              }
            ]
          }
        ]
      }
    ]);
    bridge.flush('crewai-output-only');

    const snapshot = bridge.runtime.snapshot();
    const toolBlock = snapshot.blocks.find((block) => block.nodeId === 'call-weather-2');
    const textBlock = snapshot.blocks.find((block) => block.type === 'text');
    const toolNode = snapshot.nodes.find((node) => node.id === 'call-weather-2');

    expect(toolNode?.status).toBe('done');
    expect(toolBlock?.renderer).toBe('tool.weather');
    expect(textBlock).toMatchObject({
      type: 'text',
      content: '上海当前天气：多云，温度21°C。'
    });
  });

  it('ignores CrewAI review events by default and keeps the standard stream result stable', () => {
    const bridge = createCrewAITestBridge();

    bridge.push([
      {
        event: 'Chunk',
        type: 'Chunk',
        session_id: 'crewai-session-hitl-1',
        agent_id: 'agent-hitl-1',
        agent_role: 'Weather Researcher',
        chunk_type: 'text',
        content: '我已经完成天气查询。'
      },
      {
        event: 'CrewOutput',
        type: 'CrewOutput',
        session_id: 'crewai-session-hitl-1',
        raw: '北京当前天气：阴天，温度18°C。',
        tasks_output: [
          {
            agent: 'Weather Researcher',
            messages: [
              {
                role: 'assistant',
                content: '北京当前天气：阴天，温度18°C。'
              }
            ]
          }
        ]
      },
      {
        event: 'flow_paused',
        type: 'flow_paused',
        session_id: 'crewai-session-hitl-1',
        flow_id: 'crewai-session-hitl-1',
        run_id: 'agent-hitl-1',
        run_title: 'Weather Researcher',
        method_name: 'run_crewai',
        message: '请确认是否接受刚刚生成的 CrewAI 最终回答。',
        output: '北京当前天气：阴天，温度18°C。',
        state: {
          id: 'crewai-session-hitl-1',
          run_id: 'agent-hitl-1',
          run_title: 'Weather Researcher',
          final_output: '北京当前天气：阴天，温度18°C。'
        }
      }
    ]);
    bridge.flush('crewai-hitl-pause');

    const snapshot = bridge.runtime.snapshot();
    const approvalBlock = snapshot.blocks.find((block) => block.type === 'approval');
    const textBlocks = snapshot.blocks.filter((block) => block.type === 'text');

    expect(approvalBlock).toBeUndefined();
    expect(textBlocks.at(-1)?.content).toBe('北京当前天气：阴天，温度18°C。');
  });

  it('creates a ready-to-use CrewAI adapter by composing tools, events and surface renderers', async () => {
    const WeatherToolCard = {} as Component;
    const WeatherEventCard = {} as Component;
    const tools = defineCrewAIToolComponents({
      'tool.weather': {
        match: 'lookup_weather',
        component: WeatherToolCard
      }
    });
    const events = defineCrewAIEventComponents({
      'event.weather-summary': {
        on: 'weather_card',
        component: WeatherEventCard,
        resolve: ({ event }) => ({
          id: 'event:block:weather-summary',
          mode: 'upsert',
          groupId: 'turn:agent-2',
          data: {
            payload: (event as CrewAIEvent).content
          }
        })
      }
    });
    const adapter = createCrewAIAdapter({
      title: '天气助手',
      tools,
      events
    });
    const session = adapter.createSession({
      source: [
        {
          agent_id: 'agent-2',
          agent_role: 'Weather Researcher',
          chunk_type: {
            _value_: 'text'
          },
          content: '我来为你查询天气。'
        },
        {
          agent_id: 'agent-2',
          agent_role: 'Weather Researcher',
          chunk_type: {
            _value_: 'tool_call'
          },
          content: '',
          tool_call: {
            tool_id: 'call-weather-3',
            tool_name: 'lookup_weather',
            arguments: '{"city":"北京"}'
          }
        },
        {
          event: 'weather_card',
          type: 'weather_card',
          content: {
            city: '北京',
            condition: '晴'
          }
        },
        {
          event: 'CrewOutput',
          type: 'CrewOutput',
          raw: '北京天气晴。',
          tasks_output: [
            {
              agent: 'Weather Researcher',
              messages: [
                {
                  role: 'assistant',
                  content: '',
                  tool_calls: [
                    {
                      id: 'call-weather-3',
                      type: 'function',
                      function: {
                        name: 'lookup_weather',
                        arguments: '{"city":"北京"}'
                      }
                    }
                  ]
                },
                {
                  role: 'tool',
                  name: 'lookup_weather',
                  tool_call_id: 'call-weather-3',
                  content: '{"city":"北京","condition":"晴"}'
                },
                {
                  role: 'assistant',
                  content: '北京天气晴。'
                }
              ]
            }
          ]
        }
      ]
    });

    await session.connect();

    const snapshot = session.runtime.snapshot();
    const toolBlock = snapshot.blocks.find((block) => block.nodeId === 'call-weather-3');
    const eventBlock = snapshot.blocks.find((block) => block.id === 'event:block:weather-summary');

    expect(adapter.name).toBe('crewai');
    expect(session.surface.renderers?.['tool.weather']).toBe(WeatherToolCard);
    expect(session.surface.renderers?.['event.weather-summary']).toBe(WeatherEventCard);
    expect(snapshot.nodes.find((node) => node.id === 'agent-2')?.title).toBe('天气助手');
    expect(toolBlock?.renderer).toBe('tool.weather');
    expect(eventBlock).toMatchObject({
      renderer: 'event.weather-summary'
    });
    expect(eventBlock?.data.payload).toEqual({
      city: '北京',
      condition: '晴'
    });
  });

  it('provides a compact CrewAI SSE transport helper for backend requests', async () => {
    let capturedInit: RequestInit | undefined;
    const transport = createCrewAISseTransport<string>({
      fetch: async (_source, init) => {
        capturedInit = init;

        return new Response('event: CrewOutput\ndata: {"type":"CrewOutput","raw":"done","tasks_output":[]}\n\n', {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream'
          }
        });
      },
      message(source: string) {
        return `ask:${source}`;
      },
      body: {
        city: '北京'
      }
    });
    const packets: CrewAIEvent[] = [];

    for await (const packet of transport.connect('/api/stream/crewai', {
      signal: new AbortController().signal
    })) {
      packets.push(packet);
    }

    expect(capturedInit?.method).toBe('POST');
    expect(new Headers(capturedInit?.headers).get('Content-Type')).toBe('application/json');
    expect(capturedInit?.body).toBe('{"city":"北京","message":"ask:/api/stream/crewai"}');
    expect(packets).toEqual([
      {
        event: 'CrewOutput',
        type: 'CrewOutput',
        raw: 'done',
        tasks_output: []
      }
    ]);
  });
});

describe('useCrewAIChatSession', () => {
  it('seeds a user message, captures sessionId and exposes a shorter send API', async () => {
    const scope = effectScope();
    const prompt = ref('帮我查一下北京天气，并说明工具调用过程。');
    let requestCount = 0;
    const capturedBodies: Array<Record<string, unknown>> = [];
    const sessionState = scope.run(() => useCrewAIChatSession<string>({
      source: 'http://crewai.test/api/stream',
      input: prompt,
      conversationId: 'session:demo:crewai-chat',
      title: 'CrewAI 助手',
      transport: {
        fetch: (async (_source, init) => {
          requestCount += 1;
          capturedBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);

          return createCrewAISseResponse([
            {
              event: 'Chunk',
              type: 'Chunk',
              session_id: `crewai-session-${requestCount}`,
              agent_id: `agent-${requestCount}`,
              agent_role: 'Weather Researcher',
              chunk_type: {
                _value_: 'text'
              },
              content: requestCount === 1
                ? '我来为你查询天气'
                : '我继续为你查询天气'
            },
            {
              event: 'CrewOutput',
              type: 'CrewOutput',
              raw: requestCount === 1
                ? '我来为你查询天气'
                : '我继续为你查询天气',
              tasks_output: []
            }
          ]);
        }) as typeof fetch
      }
    }));

    if (!sessionState) {
      throw new Error('Failed to create CrewAI chat session.');
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

    expect(sessionState.sessionId.value).toBe('crewai-session-1');
    expect(sessionState.busy.value).toBe(false);
    expect(capturedBodies[0]).toEqual({
      message: '帮我查一下北京天气，并说明工具调用过程。'
    });
    expect(userBlock?.content).toBe('帮我查一下北京天气，并说明工具调用过程。');
    expect(assistantBlock?.content).toBe('我来为你查询天气');
    expect(resolvedAssistantActions?.actions?.some((action) => {
      const key = typeof action === 'string'
        ? action
        : action.key;

      return key === 'regenerate';
    })).toBe(true);
    expect(createCrewAIChatIds({
      conversationId: 'session:demo:crewai-chat',
      at: 100
    })).toEqual({
      conversationId: 'session:demo:crewai-chat',
      turnId: 'turn:session:demo:crewai-chat:100',
      userMessageId: 'message:user:session:demo:crewai-chat:100',
      assistantMessageId: 'message:assistant:session:demo:crewai-chat:100'
    });

    await sessionState.send('再查一遍');
    await nextTick();

    expect(sessionState.sessionId.value).toBe('crewai-session-1');
    expect(capturedBodies[1]).toEqual({
      message: '再查一遍',
      session_id: 'crewai-session-1'
    });

    scope.stop();
  });

});
