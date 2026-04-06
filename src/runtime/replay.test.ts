import { describe, expect, it } from 'vitest';
import { createAgentRuntime } from './createAgentRuntime';
import { createRuntimeTranscriptMessages } from './replay';

describe('replay transcript semantics', () => {
  it('groups transcript messages by explicit messageId before falling back to groupId', () => {
    const runtime = createAgentRuntime();

    runtime.apply([
      {
        type: 'block.upsert',
        block: {
          id: 'block:user:1',
          slot: 'main',
          type: 'text',
          renderer: 'text',
          state: 'stable',
          content: '帮我查一下北京天气',
          conversationId: 'session:weather',
          turnId: 'turn:weather:1',
          messageId: 'message:user:1',
          groupId: 'turn:weather:1',
          data: {
            role: 'user'
          }
        }
      },
      {
        type: 'block.upsert',
        block: {
          id: 'block:assistant:text',
          slot: 'main',
          type: 'text',
          renderer: 'text',
          state: 'stable',
          content: '我来为你查询天气',
          conversationId: 'session:weather',
          turnId: 'turn:weather:1',
          messageId: 'message:assistant:1',
          groupId: 'turn:weather:1',
          data: {
            role: 'assistant'
          }
        }
      },
      {
        type: 'block.upsert',
        block: {
          id: 'block:assistant:tool',
          slot: 'main',
          type: 'tool',
          renderer: 'tool.weather',
          state: 'stable',
          conversationId: 'session:weather',
          turnId: 'turn:weather:1',
          messageId: 'message:assistant:1',
          groupId: 'turn:weather:1',
          data: {
            role: 'assistant',
            title: '查询天气'
          }
        }
      }
    ]);

    const messages = createRuntimeTranscriptMessages(runtime);

    expect(messages).toHaveLength(2);
    const [userMessage, assistantMessage] = messages;

    if (!userMessage || !assistantMessage) {
      throw new Error('Expected transcript to contain both user and assistant messages.');
    }

    expect(userMessage).toMatchObject({
      role: 'user',
      conversationId: 'session:weather',
      turnId: 'turn:weather:1',
      messageId: 'message:user:1'
    });
    expect(assistantMessage).toMatchObject({
      role: 'assistant',
      conversationId: 'session:weather',
      turnId: 'turn:weather:1',
      messageId: 'message:assistant:1'
    });
    expect(assistantMessage.blockIds).toEqual([
      'block:assistant:text',
      'block:assistant:tool'
    ]);
  });
});
