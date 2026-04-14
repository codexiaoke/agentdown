import { describe, expect, it } from 'vitest';
import { createAgentRuntime } from '../runtime/createAgentRuntime';
import type { BuiltinAgentdownRenderArchive } from './builtin';
import { restoreAgentdownRenderArchive } from './restore';

describe('restoreAgentdownRenderArchive', () => {
  it('restores builtin archive JSON without a custom adapter', () => {
    const archive: BuiltinAgentdownRenderArchive<'agno', 'completed'> = {
      format: 'agentdown.session/v1',
      framework: 'agno',
      conversation_id: 'conversation:test:restore',
      session_id: 'session:test:restore',
      run_id: 'run:test:restore',
      status: 'completed',
      updated_at: 1776100000100,
      completed_at: 1776100000100,
      records: [
        {
          event: 'message',
          role: 'user',
          content: '帮我查一下北京天气',
          created_at: 1776100000000
        },
        {
          event: 'tool',
          role: 'assistant',
          content: {
            name: 'lookup_weather',
            status: 'completed',
            args: {
              city: '北京'
            },
            result: {
              city: '北京',
              condition: '晴'
            }
          },
          created_at: 1776100000040
        },
        {
          event: 'message',
          role: 'assistant',
          content: {
            text: '北京今天晴，约 24C。'
          },
          created_at: 1776100000080
        }
      ]
    };
    const restored = restoreAgentdownRenderArchive(archive);
    const runtime = createAgentRuntime();

    runtime.apply(restored.commands);

    expect(restored.metadata.framework).toBe('agno');
    expect(restored.metadata.sessionId).toBe('session:test:restore');
    expect(restored.lastUserMessage).toBe('帮我查一下北京天气');
    expect(runtime.blocks().some((block) => block.renderer === 'tool')).toBe(true);
    expect(runtime.blocks().some((block) => block.content === '北京今天晴，约 24C。')).toBe(true);
  });

  it('accepts a plain records array as input', () => {
    const restored = restoreAgentdownRenderArchive([
      {
        event: 'message',
        role: 'user',
        content: 'hello',
        created_at: 1776100000000
      },
      {
        event: 'error',
        role: 'assistant',
        content: {
          message: '后端暂时不可用，请稍后重试。'
        },
        created_at: 1776100000050
      }
    ]);

    expect(restored.archive).toBeNull();
    expect(restored.records).toHaveLength(2);
    expect(restored.metadata.framework).toBeNull();
    expect(restored.lastUserMessage).toBe('hello');
  });

  it('restores explicit markdown messages as markdown preview blocks', () => {
    const archive: BuiltinAgentdownRenderArchive<'agno', 'completed'> = {
      format: 'agentdown.session/v1',
      framework: 'agno',
      conversation_id: 'conversation:test:restore:markdown',
      session_id: 'session:test:restore:markdown',
      run_id: 'run:test:restore:markdown',
      status: 'completed',
      updated_at: 1776100001100,
      completed_at: 1776100001100,
      records: [
        {
          event: 'message',
          role: 'assistant',
          content: {
            text: '# 标题\n\n- 列表项',
            kind: 'markdown'
          },
          created_at: 1776100001000
        }
      ]
    };

    const restored = restoreAgentdownRenderArchive(archive);
    const markdownInsert = restored.commands.find((command) => {
      return command.type === 'block.insert' && command.block.renderer === 'markdown';
    });

    expect(markdownInsert).toBeTruthy();
    expect(markdownInsert && markdownInsert.type === 'block.insert'
      ? markdownInsert.block.content
      : '').toContain('# 标题');
    expect(markdownInsert && markdownInsert.type === 'block.insert'
      ? markdownInsert.block.data.streamingDraftMode
      : '').toBe('preview');
  });

  it('detects markdown strings during restore', () => {
    const restored = restoreAgentdownRenderArchive([
      {
        event: 'message',
        role: 'assistant',
        content: '## 小节\n\n| a | b |\n| :-- | :-- |\n| 1 | 2 |',
        created_at: 1776100001200
      }
    ]);

    expect(restored.commands.some((command) => {
      return command.type === 'block.insert' && command.block.renderer === 'markdown';
    })).toBe(true);
  });
});
