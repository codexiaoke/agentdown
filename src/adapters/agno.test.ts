import { describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, type Component } from 'vue';
import { createMarkdownAssembler } from '../runtime/assemblers';
import { createBridge } from '../runtime/createBridge';
import type { RunSurfaceApprovalActionContext } from '../surface/types';
import {
  createAgnoAdapter,
  createAgnoChatIds,
  createAgnoProtocol,
  createAgnoSseTransport,
  defineAgnoEventComponents,
  defineAgnoToolComponents,
  type AgnoEvent,
  useAgnoChatSession
} from './agno';

/**
 * 创建一个用于测试 Agno adapter 的同步 bridge。
 */
function createAgnoTestBridge() {
  return createBridge<AgnoEvent>({
    scheduler: 'sync',
    protocol: createAgnoProtocol({
      toolRenderer: ({ tool }) => (
        tool?.tool_name === 'lookup_weather'
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
 * 创建一个会在外部 abort 时关闭的 SSE Response。
 */
function createAbortableAgnoSseResponse(events: AgnoEvent[], signal?: AbortSignal): Response {
  const encoder = new TextEncoder();

  return new Response(new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      signal?.addEventListener('abort', () => {
        controller.close();
      }, {
        once: true
      });
    }
  }), {
    headers: {
      'Content-Type': 'text/event-stream'
    }
  });
}

describe('createAgnoProtocol', () => {
  it('maps a full Agno run into runtime nodes and stable markdown blocks', () => {
    const bridge = createAgnoTestBridge();

    bridge.push([
      {
        event: 'RunStarted',
        run_id: 'run-1',
        agent_name: '天气助手'
      },
      {
        event: 'RunContent',
        run_id: 'run-1',
        content: '我来为你查询天气'
      },
      {
        event: 'ToolCallStarted',
        run_id: 'run-1',
        tool: {
          id: 'tool-1',
          tool_name: 'lookup_weather',
          tool_args: {
            city: '北京'
          }
        }
      },
      {
        event: 'ToolCallCompleted',
        run_id: 'run-1',
        tool: {
          id: 'tool-1',
          tool_name: 'lookup_weather',
          result: {
            city: '北京',
            condition: '晴',
            tempC: 26
          }
        }
      },
      {
        event: 'RunContentCompleted',
        run_id: 'run-1'
      },
      {
        event: 'RunCompleted',
        run_id: 'run-1'
      }
    ]);
    bridge.flush('agno-test');

    const snapshot = bridge.runtime.snapshot();
    const runNode = snapshot.nodes.find((node) => node.id === 'run-1');
    const toolNode = snapshot.nodes.find((node) => node.id === 'tool-1');
    const toolBlock = snapshot.blocks.find((block) => block.nodeId === 'tool-1');
    const assistantTextBlock = snapshot.blocks.find((block) => block.type === 'text');

    expect(runNode?.title).toBe('天气助手');
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
    expect(toolBlock?.renderer).toBe('tool.weather');
    expect(assistantTextBlock?.content).toBe('我来为你查询天气');
  });

  it('creates a synthetic tool start when Agno only sends tool_call_completed', () => {
    const bridge = createAgnoTestBridge();

    bridge.push([
      {
        event: 'run_started',
        run_id: 'run-2'
      },
      {
        event: 'tool_call_completed',
        run_id: 'run-2',
        tool: {
          tool_name: 'lookup_weather',
          result: {
            city: '上海',
            condition: '多云'
          }
        }
      },
      {
        event: 'run_completed',
        run_id: 'run-2'
      }
    ]);
    bridge.flush('agno-tool-fallback');

    const snapshot = bridge.runtime.snapshot();
    const toolNode = snapshot.nodes.find((node) => node.parentId === 'run-2');
    const toolBlock = snapshot.blocks.find((block) => block.nodeId === toolNode?.id);

    expect(toolNode?.type).toBe('tool');
    expect(toolNode?.status).toBe('done');
    expect(toolNode?.data.result).toEqual({
      city: '上海',
      condition: '多云'
    });
    expect(toolBlock?.renderer).toBe('tool.weather');
  });

  it('normalizes python repr tool results into structured objects', () => {
    const bridge = createAgnoTestBridge();

    bridge.push([
      {
        event: 'run_started',
        run_id: 'run-3'
      },
      {
        event: 'tool_call_completed',
        run_id: 'run-3',
        tool: {
          tool_name: 'lookup_weather',
          result: "{'city': '北京', 'condition': '局部多云', 'tempC': 15.9, 'humidity': 11, 'timezone': 'Asia/Shanghai'}"
        }
      },
      {
        event: 'run_completed',
        run_id: 'run-3'
      }
    ]);
    bridge.flush('agno-python-result');

    const snapshot = bridge.runtime.snapshot();
    const toolNode = snapshot.nodes.find((node) => node.parentId === 'run-3');

    expect(toolNode?.data.result).toEqual({
      city: '北京',
      condition: '局部多云',
      tempC: 15.9,
      humidity: 11,
      timezone: 'Asia/Shanghai'
    });
  });

  it('creates a visible assistant error block when the run fails', () => {
    const bridge = createAgnoTestBridge();

    bridge.push([
      {
        event: 'RunStarted',
        run_id: 'run-error-1',
        agent_name: '天气助手'
      },
      {
        event: 'RunError',
        run_id: 'run-error-1',
        message: 'Weather API timeout.'
      }
    ]);
    bridge.flush('agno-run-error');

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

  it('splits assistant markdown into separate segments around a tool call', () => {
    const bridge = createAgnoTestBridge();

    bridge.push([
      {
        event: 'RunStarted',
        run_id: 'run-4',
        agent_name: '天气助手'
      },
      {
        event: 'RunContent',
        run_id: 'run-4',
        content: '我来帮您查询北京今天的天气情况。'
      },
      {
        event: 'ToolCallStarted',
        run_id: 'run-4',
        tool: {
          id: 'tool-1',
          tool_name: 'lookup_weather',
          tool_args: {
            city: '北京'
          }
        }
      },
      {
        event: 'ToolCallCompleted',
        run_id: 'run-4',
        tool: {
          id: 'tool-1',
          tool_name: 'lookup_weather',
          result: {
            city: '北京',
            condition: '局部多云',
            tempC: 15.6
          }
        }
      },
      {
        event: 'RunContent',
        run_id: 'run-4',
        content: '根据查询结果，北京今天（2026年4月5日）的天气情况如下：'
      },
      {
        event: 'RunContentCompleted',
        run_id: 'run-4'
      },
      {
        event: 'RunCompleted',
        run_id: 'run-4'
      }
    ]);
    bridge.flush('agno-segmented-content');

    const snapshot = bridge.runtime.snapshot();
    const orderedRenderableBlocks = snapshot.blocks.filter((block) => block.type === 'text' || block.type === 'tool');

    expect(orderedRenderableBlocks).toHaveLength(3);
    expect(orderedRenderableBlocks[0]).toMatchObject({
      type: 'text',
      nodeId: 'run-4',
      content: '我来帮您查询北京今天的天气情况。'
    });
    expect(orderedRenderableBlocks[1]).toMatchObject({
      type: 'tool',
      nodeId: 'tool-1',
      renderer: 'tool.weather'
    });
    expect(orderedRenderableBlocks[2]).toMatchObject({
      type: 'text',
      nodeId: 'run-4',
      content: '根据查询结果，北京今天（2026年4月5日）的天气情况如下：'
    });
  });

  it('maps RunPaused requirements into pending tool and approval blocks', () => {
    const bridge = createAgnoTestBridge();

    bridge.push([
      {
        event: 'RunStarted',
        run_id: 'run-pause-1',
        session_id: 'session-pause-1',
        agent_name: '审批助手'
      },
      {
        event: 'RunContent',
        run_id: 'run-pause-1',
        content: '我准备调用天气工具。'
      },
      {
        event: 'RunPaused',
        run_id: 'run-pause-1',
        content: '等待人工确认后继续执行。',
        tools: [
          {
            tool_call_id: 'tool-pause-1',
            tool_name: 'lookup_weather',
            tool_args: {
              city: '北京'
            },
            requires_confirmation: true
          }
        ],
        requirements: [
          {
            id: 'requirement-pause-1',
            tool_execution: {
              tool_call_id: 'tool-pause-1',
              tool_name: 'lookup_weather',
              tool_args: {
                city: '北京'
              },
              requires_confirmation: true
            }
          }
        ]
      }
    ]);
    bridge.flush('agno-run-paused');

    const snapshot = bridge.runtime.snapshot();
    const runNode = snapshot.nodes.find((node) => node.id === 'run-pause-1');
    const toolNode = snapshot.nodes.find((node) => node.id === 'tool-pause-1');
    const toolBlock = snapshot.blocks.find((block) => block.nodeId === 'tool-pause-1');
    const approvalBlock = snapshot.blocks.find((block) => block.type === 'approval');

    expect(runNode?.status).toBe('blocked');
    expect(runNode?.message).toBe('等待人工确认后继续执行。');
    expect(toolNode?.status).toBe('pending');
    expect(toolBlock).toMatchObject({
      type: 'tool',
      renderer: 'tool.weather'
    });
    expect(approvalBlock).toMatchObject({
      id: 'block:approval:requirement-pause-1',
      type: 'approval'
    });
    expect(approvalBlock?.data).toMatchObject({
      runId: 'run-pause-1',
      requirementId: 'requirement-pause-1',
      toolId: 'tool-pause-1',
      status: 'pending'
    });
  });

  it('maps RunPaused requirements even when Agno omits requirement id', () => {
    const bridge = createAgnoTestBridge();

    bridge.push([
      {
        event: 'RunStarted',
        run_id: 'run-pause-fallback-1',
        session_id: 'session-pause-fallback-1',
        agent_name: '审批助手'
      },
      {
        event: 'RunPaused',
        run_id: 'run-pause-fallback-1',
        content: '等待人工确认后继续执行。',
        tools: [
          {
            tool_call_id: 'call-pause-fallback-1',
            tool_name: 'lookup_weather',
            tool_args: {
              city: '北京'
            },
            requires_confirmation: true
          }
        ],
        requirements: [
          {
            tool_execution: {
              tool_call_id: 'call-pause-fallback-1',
              tool_name: 'lookup_weather',
              tool_args: {
                city: '北京'
              },
              requires_confirmation: true
            }
          }
        ]
      }
    ]);
    bridge.flush('agno-run-paused-fallback');

    const snapshot = bridge.runtime.snapshot();
    const approvalBlock = snapshot.blocks.find((block) => block.type === 'approval');

    expect(approvalBlock).toMatchObject({
      id: 'block:approval:call-pause-fallback-1',
      type: 'approval'
    });
    expect(approvalBlock?.data).toMatchObject({
      requirementId: 'call-pause-fallback-1',
      approvalId: 'call-pause-fallback-1',
      status: 'pending'
    });
  });

  it('creates an approval block from pending tools when RunPaused omits requirements entirely', () => {
    const bridge = createAgnoTestBridge();

    bridge.push([
      {
        event: 'RunStarted',
        run_id: 'run-pause-tools-only-1',
        session_id: 'session-pause-tools-only-1',
        agent_name: '审批助手'
      },
      {
        event: 'RunPaused',
        run_id: 'run-pause-tools-only-1',
        content: '我来帮您查询北京今天的天气情况。',
        tools: [
          {
            tool_call_id: 'call-pause-tools-only-1',
            tool_name: 'lookup_weather',
            tool_args: {
              city: '北京'
            },
            requires_confirmation: true
          }
        ]
      }
    ]);
    bridge.flush('agno-run-paused-tools-only');

    const snapshot = bridge.runtime.snapshot();
    const approvalBlock = snapshot.blocks.find((block) => block.type === 'approval');
    const pausedTextBlock = snapshot.blocks.find((block) => (
      block.type === 'text' && block.content === '我来帮您查询北京今天的天气情况。'
    ));

    expect(approvalBlock).toMatchObject({
      id: 'block:approval:call-pause-tools-only-1',
      type: 'approval'
    });
    expect(approvalBlock?.data).toMatchObject({
      requirementId: 'call-pause-tools-only-1',
      approvalId: 'call-pause-tools-only-1',
      status: 'pending'
    });
    expect(pausedTextBlock?.messageId).toBeDefined();
  });

  it('creates a ready-to-use Agno adapter by composing tools, events and surface renderers', async () => {
    const WeatherToolCard = {} as Component;
    const WeatherEventCard = {} as Component;
    const tools = defineAgnoToolComponents({
      'tool.weather': {
        match: 'lookup_weather',
        component: WeatherToolCard
      }
    });
    const events = defineAgnoEventComponents({
      'event.weather-summary': {
        on: 'weather_card',
        component: WeatherEventCard,
        resolve: ({ event }) => ({
          id: 'event:block:weather-summary',
          mode: 'upsert',
          groupId: 'turn:run-5',
          data: {
            payload: (event as AgnoEvent).result
          }
        })
      }
    });
    const adapter = createAgnoAdapter({
      title: '天气助手',
      tools,
      events
    });
    const session = adapter.createSession({
      source: [
        {
          event: 'RunStarted',
          run_id: 'run-5'
        },
        {
          event: 'RunContent',
          run_id: 'run-5',
          content: '我来为你查询天气。'
        },
        {
          event: 'ToolCallCompleted',
          run_id: 'run-5',
          tool: {
            id: 'tool-5',
            tool_name: 'lookup_weather',
            result: {
              city: '北京',
              condition: '晴'
            }
          }
        },
        {
          event: 'weather_card',
          run_id: 'run-5',
          result: {
            city: '北京',
            condition: '晴'
          }
        },
        {
          event: 'RunCompleted',
          run_id: 'run-5'
        }
      ]
    });

    await session.connect();

    const snapshot = session.runtime.snapshot();
    const toolBlock = snapshot.blocks.find((block) => block.nodeId === 'tool-5');
    const eventBlock = snapshot.blocks.find((block) => block.id === 'event:block:weather-summary');

    expect(adapter.name).toBe('agno');
    expect(session.surface.renderers?.['tool.weather']).toBe(WeatherToolCard);
    expect(session.surface.renderers?.['event.weather-summary']).toBe(WeatherEventCard);
    expect(snapshot.nodes.find((node) => node.id === 'run-5')?.title).toBe('天气助手');
    expect(toolBlock?.renderer).toBe('tool.weather');
    expect(eventBlock).toMatchObject({
      renderer: 'event.weather-summary'
    });
    expect(eventBlock?.data.payload).toEqual({
      city: '北京',
      condition: '晴'
    });
  });

  it('provides a compact Agno SSE transport helper for backend requests', async () => {
    let capturedInit: RequestInit | undefined;
    const transport = createAgnoSseTransport<string>({
      fetch: async (_source, init) => {
        capturedInit = init;

        return new Response('data: {"event":"RunStarted","run_id":"run-helper"}\n\n', {
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
    const packets: AgnoEvent[] = [];

    for await (const packet of transport.connect('/api/stream/agno', {
      signal: new AbortController().signal
    })) {
      packets.push(packet);
    }

    expect(capturedInit?.method).toBe('POST');
    expect(new Headers(capturedInit?.headers).get('Content-Type')).toBe('application/json');
    expect(capturedInit?.body).toBe('{"city":"北京","message":"ask:/api/stream/agno"}');
    expect(packets).toEqual([
      {
        event: 'RunStarted',
        run_id: 'run-helper'
      }
    ]);
  });
});

describe('useAgnoChatSession', () => {
  it('seeds a user message, captures sessionId and exposes a shorter send API', async () => {
    const scope = effectScope();
    const prompt = ref('帮我查一下北京天气');
    let requestCount = 0;
    const sessionState = scope.run(() => useAgnoChatSession<string>({
      source: 'http://agno.test/api/stream',
      input: prompt,
      conversationId: 'session:demo:agno-chat',
      title: 'Agno 助手',
      transport: {
        fetch: (async () => {
          requestCount += 1;

          return createAgnoSseResponse([
            {
              event: 'RunStarted',
              run_id: `run-chat-${requestCount}`,
              session_id: `backend-session-${requestCount}`
            },
            {
              event: 'RunContent',
              run_id: `run-chat-${requestCount}`,
              content: requestCount === 1
                ? '我来为你查询天气'
                : '我继续为你查询天气'
            },
            {
              event: 'RunContentCompleted',
              run_id: `run-chat-${requestCount}`
            },
            {
              event: 'RunCompleted',
              run_id: `run-chat-${requestCount}`
            }
          ]);
        }) as typeof fetch
      }
    }));

    if (!sessionState) {
      throw new Error('Failed to create Agno chat session.');
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

    expect(sessionState.sessionId.value).toBe('backend-session-1');
    expect(sessionState.busy.value).toBe(false);
    expect(userBlock?.content).toBe('帮我查一下北京天气');
    expect(assistantBlock?.content).toBe('我来为你查询天气');
    expect(resolvedAssistantActions?.actions?.some((action) => (
      (typeof action === 'string' ? action : action.key) === 'regenerate'
    ))).toBe(true);
    expect(createAgnoChatIds({
      conversationId: 'session:demo:agno-chat',
      at: 100
    })).toEqual({
      conversationId: 'session:demo:agno-chat',
      turnId: 'turn:session:demo:agno-chat:100',
      userMessageId: 'message:user:session:demo:agno-chat:100',
      assistantMessageId: 'message:assistant:session:demo:agno-chat:100'
    });

    await sessionState.send('再查一遍');
    await nextTick();

    expect(sessionState.sessionId.value).toBe('backend-session-1');

    scope.stop();
  });

  it('supports structured user messages and preserves them during retry', async () => {
    const scope = effectScope();
    const capturedBodies: Array<Record<string, unknown>> = [];
    let requestCount = 0;
    const sessionState = scope.run(() => useAgnoChatSession<string>({
      source: 'http://agno.test/api/stream',
      conversationId: 'session:demo:agno-structured',
      transport: {
        fetch: (async (_input, init) => {
          requestCount += 1;
          capturedBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);

          return createAgnoSseResponse([
            {
              event: 'RunStarted',
              run_id: `run-structured-${requestCount}`
            },
            {
              event: 'RunContent',
              run_id: `run-structured-${requestCount}`,
              content: requestCount === 1 ? '我先看一下附件。' : '我重新看了一下附件。'
            },
            {
              event: 'RunContentCompleted',
              run_id: `run-structured-${requestCount}`
            },
            {
              event: 'RunCompleted',
              run_id: `run-structured-${requestCount}`
            }
          ]);
        }) as typeof fetch
      }
    }));

    if (!sessionState) {
      throw new Error('Failed to create structured Agno chat session.');
    }

    await sessionState.send({
      text: '帮我根据附件查一下北京天气',
      requestText: '请根据我上传的附件，再帮我查一下北京天气。',
      blocks: [
        {
          kind: 'attachment',
          title: '城市列表',
          attachmentKind: 'file',
          label: 'cities.txt',
          sizeText: '2 KB'
        },
        {
          kind: 'custom',
          renderer: 'user.file-card',
          type: 'user.file-card',
          data: {
            filename: 'cities.txt'
          }
        }
      ]
    });
    await nextTick();

    const firstSnapshot = sessionState.runtime.snapshot();
    const userBlocks = firstSnapshot.blocks.filter((block) => {
      return block.messageId === sessionState.chatIds.value?.userMessageId;
    });

    expect(capturedBodies[0]).toEqual({
      message: '请根据我上传的附件，再帮我查一下北京天气。'
    });
    expect(sessionState.lastInput.value).toBe('请根据我上传的附件，再帮我查一下北京天气。');
    expect(userBlocks.map((block) => block.type)).toEqual([
      'text',
      'attachment',
      'user.file-card'
    ]);
    expect(userBlocks[1]?.data).toMatchObject({
      kind: 'attachment',
      title: '城市列表',
      label: 'cities.txt'
    });
    expect(userBlocks[2]?.renderer).toBe('user.file-card');

    await sessionState.retry();
    await nextTick();

    expect(requestCount).toBe(2);
    expect(capturedBodies[1]).toEqual({
      message: '请根据我上传的附件，再帮我查一下北京天气。'
    });

    scope.stop();
  });

  it('writes a visible assistant error block when the transport connection fails', async () => {
    const scope = effectScope();
    const prompt = ref('帮我查一下北京天气');
    const sessionState = scope.run(() => useAgnoChatSession<string>({
      source: 'http://agno.test/api/stream',
      input: prompt,
      conversationId: 'session:demo:agno-connect-error',
      transport: {
        fetch: (async () => {
          throw new Error('network down');
        }) as typeof fetch
      }
    }));

    if (!sessionState) {
      throw new Error('Failed to create Agno connect error session.');
    }

    await expect(sessionState.send()).rejects.toMatchObject({
      message: 'Bridge consume failed.'
    });
    await nextTick();

    const snapshot = sessionState.runtime.snapshot();
    const errorBlock = snapshot.blocks.find((block) => block.type === 'error');

    expect(errorBlock).toMatchObject({
      renderer: 'error',
      messageId: sessionState.chatIds.value?.assistantMessageId,
      data: {
        kind: 'error',
        title: 'Agno 连接失败',
        message: 'network down'
      }
    });
    expect(sessionState.transportError.value).toBe('network down');

    scope.stop();
  });

  it('wires interrupt, resume and retry through the shared chat helper controls', async () => {
    const scope = effectScope();
    const prompt = ref('继续处理这封邮件');
    let requestCount = 0;
    const sessionState = scope.run(() => useAgnoChatSession<string>({
      source: 'http://agno.test/api/stream',
      input: prompt,
      conversationId: 'session:demo:agno-hitl',
      transport: {
        fetch: (async (_input, init) => {
          requestCount += 1;

          if (requestCount === 1) {
            return createAbortableAgnoSseResponse([
              {
                event: 'RunStarted',
                run_id: 'run-hitl-1'
              },
              {
                event: 'RunContent',
                run_id: 'run-hitl-1',
                content: '我正在继续处理这封邮件'
              }
            ], init?.signal as AbortSignal | undefined);
          }

          return createAgnoSseResponse([
            {
              event: 'RunStarted',
              run_id: `run-hitl-${requestCount}`
            },
            {
              event: 'RunContent',
              run_id: `run-hitl-${requestCount}`,
              content: requestCount === 2
                ? '我恢复了刚才的处理流程'
                : '我重新执行了上一轮请求'
            },
            {
              event: 'RunContentCompleted',
              run_id: `run-hitl-${requestCount}`
            },
            {
              event: 'RunCompleted',
              run_id: `run-hitl-${requestCount}`
            }
          ]);
        }) as typeof fetch
      }
    }));

    if (!sessionState) {
      throw new Error('Failed to create Agno HITL session.');
    }

    const assistantActions = sessionState.surface.value.messageActions?.assistant;
    const resolvedAssistantActions = assistantActions === false
      ? undefined
      : assistantActions;

    expect(resolvedAssistantActions?.actions?.map((action) => (
      typeof action === 'string' ? action : action.key
    ))).toEqual([
      'copy',
      'interrupt',
      'resume',
      'retry',
      'regenerate',
      'like',
      'dislike',
      'share'
    ]);

    const pendingSend = sessionState.send();
    await nextTick();

    sessionState.interrupt();
    await pendingSend.catch(() => undefined);

    expect(sessionState.interrupted.value).toBe(true);
    expect(sessionState.busy.value).toBe(false);

    await sessionState.resume();
    await nextTick();

    expect(requestCount).toBe(2);
    expect(sessionState.interrupted.value).toBe(false);

    await sessionState.retry();
    await nextTick();

    expect(requestCount).toBe(3);
    expect(sessionState.lastInput.value).toBe('继续处理这封邮件');

    scope.stop();
  });

  it('continues a paused Agno requirement through the same SSE endpoint on approval', async () => {
    const scope = effectScope();
    const prompt = ref('帮我查一下北京天气');
    const capturedBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as Record<string, unknown>
        : {};

      capturedBodies.push(body);

      if (capturedBodies.length === 1) {
        return createAgnoSseResponse([
          {
            event: 'RunStarted',
            run_id: 'run-hitl-approve-1',
            session_id: 'backend-session-hitl-1'
          },
          {
            event: 'RunPaused',
            run_id: 'run-hitl-approve-1',
            session_id: 'backend-session-hitl-1',
            content: '等待人工确认后继续执行。',
            tools: [
              {
                tool_call_id: 'tool-hitl-1',
                tool_name: 'lookup_weather',
                tool_args: {
                  city: '北京'
                },
                requires_confirmation: true
              }
            ],
            requirements: [
              {
                id: 'requirement-hitl-1',
                tool_execution: {
                  tool_call_id: 'tool-hitl-1',
                  tool_name: 'lookup_weather',
                  tool_args: {
                    city: '北京'
                  },
                  requires_confirmation: true
                }
              }
            ]
          }
        ]);
      }

      return createAgnoSseResponse([
        {
          event: 'RunContinued',
          run_id: 'run-hitl-approve-1',
          session_id: 'backend-session-hitl-1'
        },
        {
          event: 'ToolCallStarted',
          run_id: 'run-hitl-approve-1',
          tool: {
            tool_call_id: 'tool-hitl-1',
            tool_name: 'lookup_weather',
            tool_args: {
              city: '北京'
            }
          }
        },
        {
          event: 'ToolCallCompleted',
          run_id: 'run-hitl-approve-1',
          tool: {
            tool_call_id: 'tool-hitl-1',
            tool_name: 'lookup_weather',
            result: {
              city: '北京',
              condition: '阴天',
              tempC: 18.5
            }
          }
        },
        {
          event: 'RunContent',
          run_id: 'run-hitl-approve-1',
          content: '根据查询结果，北京今天是阴天。'
        },
        {
          event: 'RunContentCompleted',
          run_id: 'run-hitl-approve-1'
        },
        {
          event: 'RunCompleted',
          run_id: 'run-hitl-approve-1'
        }
      ]);
    });
    const sessionState = scope.run(() => useAgnoChatSession<string>({
      source: 'http://agno.test/api/stream/agno',
      input: prompt,
      conversationId: 'session:demo:agno-hitl-approve',
      mode: 'hitl',
      transport: {
        fetch: fetchMock as typeof fetch
      }
    }));

    if (!sessionState) {
      throw new Error('Failed to create Agno approval session.');
    }

    await sessionState.send();
    await nextTick();

    const pausedSnapshot = sessionState.runtime.snapshot();
    const approvalBlock = pausedSnapshot.blocks.find((block) => block.type === 'approval');
    const approvalHandler = sessionState.surface.value.approvalActions !== false
      ? sessionState.surface.value.approvalActions?.builtinHandlers?.approve
      : undefined;

    expect(approvalBlock?.data).toMatchObject({
      runId: 'run-hitl-approve-1',
      requirementId: 'requirement-hitl-1'
    });
    expect(sessionState.awaitingHumanInput.value).toBe(true);
    expect(sessionState.statusLabel.value).toBe('等待人工确认');
    expect(capturedBodies[0]).toEqual({
      message: '帮我查一下北京天气',
      mode: 'hitl'
    });

    if (!approvalBlock || !approvalHandler) {
      throw new Error('Failed to resolve approval action wiring.');
    }

    const context: RunSurfaceApprovalActionContext = {
      title: String(approvalBlock.data.title ?? '等待人工确认'),
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
    const finalToolNode = finalSnapshot.nodes.find((node) => node.id === 'tool-hitl-1');
    const resumedTextBlock = finalSnapshot.blocks.find((block) => (
      block.type === 'text' && block.content === '根据查询结果，北京今天是阴天。'
    ));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(capturedBodies[1]).toEqual({
      session_id: 'backend-session-hitl-1',
      mode: 'hitl',
      agno_resume: {
        run_id: 'run-hitl-approve-1',
        requirement_id: 'requirement-hitl-1',
        action: 'approve'
      }
    });
    expect(finalApprovalBlock?.data.status).toBe('approved');
    expect(finalToolNode?.status).toBe('done');
    expect(resumedTextBlock?.messageId).toBe(sessionState.chatIds.value?.assistantMessageId);
    expect(finalSnapshot.blocks.some((block) => block.messageId === sessionState.chatIds.value?.userMessageId)).toBe(true);

    scope.stop();
  });

  it('continues a paused Agno requirement when RunPaused omits requirement id', async () => {
    const scope = effectScope();
    const prompt = ref('帮我查一下北京天气');
    const capturedBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as Record<string, unknown>
        : {};

      capturedBodies.push(body);

      if (capturedBodies.length === 1) {
        return createAgnoSseResponse([
          {
            event: 'RunStarted',
            run_id: 'run-hitl-fallback-1',
            session_id: 'backend-session-hitl-fallback-1'
          },
          {
            event: 'RunPaused',
            run_id: 'run-hitl-fallback-1',
            session_id: 'backend-session-hitl-fallback-1',
            content: '我来帮您查询北京今天的天气情况。',
            tools: [
              {
                tool_call_id: 'call-hitl-fallback-1',
                tool_name: 'lookup_weather',
                tool_args: {
                  city: '北京'
                },
                requires_confirmation: true
              }
            ],
            requirements: [
              {
                tool_execution: {
                  tool_call_id: 'call-hitl-fallback-1',
                  tool_name: 'lookup_weather',
                  tool_args: {
                    city: '北京'
                  },
                  requires_confirmation: true
                }
              }
            ]
          }
        ]);
      }

      return createAgnoSseResponse([
        {
          event: 'RunContinued',
          run_id: 'run-hitl-fallback-1',
          session_id: 'backend-session-hitl-fallback-1'
        },
        {
          event: 'RunCompleted',
          run_id: 'run-hitl-fallback-1'
        }
      ]);
    });
    const sessionState = scope.run(() => useAgnoChatSession<string>({
      source: 'http://agno.test/api/stream/agno',
      input: prompt,
      conversationId: 'session:demo:agno-hitl-fallback',
      mode: 'hitl',
      transport: {
        fetch: fetchMock as typeof fetch
      }
    }));

    if (!sessionState) {
      throw new Error('Failed to create Agno fallback approval session.');
    }

    await sessionState.send();
    await nextTick();

    const pausedSnapshot = sessionState.runtime.snapshot();
    const approvalBlock = pausedSnapshot.blocks.find((block) => block.type === 'approval');
    const pausedTextBlock = pausedSnapshot.blocks.find((block) => (
      block.type === 'text' && block.content === '我来帮您查询北京今天的天气情况。'
    ));
    const approvalHandler = sessionState.surface.value.approvalActions !== false
      ? sessionState.surface.value.approvalActions?.builtinHandlers?.approve
      : undefined;

    expect(sessionState.awaitingHumanInput.value).toBe(true);
    expect(sessionState.statusLabel.value).toBe('等待人工确认');
    expect(pausedTextBlock?.messageId).toBe(sessionState.chatIds.value?.assistantMessageId);

    if (!approvalBlock || !approvalHandler) {
      throw new Error('Failed to resolve Agno fallback approval wiring.');
    }

    const context: RunSurfaceApprovalActionContext = {
      title: String(approvalBlock.data.title ?? '等待人工确认'),
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

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(capturedBodies[1]).toEqual({
      session_id: 'backend-session-hitl-fallback-1',
      mode: 'hitl',
      agno_resume: {
        run_id: 'run-hitl-fallback-1',
        requirement_id: 'call-hitl-fallback-1',
        action: 'approve'
      }
    });

    scope.stop();
  });

  it('marks the paused tool as rejected when a requirement is rejected', async () => {
    const scope = effectScope();
    const prompt = ref('帮我查一下北京天气');
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as Record<string, unknown>
        : {};

      if (!('agno_resume' in body)) {
        return createAgnoSseResponse([
          {
            event: 'RunStarted',
            run_id: 'run-hitl-reject-1',
            session_id: 'backend-session-hitl-reject-1'
          },
          {
            event: 'RunPaused',
            run_id: 'run-hitl-reject-1',
            session_id: 'backend-session-hitl-reject-1',
            content: '等待人工确认后继续执行。',
            tools: [
              {
                tool_call_id: 'tool-hitl-reject-1',
                tool_name: 'lookup_weather',
                tool_args: {
                  city: '北京'
                },
                requires_confirmation: true
              }
            ],
            requirements: [
              {
                id: 'requirement-hitl-reject-1',
                tool_execution: {
                  tool_call_id: 'tool-hitl-reject-1',
                  tool_name: 'lookup_weather',
                  tool_args: {
                    city: '北京'
                  },
                  requires_confirmation: true
                }
              }
            ]
          }
        ]);
      }

      return createAgnoSseResponse([
        {
          event: 'RunContinued',
          run_id: 'run-hitl-reject-1',
          session_id: 'backend-session-hitl-reject-1'
        },
        {
          event: 'RunContent',
          run_id: 'run-hitl-reject-1',
          content: '这次天气查询没有执行，因为工具调用被拒绝了。'
        },
        {
          event: 'RunContentCompleted',
          run_id: 'run-hitl-reject-1'
        },
        {
          event: 'RunCompleted',
          run_id: 'run-hitl-reject-1'
        }
      ]);
    });
    const sessionState = scope.run(() => useAgnoChatSession<string>({
      source: 'http://agno.test/api/stream/agno',
      input: prompt,
      conversationId: 'session:demo:agno-hitl-reject',
      mode: 'hitl',
      transport: {
        fetch: fetchMock as typeof fetch
      }
    }));

    if (!sessionState) {
      throw new Error('Failed to create Agno reject session.');
    }

    await sessionState.send();
    await nextTick();

    const pausedSnapshot = sessionState.runtime.snapshot();
    const approvalBlock = pausedSnapshot.blocks.find((block) => block.type === 'approval');
    const rejectHandler = sessionState.surface.value.approvalActions !== false
      ? sessionState.surface.value.approvalActions?.builtinHandlers?.reject
      : undefined;

    if (!approvalBlock || !rejectHandler) {
      throw new Error('Failed to resolve reject action wiring.');
    }

    const context: RunSurfaceApprovalActionContext = {
      title: String(approvalBlock.data.title ?? '等待人工确认'),
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

    await rejectHandler(context);
    await nextTick();

    const finalSnapshot = sessionState.runtime.snapshot();
    const finalToolNode = finalSnapshot.nodes.find((node) => node.id === 'tool-hitl-reject-1');
    const finalToolBlock = finalSnapshot.blocks.find((block) => block.nodeId === 'tool-hitl-reject-1');
    const finalApprovalBlock = finalSnapshot.blocks.find((block) => block.id === approvalBlock.id);

    expect(finalToolNode?.status).toBe('rejected');
    expect(finalToolNode?.message).toBe('已拒绝执行');
    expect(finalToolBlock?.data.status).toBe('rejected');
    expect(finalToolBlock?.data.message).toBe('已拒绝执行');
    expect(finalApprovalBlock?.data.status).toBe('rejected');

    scope.stop();
  });
});
