import { effectScope, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { createAgentRuntime } from '../runtime/createAgentRuntime';
import {
  useRuntimeBlock,
  useRuntimeBlocksByGroup,
  useRuntimeBlocksByMessageId
} from './useRuntimeBlock';

describe('useRuntimeBlock', () => {
  it('tracks a single block reactively', () => {
    const runtime = createAgentRuntime();
    const scope = effectScope();
    const state = scope.run(() => useRuntimeBlock(runtime, 'block:single'));

    if (!state) {
      throw new Error('Failed to create runtime block state.');
    }

    runtime.apply({
      type: 'block.upsert',
      block: {
        id: 'block:single',
        slot: 'main',
        type: 'text',
        renderer: 'text',
        state: 'stable',
        content: 'hello single block',
        data: {}
      }
    });

    expect(state.block.value?.content).toBe('hello single block');
    scope.stop();
  });

  it('tracks grouped blocks reactively', () => {
    const runtime = createAgentRuntime();
    const groupId = ref<string | null>('turn:1');
    const scope = effectScope();
    const state = scope.run(() => useRuntimeBlocksByGroup(runtime, groupId, {
      type: 'text'
    }));

    if (!state) {
      throw new Error('Failed to create grouped runtime block state.');
    }

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
          groupId: 'turn:1',
          data: {}
        }
      },
      {
        type: 'block.upsert',
        block: {
          id: 'block:2',
          slot: 'main',
          type: 'tool',
          renderer: 'tool',
          state: 'stable',
          groupId: 'turn:1',
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
          groupId: 'turn:2',
          data: {}
        }
      }
    ]);

    expect(state.blocks.value.map((block) => block.id)).toEqual([
      'block:1'
    ]);

    groupId.value = 'turn:2';

    expect(state.refresh().map((block) => block.id)).toEqual([
      'block:3'
    ]);
    scope.stop();
  });

  it('tracks message-scoped blocks reactively', () => {
    const runtime = createAgentRuntime();
    const messageId = ref<string | null>('message:assistant:1');
    const scope = effectScope();
    const state = scope.run(() => useRuntimeBlocksByMessageId(runtime, messageId, {
      type: 'text'
    }));

    if (!state) {
      throw new Error('Failed to create message-scoped runtime block state.');
    }

    runtime.apply([
      {
        type: 'block.upsert',
        block: {
          id: 'block:assistant:1',
          slot: 'main',
          type: 'text',
          renderer: 'text',
          state: 'stable',
          content: '第一段',
          messageId: 'message:assistant:1',
          turnId: 'turn:1',
          groupId: 'turn:1',
          data: {}
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
          content: '第二段',
          messageId: 'message:assistant:2',
          turnId: 'turn:1',
          groupId: 'turn:1',
          data: {}
        }
      }
    ]);

    expect(state.blocks.value.map((block) => block.id)).toEqual([
      'block:assistant:1'
    ]);

    messageId.value = 'message:assistant:2';

    expect(state.refresh().map((block) => block.id)).toEqual([
      'block:assistant:2'
    ]);
    scope.stop();
  });
});
