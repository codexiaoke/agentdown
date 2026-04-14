import { effectScope, nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import type { BuiltinAgentdownRenderArchive } from '../persisted/builtin';
import { useAgentdownRenderArchive } from './useAgentdownRenderArchive';

describe('useAgentdownRenderArchive', () => {
  it('restores archive input into a reactive runtime', async () => {
    const archive = ref<BuiltinAgentdownRenderArchive<'springai', 'completed'> | null>({
      format: 'agentdown.session/v1',
      framework: 'springai',
      conversation_id: 'conversation:test:hook',
      session_id: 'session:test:hook',
      run_id: 'run:test:hook',
      status: 'completed',
      updated_at: 1776101000100,
      completed_at: 1776101000100,
      records: [
        {
          event: 'message',
          role: 'user',
          content: '查一下上海天气',
          created_at: 1776101000000
        },
        {
          event: 'approval',
          role: 'assistant',
          content: {
            title: '工具调用确认：lookup_weather',
            status: 'approved'
          },
          created_at: 1776101000020
        },
        {
          event: 'message',
          role: 'assistant',
          content: '上海今天晴。',
          created_at: 1776101000080
        }
      ]
    });
    const scope = effectScope();
    const state = scope.run(() => useAgentdownRenderArchive({
      input: archive
    }));

    if (!state) {
      throw new Error('Failed to create render archive state.');
    }

    await nextTick();

    expect(state.metadata.value.framework).toBe('springai');
    expect(state.lastUserMessage.value).toBe('查一下上海天气');
    expect(state.runtimeState.blocks.value.some((block) => block.renderer === 'approval')).toBe(true);

    archive.value = {
      format: 'agentdown.session/v1',
      framework: 'springai',
      conversation_id: 'conversation:test:hook:next',
      session_id: 'session:test:hook:next',
      run_id: 'run:test:hook:next',
      status: 'completed',
      updated_at: 1776101001100,
      completed_at: 1776101001100,
      records: [
        {
          event: 'message',
          role: 'user',
          content: '查一下南京天气',
          created_at: 1776101001000
        },
        {
          event: 'message',
          role: 'assistant',
          content: '南京今天多云。',
          created_at: 1776101001080
        }
      ]
    };

    await nextTick();

    expect(state.metadata.value.sessionId).toBe('session:test:hook:next');
    expect(state.lastUserMessage.value).toBe('查一下南京天气');
    expect(state.runtimeState.blocks.value.some((block) => block.content === '南京今天多云。')).toBe(true);

    scope.stop();
  });

  it('clears runtime when input becomes empty', async () => {
    const archive = ref<BuiltinAgentdownRenderArchive<'agno', 'completed'> | null>({
      format: 'agentdown.session/v1',
      framework: 'agno',
      status: 'completed',
      updated_at: 1776102000100,
      records: [
        {
          event: 'message',
          role: 'assistant',
          content: 'hello',
          created_at: 1776102000000
        }
      ]
    });
    const scope = effectScope();
    const state = scope.run(() => useAgentdownRenderArchive({
      input: archive
    }));

    if (!state) {
      throw new Error('Failed to create render archive state.');
    }

    await nextTick();
    expect(state.runtimeState.blocks.value).toHaveLength(1);

    archive.value = null;
    await nextTick();

    expect(state.runtimeState.blocks.value).toHaveLength(0);
    expect(state.restored.value).toBeNull();

    scope.stop();
  });
});
