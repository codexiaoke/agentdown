import { describe, expect, it } from 'vitest';
import { createAgentRuntime } from './createAgentRuntime';
import {
  getBlocksByConversationId,
  getBlocksByGroup,
  getBlocksByMessageId,
  getBlocksByTurnId,
  getRuntimeBlock
} from './blockSelectors';

describe('blockSelectors', () => {
  it('reads a single block by id from runtime and snapshot', () => {
    const runtime = createAgentRuntime();

    runtime.apply({
      type: 'block.upsert',
      block: {
        id: 'block:1',
        slot: 'main',
        type: 'text',
        renderer: 'text',
        state: 'stable',
        content: 'hello',
        groupId: 'turn:1',
        data: {}
      }
    });

    expect(getRuntimeBlock(runtime, 'block:1')?.content).toBe('hello');
    expect(getRuntimeBlock(runtime.snapshot(), 'block:1')?.content).toBe('hello');
  });

  it('reads blocks by groupId while preserving runtime order', () => {
    const runtime = createAgentRuntime();

    runtime.apply([
      {
        type: 'block.upsert',
        block: {
          id: 'block:1',
          slot: 'main',
          type: 'text',
          renderer: 'text',
          state: 'stable',
          content: '第一段',
          groupId: 'turn:weather',
          data: {}
        }
      },
      {
        type: 'block.upsert',
        block: {
          id: 'block:2',
          slot: 'main',
          type: 'tool',
          renderer: 'tool.weather',
          state: 'stable',
          groupId: 'turn:weather',
          data: {}
        }
      },
      {
        type: 'block.upsert',
        block: {
          id: 'block:3',
          slot: 'main',
          type: 'text',
          renderer: 'text',
          state: 'stable',
          content: '第二段',
          groupId: 'turn:weather',
          data: {}
        }
      }
    ]);

    expect(getBlocksByGroup(runtime, 'turn:weather').map((block) => block.id)).toEqual([
      'block:1',
      'block:2',
      'block:3'
    ]);
    expect(getBlocksByGroup(runtime.snapshot(), 'turn:weather', {
      type: 'text'
    }).map((block) => block.content)).toEqual([
      '第一段',
      '第二段'
    ]);
  });

  it('reads blocks by explicit messageId and turnId semantics', () => {
    const runtime = createAgentRuntime();

    runtime.apply([
      {
        type: 'block.upsert',
        block: {
          id: 'block:user',
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
            role: 'assistant'
          }
        }
      }
    ]);

    expect(getBlocksByMessageId(runtime, 'message:assistant:1').map((block) => block.id)).toEqual([
      'block:assistant:text',
      'block:assistant:tool'
    ]);
    expect(getBlocksByTurnId(runtime.snapshot(), 'turn:weather:1').map((block) => block.id)).toEqual([
      'block:user',
      'block:assistant:text',
      'block:assistant:tool'
    ]);
    expect(getBlocksByConversationId(runtime, 'session:weather').map((block) => block.id)).toEqual([
      'block:user',
      'block:assistant:text',
      'block:assistant:tool'
    ]);
  });
});
