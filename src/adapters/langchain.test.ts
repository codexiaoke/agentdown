import { describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, type Component } from 'vue';
import { createMarkdownAssembler } from '../runtime/assemblers';
import { createBridge } from '../runtime/createBridge';
import type { RunSurfaceApprovalActionContext } from '../surface/types';
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
          output: 'content=\'{"city":"北京","condition":"晴","tempC":26}\' name=\'lookup_weather\' tool_call_id=\'call-weather-1\''
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

  it('creates a visible assistant error block when the run fails', () => {
    const bridge = createLangChainTestBridge();

    bridge.push([
      {
        event: 'on_chain_start',
        run_id: 'run-error-1',
        name: 'LangGraph'
      },
      {
        event: 'error',
        run_id: 'run-error-1',
        data: {
          message: 'Weather API timeout.'
        }
      }
    ]);
    bridge.flush('langchain-run-error');

    const snapshot = bridge.runtime.snapshot();
    const errorBlock = snapshot.blocks.find((block) => block.type === 'error');

    expect(errorBlock).toMatchObject({
      renderer: 'error',
      data: {
        kind: 'error',
        title: '运行失败',
        message: 'Weather API timeout.',
        refId: 'run-error-1'
      }
    });
  });

  it('maps a LangChain HITL interrupt into approval blocks and marks the run as paused', () => {
    const bridge = createLangChainTestBridge();

    bridge.push([
      {
        event: 'on_chain_start',
        run_id: 'run-hitl-1',
        name: 'LangGraph',
        metadata: {
          thread_id: 'thread-hitl-1'
        }
      },
      {
        event: 'on_chain_stream',
        run_id: 'run-hitl-1',
        name: 'LangGraph',
        metadata: {
          thread_id: 'thread-hitl-1'
        },
        data: {
          chunk: {
            __interrupt__: [
              {
                id: 'interrupt-hitl-1',
                value: {
                  action_requests: [
                    {
                      name: 'lookup_weather',
                      args: {
                        city: '北京'
                      },
                      description: '请确认是否执行天气查询工具。'
                    }
                  ],
                  review_configs: [
                    {
                      action_name: 'lookup_weather',
                      allowed_decisions: ['approve', 'edit', 'reject']
                    }
                  ]
                }
              }
            ]
          }
        }
      },
      {
        event: 'on_chain_end',
        run_id: 'run-hitl-1',
        name: 'LangGraph',
        metadata: {
          thread_id: 'thread-hitl-1'
        }
      }
    ]);
    bridge.flush('langchain-hitl');

    const snapshot = bridge.runtime.snapshot();
    const runNode = snapshot.nodes.find((node) => node.id === 'run-hitl-1');
    const approvalBlock = snapshot.blocks.find((block) => block.type === 'approval');
    const textBlocks = snapshot.blocks.filter((block) => block.type === 'text');

    expect(runNode?.status).toBe('paused');
    expect(approvalBlock?.data).toMatchObject({
      interruptId: 'interrupt-hitl-1',
      interruptIndex: 0,
      interruptCount: 1,
      toolName: 'lookup_weather',
      toolArgs: {
        city: '北京'
      },
      allowedDecisions: ['approve', 'edit', 'reject']
    });
    expect(textBlocks).toHaveLength(0);
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
      message(source: string) {
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

  it('continues a paused LangChain interrupt through the same SSE endpoint on approval', async () => {
    const scope = effectScope();
    const prompt = ref('帮我查一下北京天气');
    const capturedBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as Record<string, unknown>
        : {};

      capturedBodies.push(body);

      if (capturedBodies.length === 1) {
        return createLangChainSseResponse([
          {
            event: 'on_chain_start',
            run_id: 'run-hitl-langchain-1',
            name: 'LangGraph',
            metadata: {
              thread_id: 'langchain-thread-1'
            }
          },
          {
            event: 'on_chain_stream',
            run_id: 'run-hitl-langchain-1',
            name: 'LangGraph',
            metadata: {
              thread_id: 'langchain-thread-1'
            },
            data: {
              chunk: {
                __interrupt__: [
                  {
                    id: 'interrupt-langchain-1',
                    value: {
                      action_requests: [
                        {
                          name: 'lookup_weather',
                          args: {
                            city: '北京'
                          },
                          description: '请确认是否执行天气查询工具。'
                        }
                      ],
                      review_configs: [
                        {
                          action_name: 'lookup_weather',
                          allowed_decisions: ['approve', 'edit', 'reject']
                        }
                      ]
                    }
                  }
                ]
              }
            }
          },
          {
            event: 'on_chain_end',
            run_id: 'run-hitl-langchain-1',
            name: 'LangGraph',
            metadata: {
              thread_id: 'langchain-thread-1'
            }
          }
        ]);
      }

      return createLangChainSseResponse([
        {
          event: 'on_chain_start',
          run_id: 'run-hitl-langchain-2',
          name: 'LangGraph',
          metadata: {
            thread_id: 'langchain-thread-1'
          }
        },
        {
          event: 'on_tool_start',
          run_id: 'tool-hitl-langchain-1',
          parent_ids: ['run-hitl-langchain-2'],
          name: 'lookup_weather',
          metadata: {
            thread_id: 'langchain-thread-1'
          },
          data: {
            input: {
              city: '北京'
            }
          }
        },
        {
          event: 'on_tool_end',
          run_id: 'tool-hitl-langchain-1',
          parent_ids: ['run-hitl-langchain-2'],
          name: 'lookup_weather',
          metadata: {
            thread_id: 'langchain-thread-1'
          },
          data: {
            output: 'content=\'{"city":"北京","condition":"晴","tempC":26}\' name=\'lookup_weather\' tool_call_id=\'call-weather-hitl-1\''
          }
        },
        {
          event: 'on_chat_model_stream',
          run_id: 'stream-hitl-langchain-1',
          parent_ids: ['run-hitl-langchain-2'],
          metadata: {
            thread_id: 'langchain-thread-1'
          },
          data: {
            chunk: {
              content: '根据查询结果，北京今天晴。'
            }
          }
        },
        {
          event: 'on_chain_end',
          run_id: 'run-hitl-langchain-2',
          name: 'LangGraph',
          metadata: {
            thread_id: 'langchain-thread-1'
          }
        }
      ]);
    });
    const sessionState = scope.run(() => useLangChainChatSession<string>({
      source: 'http://langchain.test/api/stream',
      input: prompt,
      conversationId: 'session:demo:langchain-hitl',
      mode: 'hitl',
      transport: {
        fetch: fetchMock as typeof fetch
      }
    }));

    if (!sessionState) {
      throw new Error('Failed to create LangChain HITL session.');
    }

    await sessionState.send();
    await nextTick();

    const pausedSnapshot = sessionState.runtime.snapshot();
    const approvalBlock = pausedSnapshot.blocks.find((block) => block.type === 'approval');
    const approvalHandler = sessionState.surface.value.approvalActions !== false
      ? sessionState.surface.value.approvalActions?.builtinHandlers?.approve
      : undefined;

    expect(sessionState.sessionId.value).toBe('langchain-thread-1');
    expect(sessionState.awaitingHumanInput.value).toBe(true);
    expect(sessionState.statusLabel.value).toBe('等待人工确认');
    expect(capturedBodies[0]).toEqual({
      message: '帮我查一下北京天气',
      mode: 'hitl'
    });

    if (!approvalBlock || !approvalHandler) {
      throw new Error('Failed to resolve LangChain approval action wiring.');
    }

    const context: RunSurfaceApprovalActionContext = {
      title: String(approvalBlock.data.title ?? '工具调用确认'),
      status: 'pending',
      ...(typeof approvalBlock.data.message === 'string'
        ? {
            message: approvalBlock.data.message
          }
        : {}),
      ...(typeof approvalBlock.data.approvalId === 'string'
        ? {
            approvalId: approvalBlock.data.approvalId
          }
        : {}),
      ...(typeof approvalBlock.data.refId === 'string'
        ? {
            refId: approvalBlock.data.refId
          }
        : {}),
      block: approvalBlock,
      role: 'assistant',
      runtime: sessionState.runtime,
      snapshot: pausedSnapshot,
      emitIntent: () => {
        throw new Error('emitIntent should not be called in this test.');
      }
    };

    await approvalHandler(context);
    await nextTick();

    const finalSnapshot = sessionState.runtime.snapshot();
    const finalApprovalBlock = finalSnapshot.blocks.find((block) => block.id === approvalBlock.id);
    const finalToolNode = finalSnapshot.nodes.find((node) => node.id === 'tool-hitl-langchain-1');
    const resumedTextBlock = finalSnapshot.blocks.find((block) => (
      block.type === 'text' && block.content === '根据查询结果，北京今天晴。'
    ));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(capturedBodies[1]).toEqual({
      session_id: 'langchain-thread-1',
      mode: 'hitl',
      langchain_resume: {
        decisions: [
          {
            type: 'approve'
          }
        ]
      }
    });
    expect(finalApprovalBlock?.data.status).toBe('approved');
    expect(finalToolNode?.status).toBe('done');
    expect(finalToolNode?.data.result).toEqual({
      city: '北京',
      condition: '晴',
      tempC: 26
    });
    expect(resumedTextBlock?.messageId).toBe(sessionState.chatIds.value?.assistantMessageId);

    scope.stop();
  });

  it('allows a custom LangChain HITL handler to extend the decision payload and run side effects', async () => {
    const scope = effectScope();
    const prompt = ref('帮我查一下北京天气');
    const capturedBodies: Array<Record<string, unknown>> = [];
    const sideEffects: string[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as Record<string, unknown>
        : {};

      capturedBodies.push(body);

      if (capturedBodies.length === 1) {
        return createLangChainSseResponse([
          {
            event: 'on_chain_start',
            run_id: 'run-hitl-langchain-custom-1',
            name: 'LangGraph',
            metadata: {
              thread_id: 'langchain-thread-custom-1'
            }
          },
          {
            event: 'on_chain_stream',
            run_id: 'run-hitl-langchain-custom-1',
            name: 'LangGraph',
            metadata: {
              thread_id: 'langchain-thread-custom-1'
            },
            data: {
              chunk: {
                __interrupt__: [
                  {
                    id: 'interrupt-langchain-custom-1',
                    value: {
                      action_requests: [
                        {
                          name: 'lookup_weather',
                          args: {
                            city: '北京'
                          },
                          description: '请确认是否执行天气查询工具。'
                        }
                      ],
                      review_configs: [
                        {
                          action_name: 'lookup_weather',
                          allowed_decisions: ['approve', 'edit', 'reject']
                        }
                      ]
                    }
                  }
                ]
              }
            }
          },
          {
            event: 'on_chain_end',
            run_id: 'run-hitl-langchain-custom-1',
            name: 'LangGraph',
            metadata: {
              thread_id: 'langchain-thread-custom-1'
            }
          }
        ]);
      }

      return createLangChainSseResponse([
        {
          event: 'on_chain_start',
          run_id: 'run-hitl-langchain-custom-2',
          name: 'LangGraph',
          metadata: {
            thread_id: 'langchain-thread-custom-1'
          }
        },
        {
          event: 'on_chain_end',
          run_id: 'run-hitl-langchain-custom-2',
          name: 'LangGraph',
          metadata: {
            thread_id: 'langchain-thread-custom-1'
          }
        }
      ]);
    });
    const sessionState = scope.run(() => useLangChainChatSession<string>({
      source: 'http://langchain.test/api/stream',
      input: prompt,
      conversationId: 'session:demo:langchain-hitl-custom',
      mode: 'hitl',
      hitl: {
        handlers: {
          approve: async (context) => {
            sideEffects.push(`before:${context.actionKey}:${context.target.interruptId}`);
            expect(context.defaultDecision).toEqual({
              type: 'approve'
            });

            await context.submitDecision({
              ...context.defaultDecision,
              message: '用户已确认，并要求补充工具调用过程。'
            });
            sideEffects.push('after:approve');
          }
        }
      },
      transport: {
        fetch: fetchMock as typeof fetch
      }
    }));

    if (!sessionState) {
      throw new Error('Failed to create LangChain custom HITL session.');
    }

    await sessionState.send();
    await nextTick();

    const pausedSnapshot = sessionState.runtime.snapshot();
    const approvalBlock = pausedSnapshot.blocks.find((block) => block.type === 'approval');
    const approvalHandler = sessionState.surface.value.approvalActions !== false
      ? sessionState.surface.value.approvalActions?.builtinHandlers?.approve
      : undefined;

    if (!approvalBlock || !approvalHandler) {
      throw new Error('Failed to resolve LangChain custom HITL approval wiring.');
    }

    const context: RunSurfaceApprovalActionContext = {
      title: String(approvalBlock.data.title ?? '工具调用确认'),
      status: 'pending',
      ...(typeof approvalBlock.data.message === 'string'
        ? {
            message: approvalBlock.data.message
          }
        : {}),
      ...(typeof approvalBlock.data.approvalId === 'string'
        ? {
            approvalId: approvalBlock.data.approvalId
          }
        : {}),
      ...(typeof approvalBlock.data.refId === 'string'
        ? {
            refId: approvalBlock.data.refId
          }
        : {}),
      block: approvalBlock,
      role: 'assistant',
      runtime: sessionState.runtime,
      snapshot: pausedSnapshot,
      emitIntent: () => {
        throw new Error('emitIntent should not be called in this test.');
      }
    };

    await approvalHandler(context);
    await nextTick();

    expect(sideEffects).toEqual([
      'before:approve:interrupt-langchain-custom-1',
      'after:approve'
    ]);
    expect(capturedBodies[1]).toEqual({
      session_id: 'langchain-thread-custom-1',
      mode: 'hitl',
      langchain_resume: {
        decisions: [
          {
            type: 'approve',
            message: '用户已确认，并要求补充工具调用过程。'
          }
        ]
      }
    });

    scope.stop();
  });

  it('allows a custom LangChain HITL handler to submit an official edit decision', async () => {
    const scope = effectScope();
    const prompt = ref('帮我查一下北京天气');
    const capturedBodies: Array<Record<string, unknown>> = [];
    const sideEffects: string[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as Record<string, unknown>
        : {};

      capturedBodies.push(body);

      if (capturedBodies.length === 1) {
        return createLangChainSseResponse([
          {
            event: 'on_chain_start',
            run_id: 'run-hitl-langchain-edit-1',
            name: 'LangGraph',
            metadata: {
              thread_id: 'langchain-thread-edit-1'
            }
          },
          {
            event: 'on_chain_stream',
            run_id: 'run-hitl-langchain-edit-1',
            name: 'LangGraph',
            metadata: {
              thread_id: 'langchain-thread-edit-1'
            },
            data: {
              chunk: {
                __interrupt__: [
                  {
                    id: 'interrupt-langchain-edit-1',
                    value: {
                      action_requests: [
                        {
                          name: 'lookup_weather',
                          args: {
                            city: '北京'
                          },
                          description: '请确认是否执行天气查询工具。'
                        }
                      ],
                      review_configs: [
                        {
                          action_name: 'lookup_weather',
                          allowed_decisions: ['approve', 'edit', 'reject']
                        }
                      ]
                    }
                  }
                ]
              }
            }
          },
          {
            event: 'on_chain_end',
            run_id: 'run-hitl-langchain-edit-1',
            name: 'LangGraph',
            metadata: {
              thread_id: 'langchain-thread-edit-1'
            }
          }
        ]);
      }

      return createLangChainSseResponse([
        {
          event: 'on_chain_start',
          run_id: 'run-hitl-langchain-edit-2',
          name: 'LangGraph',
          metadata: {
            thread_id: 'langchain-thread-edit-1'
          }
        },
        {
          event: 'on_chain_end',
          run_id: 'run-hitl-langchain-edit-2',
          name: 'LangGraph',
          metadata: {
            thread_id: 'langchain-thread-edit-1'
          }
        }
      ]);
    });
    const sessionState = scope.run(() => useLangChainChatSession<string>({
      source: 'http://langchain.test/api/stream',
      input: prompt,
      conversationId: 'session:demo:langchain-hitl-edit',
      mode: 'hitl',
      hitl: {
        handlers: {
          changes_requested: async (context) => {
            sideEffects.push(`before:${context.actionKey}:${String(context.target.toolArgs?.city ?? '')}`);

            await context.submitDecision({
              type: 'edit',
              message: '请改查上海，并说明这是人工改参。',
              edited_action: {
                name: context.target.toolName ?? 'lookup_weather',
                args: {
                  ...(context.target.toolArgs ?? {}),
                  city: '上海'
                }
              }
            });

            sideEffects.push('after:changes_requested');
          }
        }
      },
      transport: {
        fetch: fetchMock as typeof fetch
      }
    }));

    if (!sessionState) {
      throw new Error('Failed to create LangChain edit HITL session.');
    }

    await sessionState.send();
    await nextTick();

    const pausedSnapshot = sessionState.runtime.snapshot();
    const approvalBlock = pausedSnapshot.blocks.find((block) => block.type === 'approval');
    const changeHandler = sessionState.surface.value.approvalActions !== false
      ? sessionState.surface.value.approvalActions?.builtinHandlers?.changes_requested
      : undefined;

    if (!approvalBlock || !changeHandler) {
      throw new Error('Failed to resolve LangChain edit approval wiring.');
    }

    const context: RunSurfaceApprovalActionContext = {
      title: String(approvalBlock.data.title ?? '工具调用确认'),
      status: 'pending',
      message: '请改查上海。',
      ...(typeof approvalBlock.data.approvalId === 'string'
        ? {
            approvalId: approvalBlock.data.approvalId
          }
        : {}),
      ...(typeof approvalBlock.data.refId === 'string'
        ? {
            refId: approvalBlock.data.refId
          }
        : {}),
      block: approvalBlock,
      role: 'assistant',
      runtime: sessionState.runtime,
      snapshot: pausedSnapshot,
      emitIntent: () => {
        throw new Error('emitIntent should not be called in this test.');
      }
    };

    await changeHandler(context);
    await nextTick();

    const resumedSnapshot = sessionState.runtime.snapshot();
    const resumedApprovalBlock = resumedSnapshot.blocks.find((block) => block.id === approvalBlock.id);

    expect(sideEffects).toEqual([
      'before:changes_requested:北京',
      'after:changes_requested'
    ]);
    expect(capturedBodies[1]).toEqual({
      session_id: 'langchain-thread-edit-1',
      mode: 'hitl',
      langchain_resume: {
        decisions: [
          {
            type: 'edit',
            message: '请改查上海，并说明这是人工改参。',
            edited_action: {
              name: 'lookup_weather',
              args: {
                city: '上海'
              }
            }
          }
        ]
      }
    });
    expect(resumedApprovalBlock?.data.status).toBe('changes_requested');

    scope.stop();
  });
});
