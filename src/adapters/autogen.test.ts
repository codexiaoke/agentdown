import { describe, expect, it } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { createMarkdownAssembler } from '../runtime/assemblers';
import { createBridge } from '../runtime/createBridge';
import {
  createAutoGenChatIds,
  createAutoGenProtocol,
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
