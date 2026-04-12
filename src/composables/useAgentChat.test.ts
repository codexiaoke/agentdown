import { effectScope, nextTick, ref, type Component } from 'vue';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { EventComponentDefinitionMap } from '../adapters/eventComponentRegistry';
import type { ToolNameComponentMap } from '../adapters/toolNameRegistry';
import type { EventActionDefinitionMap } from '../runtime/eventActions';
import {
  agnoChatFramework,
  builtinAgentChatFrameworks,
  createAgentChatFrameworkRegistry,
  defineAgentChatFramework,
  normalizeAgentChatEventActionDefinitions,
  normalizeAgentChatEventComponentDefinitions,
  normalizeAgentChatToolDefinitions,
  resolveAgentChatFrameworkDriver,
  springAiChatFramework,
  type AgentChatEventActionMap,
  type AgentChatEventComponentMap,
  type AgentChatFrameworkRegistry,
  type AgentChatFrameworkSessionOptions,
  type AgentChatToolMap,
  useAgentChat
} from './useAgentChat';
import type { AgnoEvent } from '../adapters/agno';
import type { LangChainEvent } from '../adapters/langchain';
import type { AutoGenEvent } from '../adapters/autogen';
import type { CrewAIEvent } from '../adapters/crewai';
import type { SpringAiEvent } from '../adapters/springai';

/**
 * 判断一个类型是否被污染成 `any`。
 */
type IsAny<T> = 0 extends (1 & T) ? true : false;

/**
 * 把一组 Agno 事件包装成最小可用的 SSE Response。
 */
