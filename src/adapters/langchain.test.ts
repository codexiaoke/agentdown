import { describe, expect, it } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import {
  createLangChainChatIds,
  type LangChainEvent,
  useLangChainChatSession
} from './langchain';

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
