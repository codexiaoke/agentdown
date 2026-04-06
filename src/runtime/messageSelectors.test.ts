import { describe, expect, it } from 'vitest';
import { createAgentRuntime } from './createAgentRuntime';
import {
  getRuntimeMessage,
  getRuntimeMessagesByConversationId,
  getRuntimeMessagesByTurnId
} from './messageSelectors';

describe('messageSelectors', () => {
  it('reads a single runtime message by messageId', () => {
    const runtime = createAgentRuntime();

    runtime.apply([
      {
        type: 'block.upsert',
        block: {
          id: 'block:assistant:1',
          slot: 'main',
          type: 'text',
          renderer: 'text',
          state: 'stable',
          content: '我来帮你查天气',
          conversationId: 'session:weather',
          turnId: 'turn:weather:1',
          messageId: 'message:assistant:1',
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
          data: {
            role: 'assistant',
            title: '查询天气'
          }
        }
      }
    ]);

    const message = getRuntimeMessage(runtime, 'message:assistant:1');

    expect(message?.messageId).toBe('message:assistant:1');
    expect(message?.blockIds).toEqual([
      'block:assistant:1',
      'block:assistant:tool'
    ]);
  });

  it('reads messages by turnId and conversationId', () => {
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
          content: '帮我查天气',
          conversationId: 'session:weather',
          turnId: 'turn:weather:1',
          messageId: 'message:user:1',
          data: {
            role: 'user'
          }
        }
      },
      {
        type: 'block.upsert',
        block: {
          id: 'block:assistant:1',
          slot: 'main',
          type: 'text',
          renderer: 'text',
          state: 'stable',
          content: '我来查一下',
          conversationId: 'session:weather',
          turnId: 'turn:weather:1',
          messageId: 'message:assistant:1',
          data: {
            role: 'assistant'
          }
        }
      },
      {
        type: 'block.upsert',
        block: {
          id: 'block:assistant:2',
          slot: 'main',
          type: 'text',
          renderer: 'text',
          state: 'stable',
          content: '第二轮回复',
          conversationId: 'session:weather',
          turnId: 'turn:weather:2',
          messageId: 'message:assistant:2',
          data: {
            role: 'assistant'
          }
        }
      }
    ]);

    expect(getRuntimeMessagesByTurnId(runtime, 'turn:weather:1').map((message) => message.messageId)).toEqual([
      'message:user:1',
      'message:assistant:1'
    ]);
    expect(getRuntimeMessagesByConversationId(runtime.snapshot(), 'session:weather').map((message) => message.messageId)).toEqual([
      'message:user:1',
      'message:assistant:1',
      'message:assistant:2'
    ]);
  });
});