function createAgnoSseResponse(events: AgnoEvent[]): Response {
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

/**
 * 把一组 Spring AI 事件包装成最小可用的 SSE Response。
 */
function createSpringAiSseResponse(events: SpringAiEvent[]): Response {
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

describe('useAgentChat', () => {
  it('resolves built-in framework ids through the shared registry', () => {
    const registry = createAgentChatFrameworkRegistry({
      agno: agnoChatFramework
    });

    expectTypeOf(registry).toMatchTypeOf<AgentChatFrameworkRegistry>();
    expect(builtinAgentChatFrameworks.agno).toBe(agnoChatFramework);
    expect(builtinAgentChatFrameworks.springai).toBe(springAiChatFramework);
    expect(resolveAgentChatFrameworkDriver('agno')).toBe(agnoChatFramework);
    expect(resolveAgentChatFrameworkDriver('springai')).toBe(springAiChatFramework);
  });

  it('accepts simple Agno tool/event/action maps through the unified API', async () => {
    const scope = effectScope();
    const prompt = ref('帮我查一下北京天气');
    const eventSessions: string[] = [];
    const WeatherToolCard = {} as Component;
    const WeatherEventCard = {} as Component;
    const sessionState = scope.run(() => useAgentChat<string>({
      framework: 'agno',
      source: 'http://agno.test/api/stream',
      input: prompt,
      conversationId: 'session:demo:agent-chat-agno',
      title: 'Agno 助手',
      tools: {
        lookup_weather: WeatherToolCard
      },
      events: {
        weather_card: WeatherEventCard
      },
      eventActions: {
        CreateSession({ event }) {
          eventSessions.push((event as AgnoEvent).session_id ?? '');
        }
      },
      transport: {
        fetch: (async () => createAgnoSseResponse([
          {
            event: 'CreateSession',
            session_id: 'session-agno-1'
          },
          {
            event: 'RunStarted',
            run_id: 'run-agno-1',
            session_id: 'session-agno-1'
          },
          {
            event: 'ToolCallCompleted',
            run_id: 'run-agno-1',
            tool: {
              id: 'tool-agno-1',
              tool_name: 'lookup_weather',
              result: {
                city: '北京',
                condition: '晴'
              }
            }
          },
          {
            event: 'weather_card',
            run_id: 'run-agno-1',
            result: {
              city: '北京',
              condition: '晴'
            }
          },
          {
            event: 'RunContent',
            run_id: 'run-agno-1',
            content: '我来为你查询天气'
          },
          {
            event: 'RunContentCompleted',
            run_id: 'run-agno-1'
          },
          {
            event: 'RunCompleted',
            run_id: 'run-agno-1'
          }
        ])) as typeof fetch
      }
    }));

    expectTypeOf<IsAny<typeof sessionState>>().toEqualTypeOf<false>();

    if (!sessionState) {
      throw new Error('Failed to create unified Agno chat session.');
    }

    await sessionState.send();
    await nextTick();

    const snapshot = sessionState.runtime.snapshot();
    const toolBlock = snapshot.blocks.find((block: any) => block.nodeId === 'tool-agno-1');
    const eventBlock = snapshot.blocks.find((block: any) => block.renderer === 'weather_card');
    const assistantBlock = snapshot.blocks.find((block: any) => block.messageId === sessionState.chatIds.value?.assistantMessageId);

    expect(eventSessions).toEqual(['session-agno-1']);
    expect(sessionState.sessionId.value).toBe('session-agno-1');
    expect(toolBlock?.renderer).toBe('lookup_weather');
    expect(eventBlock?.renderer).toBe('weather_card');
    expect(assistantBlock?.content).toBe('我来为你查询天气');

    scope.stop();
  });

  it('routes LangChain through the unified API and keeps side effects outside UI blocks', async () => {
    const scope = effectScope();
    const prompt = ref('帮我查一下北京天气');
    const seenSessions: string[] = [];
    const WeatherToolCard = {} as Component;
    const sessionState = scope.run(() => useAgentChat<string>({
      framework: 'langchain',
      source: 'http://langchain.test/api/stream',
      input: prompt,
      conversationId: 'session:demo:agent-chat-langchain',
      title: 'LangChain 助手',
      tools: {
        lookup_weather: WeatherToolCard
      },
      eventActions: {
        SessionCreated({ event }) {
          const metadata = (event as LangChainEvent).metadata as Record<string, unknown> | undefined;
          seenSessions.push((metadata?.session_id as string) ?? '');
        }
      },
      transport: {
        fetch: (async () => createLangChainSseResponse([
          {
            event: 'SessionCreated',
            metadata: {
              session_id: 'session-langchain-1'
            }
          },
          {
            event: 'on_chain_start',
            run_id: 'run-langchain-1',
            name: 'LangGraph',
            metadata: {
              session_id: 'session-langchain-1'
            }
          },
          {
            event: 'on_tool_start',
            run_id: 'tool-langchain-1',
            parent_ids: ['run-langchain-1'],
            name: 'lookup_weather',
            data: {
              input: {
                city: '北京'
              }
            }
          },
          {
            event: 'on_tool_end',
            run_id: 'tool-langchain-1',
            parent_ids: ['run-langchain-1'],
            name: 'lookup_weather',
            data: {
              output: {
                content: '{"city":"北京","condition":"晴"}'
              }
            }
          },
          {
            event: 'on_chat_model_stream',
            run_id: 'stream-langchain-1',
            parent_ids: ['run-langchain-1'],
            data: {
              chunk: {
                content: '我来为你查询天气'
              }
            }
          },
          {
            event: 'on_chain_end',
            run_id: 'run-langchain-1',
            name: 'LangGraph'
          }
        ])) as typeof fetch
      }
    }));

    expectTypeOf<IsAny<typeof sessionState>>().toEqualTypeOf<false>();

    if (!sessionState) {
      throw new Error('Failed to create unified LangChain chat session.');
    }

    await sessionState.send();
    await nextTick();

    const snapshot = sessionState.runtime.snapshot();
    const toolBlock = snapshot.blocks.find((block: any) => block.nodeId === 'tool-langchain-1');

    expect(seenSessions).toEqual(['session-langchain-1']);
    expect(sessionState.sessionId.value).toBe('session-langchain-1');
    expect(toolBlock?.renderer).toBe('lookup_weather');

    scope.stop();
  });

  it('routes Spring AI through the unified API and keeps approval side effects outside UI blocks', async () => {
    const scope = effectScope();
    const prompt = ref('帮我查一下北京天气');
    const seenSessions: string[] = [];
    const WeatherToolCard = {} as Component;
    const sessionState = scope.run(() => useAgentChat<string>({
      framework: 'springai',
      source: 'http://springai.test/api/stream',
      input: prompt,
      conversationId: 'session:demo:agent-chat-springai',
      title: 'Spring AI 助手',
      tools: {
        lookup_weather: WeatherToolCard
      },
      eventActions: {
        session_created({ event }) {
          const payload = event as SpringAiEvent;
          const metadata = payload.metadata as Record<string, unknown> | undefined;
          seenSessions.push((metadata?.session_id as string) ?? '');
        }
      },
      transport: {
        fetch: (async () => createSpringAiSseResponse([
          {
            event: 'session.created',
            metadata: {
              session_id: 'session-springai-1',
              conversation_id: 'session-springai-1'
            },
            data: {
              session_id: 'session-springai-1',
              conversation_id: 'session-springai-1'
            }
          },
          {
            event: 'run.started',
            metadata: {
              session_id: 'session-springai-1',
              conversation_id: 'session-springai-1',
              run_id: 'run-springai-1',
              turn_id: 'turn:session-springai-1:1',
              group_id: 'turn:session-springai-1:1'
            },
            data: {
              mode: 'hitl',
              group_id: 'turn:session-springai-1:1'
            }
          },
          {
            event: 'response.started',
            metadata: {
              session_id: 'session-springai-1',
              conversation_id: 'session-springai-1',
              run_id: 'run-springai-1',
              turn_id: 'turn:session-springai-1:1',
              group_id: 'turn:session-springai-1:1',
              message_id: 'message:assistant:turn:session-springai-1:1:0'
            },
            data: {
              role: 'assistant',
              step: 0
            }
          },
          {
            event: 'response.delta',
            metadata: {
              session_id: 'session-springai-1',
              conversation_id: 'session-springai-1',
              run_id: 'run-springai-1',
              turn_id: 'turn:session-springai-1:1',
              group_id: 'turn:session-springai-1:1',
              message_id: 'message:assistant:turn:session-springai-1:1:0'
            },
            data: {
              content: '我来帮您查询北京天气。'
            }
          },
          {
            event: 'approval.required',
            metadata: {
              session_id: 'session-springai-1',
              conversation_id: 'session-springai-1',
              run_id: 'run-springai-1',
              turn_id: 'turn:session-springai-1:1',
              group_id: 'turn:session-springai-1:1',
              message_id: 'message:assistant:turn:session-springai-1:1:0'
            },
            data: {
              interrupt_id: 'run-springai-1',
              assistant_text: '我来帮您查询北京天气。',
              action_requests: [
                {
                  requirement_id: 'requirement-springai-1',
                  tool_call_id: 'call-springai-1',
                  name: 'lookup_weather',
                  args: {
                    city: '北京'
                  },
                  allowed_decisions: ['approve', 'edit', 'reject']
                }
              ],
              reason_required_decisions: ['edit', 'reject']
            }
          },
          {
            event: 'response.completed',
            metadata: {
              session_id: 'session-springai-1',
              conversation_id: 'session-springai-1',
              run_id: 'run-springai-1',
              turn_id: 'turn:session-springai-1:1',
              group_id: 'turn:session-springai-1:1',
              message_id: 'message:assistant:turn:session-springai-1:1:0'
            },
            data: {
              status: 'paused',
              content: '我来帮您查询北京天气。'
            }
          },
          {
            event: 'run.completed',
            metadata: {
              session_id: 'session-springai-1',
              conversation_id: 'session-springai-1',
              run_id: 'run-springai-1',
              turn_id: 'turn:session-springai-1:1',
              group_id: 'turn:session-springai-1:1'
            },
            data: {
              status: 'paused'
            }
          }
        ])) as typeof fetch
      }
    }));

    expectTypeOf<IsAny<typeof sessionState>>().toEqualTypeOf<false>();

    if (!sessionState) {
      throw new Error('Failed to create unified Spring AI chat session.');
    }

    await sessionState.send();
    await nextTick();

    const snapshot = sessionState.runtime.snapshot();
    const toolBlock = snapshot.blocks.find((block: any) => block.nodeId === 'call-springai-1');
    const approvalBlock = snapshot.blocks.find((block: any) => block.type === 'approval');

    expect(seenSessions).toEqual(['session-springai-1']);
    expect(sessionState.sessionId.value).toBe('session-springai-1');
    expect(toolBlock?.renderer).toBe('lookup_weather');
    expect(approvalBlock?.data.requirementId).toBe('requirement-springai-1');

    scope.stop();
  });

  it('routes AutoGen through the unified API with simple event side effects', async () => {
    const scope = effectScope();
    const prompt = ref('帮我查一下北京天气');
    const seenSessions: string[] = [];
    const WeatherToolCard = {} as Component;
    const sessionState = scope.run(() => useAgentChat<string>({
      framework: 'autogen',
      source: 'http://autogen.test/api/stream',
      input: prompt,
      conversationId: 'session:demo:agent-chat-autogen',
      title: 'AutoGen 助手',
      tools: {
        lookup_weather: WeatherToolCard
      },
      eventActions: {
        CreateSession({ event }) {
          const metadata = (event as AutoGenEvent).metadata as Record<string, unknown> | undefined;
          seenSessions.push((metadata?.session_id as string) ?? '');
        }
      },
      transport: {
        fetch: (async () => createAutoGenSseResponse([
          {
            type: 'CreateSession',
            metadata: {
              session_id: 'session-autogen-1'
            }
          },
          {
            type: 'TaskStarted',
            id: 'task-autogen-1',
            metadata: {
              session_id: 'session-autogen-1'
            }
          },
          {
            type: 'ToolCallRequestEvent',
            id: 'tool-request-autogen-1',
            source: 'assistant',
            content: [
              {
                id: 'tool-autogen-1',
                name: 'lookup_weather',
                arguments: '{"city":"北京"}'
              }
            ]
          },
          {
            type: 'ToolCallExecutionEvent',
            id: 'tool-execution-autogen-1',
            source: 'assistant',
            content: [
              {
                call_id: 'tool-autogen-1',
                name: 'lookup_weather',
                content: '{"city":"北京","condition":"晴"}',
                is_error: false
              }
            ]
          },
          {
            type: 'ModelClientStreamingChunkEvent',
            id: 'chunk-autogen-1',
            source: 'assistant',
            full_message_id: 'assistant-autogen-1',
            content: '我来为你查询天气'
          },
          {
            type: 'TaskResult',
            id: 'task-result-autogen-1',
            messages: []
          }
        ])) as typeof fetch
      }
    }));

    expectTypeOf<IsAny<typeof sessionState>>().toEqualTypeOf<false>();

    if (!sessionState) {
      throw new Error('Failed to create unified AutoGen chat session.');
    }

    await sessionState.send();
    await nextTick();

    const snapshot = sessionState.runtime.snapshot();
    const toolBlock = snapshot.blocks.find((block: any) => block.nodeId === 'tool-autogen-1');

    expect(seenSessions).toEqual(['session-autogen-1']);
    expect(sessionState.sessionId.value).toBe('session-autogen-1');
    expect(toolBlock?.renderer).toBe('lookup_weather');

    scope.stop();
  });

  it('routes CrewAI through the unified API with simple event side effects', async () => {
    const scope = effectScope();
    const prompt = ref('帮我查一下北京天气');
    const seenSessions: string[] = [];
    const WeatherToolCard = {} as Component;
    const sessionState = scope.run(() => useAgentChat<string>({
      framework: 'crewai',
      source: 'http://crewai.test/api/stream',
      input: prompt,
      conversationId: 'session:demo:agent-chat-crewai',
      title: 'CrewAI 助手',
      tools: {
        lookup_weather: WeatherToolCard
      },
      eventActions: {
        CreateSession({ event }) {
          seenSessions.push((event as CrewAIEvent).session_id ?? '');
        }
      },
      transport: {
        fetch: (async () => createCrewAISseResponse([
          {
            event: 'CreateSession',
            type: 'CreateSession',
            session_id: 'session-crewai-1'
          },
          {
            event: 'Chunk',
            type: 'Chunk',
            session_id: 'session-crewai-1',
            agent_id: 'agent-crewai-1',
            agent_role: 'Weather Researcher',
            chunk_type: {
              _value_: 'tool_call'
            },
            content: '',
            tool_call: {
              tool_id: 'tool-crewai-1',
              tool_name: 'lookup_weather',
              arguments: '{"city":"北京"}'
            }
          },
          {
            event: 'CrewOutput',
            type: 'CrewOutput',
            raw: '我来为你查询天气',
            tasks_output: [
              {
                agent: 'Weather Researcher',
                messages: [
                  {
                    role: 'assistant',
                    content: '',
                    tool_calls: [
                      {
                        id: 'tool-crewai-1',
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
                    tool_call_id: 'tool-crewai-1',
                    content: '{"city":"北京","condition":"晴"}'
                  },
                  {
                    role: 'assistant',
                    content: '我来为你查询天气'
                  }
                ]
              }
            ]
          }
        ])) as typeof fetch
      }
    }));

    expectTypeOf<IsAny<typeof sessionState>>().toEqualTypeOf<false>();

    if (!sessionState) {
      throw new Error('Failed to create unified CrewAI chat session.');
    }

    await sessionState.send();
    await nextTick();

    const snapshot = sessionState.runtime.snapshot();
    const toolBlock = snapshot.blocks.find((block: any) => block.nodeId === 'tool-crewai-1');

    expect(seenSessions).toEqual(['session-crewai-1']);
    expect(sessionState.sessionId.value).toBe('session-crewai-1');
    expect(toolBlock?.renderer).toBe('lookup_weather');

    scope.stop();
  });

  it('accepts custom framework drivers instead of locking framework to built-in ids', () => {
    interface CustomEvent {
      type: string;
      session_id?: string;
    }

    interface CustomSessionOptions extends AgentChatFrameworkSessionOptions<string> {
      conversationId: string;
      title?: string;
      tools?: ToolNameComponentMap;
      events?: EventComponentDefinitionMap<CustomEvent>;
      eventActions?: EventActionDefinitionMap<CustomEvent>;
    }

    interface CustomSessionResult {
      driverId: string;
      options: CustomSessionOptions;
    }

    const WeatherToolCard = {} as Component;
    const WeatherEventCard = {} as Component;
    let capturedOptions: CustomSessionOptions | undefined;

    const customFramework = defineAgentChatFramework<
      string,
      CustomSessionOptions,
      CustomSessionResult,
      AgentChatToolMap,
      AgentChatEventComponentMap<CustomEvent>,
      AgentChatEventActionMap<CustomEvent>
    >({
      id: 'custom-sse',
      resolveTools(input) {
        return normalizeAgentChatToolDefinitions(input);
      },
      resolveEvents(input) {
        return normalizeAgentChatEventComponentDefinitions(input);
      },
      resolveEventActions(input) {
        return normalizeAgentChatEventActionDefinitions(input);
      },
      useChatSession(options) {
        capturedOptions = options;

        return {
          driverId: 'custom-sse',
          options
        };
      }
    });

    const result = useAgentChat({
      framework: customFramework,
      source: 'http://custom.test/api/stream',
      conversationId: 'session:demo:custom-framework',
      title: 'Custom 助手',
      tools: {
        lookup_weather: WeatherToolCard
      },
      events: {
        WeatherSnapshot: WeatherEventCard
      },
      eventActions: {
        CreateSession() {
          return undefined;
        }
      }
    });

    expectTypeOf<IsAny<typeof result>>().toEqualTypeOf<false>();
    expectTypeOf(result).toEqualTypeOf<CustomSessionResult>();
    expect(result.driverId).toBe('custom-sse');
    expect(capturedOptions?.conversationId).toBe('session:demo:custom-framework');
    expect(capturedOptions?.tools?.lookup_weather).toEqual({
      match: 'lookup_weather',
      component: WeatherToolCard
    });
    expect(capturedOptions?.events?.WeatherSnapshot?.on).toBe('WeatherSnapshot');
    expect(capturedOptions?.events?.WeatherSnapshot).toMatchObject({
      component: WeatherEventCard
    });
    expect(capturedOptions?.eventActions?.CreateSession?.on).toBe('CreateSession');
    expect(typeof capturedOptions?.eventActions?.CreateSession?.run).toBe('function');
  });
});
