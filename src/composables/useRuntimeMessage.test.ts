import { effectScope, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { createAgentRuntime } from '../runtime/createAgentRuntime';
import {
  useRuntimeMessage,
  useRuntimeMessagesByTurnId
} from './useRuntimeMessage';

describe('useRuntimeMessage', () => {
  it('tracks a single runtime message reactively', () => {
    const runtime = createAgentRuntime();
    const scope = effectScope();
    const state = scope.run(() => useRuntimeMessage(runtime, 'message:assistant:1'));

    if (!state) {
      throw new Error('Failed to create runtime message state.');
    }

    runtime.apply({
      type: 'block.upsert',
      block: {
        id: 'block:assistant:1',
        slot: 'main',
        type: 'text',
        renderer: 'text',
        state: 'stable',
        content: '你好',
        messageId: 'message:assistant:1',
        turnId: 'turn:1',
        data: {
          role: 'assistant'
        }
      }
    });

    expect(state.message.value?.text).toBe('你好');
    scope.stop();
  });

  it('tracks turn-scoped runtime messages reactively', () => {
    const runtime = createAgentRuntime();
    const turnId = ref<string | null>('turn:1');
    const scope = effectScope();
    const state = scope.run(() => useRuntimeMessagesByTurnId(runtime, turnId));

    if (!state) {
      throw new Error('Failed to create turn-scoped runtime messages state.');
    }

    runtime.apply([
      {
        type: 'block.upsert',
        block: {
          id: 'block:user:1',
          slot: 'main',
          type: 'text',
          renderer: 'text',
          state: 'stable',
          content: '第一轮用户消息',
          turnId: 'turn:1',
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
          content: '第一轮助手消息',
          turnId: 'turn:1',
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
          content: '第二轮助手消息',
          turnId: 'turn:2',
          messageId: 'message:assistant:2',
          data: {
            role: 'assistant'
          }
        }
      }
    ]);

    expect(state.messages.value.map((message) => message.messageId)).toEqual([
      'message:user:1',
      'message:assistant:1'
    ]);

    turnId.value = 'turn:2';

    expect(state.refresh().map((message) => message.messageId)).toEqual([
      'message:assistant:2'
    ]);
    scope.stop();
  });
});
