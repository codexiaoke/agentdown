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

  it('creates a visible assistant error block when the run fails', () => {
    const bridge = createAutoGenTestBridge();

    bridge.push([
      {
        type: 'TaskStarted',
        id: 'task-error-1',
        source: 'assistant'
      },
      {
        type: 'ErrorEvent',
        id: 'task-error-1',
        message: 'Weather API timeout.'
      }
    ]);
    bridge.flush('autogen-run-error');

    const snapshot = bridge.runtime.snapshot();
    const runNode = snapshot.nodes.find((node) => node.type === 'run');
    const errorBlock = snapshot.blocks.find((block) => block.type === 'error');

    expect(runNode).toBeDefined();
    expect(errorBlock).toMatchObject({
      renderer: 'error',
      data: {
        kind: 'error',
        title: '运行失败',
        message: 'Weather API timeout.',
        refId: runNode?.id as string
      }
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

  it('maps AutoGen HandoffMessage into an approval block and pauses the run', () => {
    const bridge = createAutoGenTestBridge();

    bridge.push([
      {
        type: 'TaskStarted',
        id: 'task-hitl-1',
        source: 'assistant',
        session_id: 'autogen-session-hitl-1'
      },
      {
        type: 'HandoffMessage',
        id: 'handoff-hitl-1',
        source: 'assistant',
        target: 'human',
        content: '请确认是否继续执行天气查询。',
        session_id: 'autogen-session-hitl-1'
      },
      {
        type: 'TaskResult',
        id: 'task-result-hitl-1',
        session_id: 'autogen-session-hitl-1',
        stop_reason: 'Handoff to human from assistant detected.',
        messages: []
      }
    ]);
    bridge.flush('autogen-handoff');

    const snapshot = bridge.runtime.snapshot();
    const runNode = snapshot.nodes.find((node) => node.type === 'run');
    const approvalBlock = snapshot.blocks.find((block) => block.type === 'approval');

    expect(runNode?.status).toBe('paused');
    expect(approvalBlock?.data).toMatchObject({
      approvalId: 'handoff-hitl-1',
      status: 'pending',
      handoffId: 'handoff-hitl-1',
      targetType: 'human',
      assignee: 'human',
      message: '请确认是否继续执行天气查询。'
    });
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

  it('resumes a paused AutoGen approval through the same endpoint and keeps the transcript intact', async () => {
    const scope = effectScope();
    const prompt = ref('帮我查一下北京天气，并说明工具调用过程。');
    const capturedBodies: Array<Record<string, unknown>> = [];
    let requestCount = 0;
    const sessionState = scope.run(() => useAutoGenChatSession<string>({
      source: 'http://autogen.test/api/stream',
      input: prompt,
      conversationId: 'session:demo:autogen-hitl',
      mode: 'hitl',
      title: 'AutoGen 助手',
      transport: {
        fetch: (async (_source, init) => {
          requestCount += 1;
          capturedBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);

          if (requestCount === 1) {
            return createAutoGenSseResponse([
              {
                type: 'TaskStarted',
                id: 'task-hitl-1',
                source: 'assistant',
                session_id: 'autogen-session-hitl-1'
              },
              {
                type: 'HandoffMessage',
                id: 'handoff-hitl-1',
                source: 'assistant',
                target: 'human',
                content: '请确认是否继续执行天气查询。',
                session_id: 'autogen-session-hitl-1'
              },
              {
                type: 'TaskResult',
                id: 'task-result-hitl-1',
                session_id: 'autogen-session-hitl-1',
                stop_reason: 'Handoff to human from assistant detected.',
                messages: []
              }
            ]);
          }

          return createAutoGenSseResponse([
            {
              type: 'TaskStarted',
              id: 'task-hitl-2',
              source: 'assistant',
              session_id: 'autogen-session-hitl-1'
            },
            {
              type: 'ModelClientStreamingChunkEvent',
              id: 'chunk-hitl-2',
              source: 'assistant',
              session_id: 'autogen-session-hitl-1',
              full_message_id: 'assistant-msg-hitl-2',
              content: '已根据你的确认完成天气查询。'
            },
            {
              type: 'TextMessage',
              id: 'assistant-msg-hitl-2',
              source: 'assistant',
              session_id: 'autogen-session-hitl-1',
              content: '已根据你的确认完成天气查询。'
            },
            {
              type: 'TaskResult',
              id: 'task-result-hitl-2',
              session_id: 'autogen-session-hitl-1',
              stop_reason: 'Maximum number of turns 1 reached.',
              messages: []
            }
          ]);
        }) as typeof fetch
      }
    }));

    if (!sessionState) {
      throw new Error('Failed to create AutoGen HITL chat session.');
    }

    await sessionState.send();
    await nextTick();

    const pausedSnapshot = sessionState.runtime.snapshot();
    const pausedApprovalBlock = pausedSnapshot.blocks.find((block) => block.type === 'approval');

    expect(sessionState.sessionId.value).toBe('autogen-session-hitl-1');
    expect(pausedApprovalBlock?.data).toMatchObject({
      status: 'pending'
    });

    await sessionState.resolveHandoff({
      content: '已确认，请继续调用天气工具并返回结果。'
    });
    await nextTick();

    const finalSnapshot = sessionState.runtime.snapshot();
    const replyUserBlock = finalSnapshot.blocks.find((block) => {
      return block.messageId === sessionState.chatIds.value?.userMessageId;
    });
    const finalAssistantBlock = finalSnapshot.blocks.find((block) => {
      return block.messageId === sessionState.chatIds.value?.assistantMessageId;
    });
    const finalApprovalBlock = finalSnapshot.blocks.find((block) => block.type === 'approval');

    expect(capturedBodies[0]).toMatchObject({
      message: '帮我查一下北京天气，并说明工具调用过程。',
      mode: 'hitl'
    });
    expect(capturedBodies[1]).toMatchObject({
      message: '已确认，请继续调用天气工具并返回结果。',
      mode: 'hitl',
      session_id: 'autogen-session-hitl-1',
      autogen_resume: {
        content: '已确认，请继续调用天气工具并返回结果。'
      }
    });
    expect(replyUserBlock?.content).toBe('已确认，请继续调用天气工具并返回结果。');
    expect(finalAssistantBlock?.content).toBe('已根据你的确认完成天气查询。');
    expect(finalApprovalBlock?.data).toMatchObject({
      status: 'approved'
    });

    scope.stop();
  });

  it('wires AutoGen approval actions without requiring extra input', async () => {
    const scope = effectScope();
    const prompt = ref('帮我查一下北京天气，并说明工具调用过程。');
    const capturedBodies: Array<Record<string, unknown>> = [];
    let requestCount = 0;
    const sessionState = scope.run(() => useAutoGenChatSession<string>({
      source: 'http://autogen.test/api/stream',
      input: prompt,
      conversationId: 'session:demo:autogen-approval',
      mode: 'hitl',
      title: 'AutoGen 助手',
      transport: {
        fetch: (async (_source, init) => {
          requestCount += 1;
          capturedBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);

          if (requestCount === 1) {
            return createAutoGenSseResponse([
              {
                type: 'TaskStarted',
                id: 'task-approval-1',
                source: 'assistant',
                session_id: 'autogen-session-approval-1'
              },
              {
                type: 'HandoffMessage',
                id: 'handoff-approval-1',
                source: 'assistant',
                target: 'human',
                content: '请确认是否继续执行天气查询。',
                session_id: 'autogen-session-approval-1'
              },
              {
                type: 'TaskResult',
                id: 'task-result-approval-1',
                session_id: 'autogen-session-approval-1',
                stop_reason: 'Handoff to human from assistant detected.',
                messages: []
              }
            ]);
          }

          return createAutoGenSseResponse([
            {
              type: 'TaskStarted',
              id: 'task-approval-2',
              source: 'assistant',
              session_id: 'autogen-session-approval-1'
            },
            {
              type: 'TextMessage',
              id: 'assistant-msg-approval-2',
              source: 'assistant',
              session_id: 'autogen-session-approval-1',
              content: '我继续完成了天气查询。'
            },
            {
              type: 'TaskResult',
              id: 'task-result-approval-2',
              session_id: 'autogen-session-approval-1',
              stop_reason: 'Maximum number of turns 1 reached.',
              messages: []
            }
          ]);
        }) as typeof fetch
      }
    }));

    if (!sessionState) {
      throw new Error('Failed to create AutoGen approval session.');
    }

    await sessionState.send();
    await nextTick();

    const pausedSnapshot = sessionState.runtime.snapshot();
    const approvalBlock = pausedSnapshot.blocks.find((block) => block.type === 'approval');
    const approveHandler = sessionState.surface.value.approvalActions !== false
      ? sessionState.surface.value.approvalActions?.builtinHandlers?.approve
      : undefined;

    if (!approvalBlock || !approveHandler) {
      throw new Error('Failed to resolve AutoGen approval action wiring.');
    }

    const context = {
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
    } as const;

    await approveHandler(context);
    await nextTick();

    const finalSnapshot = sessionState.runtime.snapshot();
    const finalApprovalBlock = finalSnapshot.blocks.find((block) => block.id === approvalBlock.id);

    expect(capturedBodies[1]).toMatchObject({
      message: '已确认，请继续执行。',
      mode: 'hitl',
      session_id: 'autogen-session-approval-1',
      autogen_resume: {
        content: '已确认，请继续执行。'
      }
    });
    expect(finalApprovalBlock?.data).toMatchObject({
      status: 'approved'
    });

    scope.stop();
  });

  it('requires a reason when rejecting an AutoGen approval', async () => {
    const scope = effectScope();
    const prompt = ref('帮我查一下北京天气，并说明工具调用过程。');
    const capturedBodies: Array<Record<string, unknown>> = [];
    let requestCount = 0;
    const sessionState = scope.run(() => useAutoGenChatSession<string>({
      source: 'http://autogen.test/api/stream',
      input: prompt,
      conversationId: 'session:demo:autogen-reject',
      mode: 'hitl',
      title: 'AutoGen 助手',
      transport: {
        fetch: (async (_source, init) => {
          requestCount += 1;
          capturedBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);

          if (requestCount === 1) {
            return createAutoGenSseResponse([
              {
                type: 'TaskStarted',
                id: 'task-reject-1',
                source: 'assistant',
                session_id: 'autogen-session-reject-1'
              },
              {
                type: 'HandoffMessage',
                id: 'handoff-reject-1',
                source: 'assistant',
                target: 'human',
                content: '请确认是否继续执行天气查询。',
                session_id: 'autogen-session-reject-1'
              },
              {
                type: 'TaskResult',
                id: 'task-result-reject-1',
                session_id: 'autogen-session-reject-1',
                stop_reason: 'Handoff to human from assistant detected.',
                messages: []
              }
            ]);
          }

          return createAutoGenSseResponse([
            {
              type: 'TaskStarted',
              id: 'task-reject-2',
              source: 'assistant',
              session_id: 'autogen-session-reject-1'
            },
            {
              type: 'TextMessage',
              id: 'assistant-msg-reject-2',
              source: 'assistant',
              session_id: 'autogen-session-reject-1',
              content: '好的，我已停止当前任务。'
            },
            {
              type: 'TaskResult',
              id: 'task-result-reject-2',
              session_id: 'autogen-session-reject-1',
              stop_reason: 'Maximum number of turns 1 reached.',
              messages: []
            }
          ]);
        }) as typeof fetch
      }
    }));

    if (!sessionState) {
      throw new Error('Failed to create AutoGen reject session.');
    }

    await sessionState.send();
    await nextTick();

    const pausedSnapshot = sessionState.runtime.snapshot();
    const approvalBlock = pausedSnapshot.blocks.find((block) => block.type === 'approval');
    const rejectHandler = sessionState.surface.value.approvalActions !== false
      ? sessionState.surface.value.approvalActions?.builtinHandlers?.reject
      : undefined;

    if (!approvalBlock || !rejectHandler) {
      throw new Error('Failed to resolve AutoGen reject action wiring.');
    }

    await expect(rejectHandler({
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
    })).rejects.toThrow('请先填写拒绝原因。');

    await rejectHandler({
      title: String(approvalBlock.data.title ?? '等待人工确认'),
      status: 'pending',
      reason: '用户暂时不需要这次天气查询了。',
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
    });
    await nextTick();

    expect(capturedBodies).toHaveLength(2);
    expect(capturedBodies[1]).toMatchObject({
      message: '这次不继续执行，原因：用户暂时不需要这次天气查询了。请停止当前任务，并简要确认已收到。',
      mode: 'hitl',
      session_id: 'autogen-session-reject-1',
      autogen_resume: {
        content: '这次不继续执行，原因：用户暂时不需要这次天气查询了。请停止当前任务，并简要确认已收到。'
      }
    });

    scope.stop();
  });
});
