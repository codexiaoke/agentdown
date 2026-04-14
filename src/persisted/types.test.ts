import { describe, expect, it } from 'vitest';
import {
  isAgentdownRenderArchive,
  isAgentdownRenderRecord,
  normalizeAgentdownRenderRecords,
  parseAgentdownRenderArchive
} from './types';

describe('persisted render archive helpers', () => {
  it('accepts a valid render record with role and created_at', () => {
    expect(isAgentdownRenderRecord({
      event: 'message',
      role: 'assistant',
      content: '北京今天阴天。',
      created_at: 1776000000000
    })).toBe(true);
  });

  it('rejects an invalid render record', () => {
    expect(isAgentdownRenderRecord({
      event: 'message',
      content: 'missing role',
      created_at: 1776000000000
    })).toBe(false);
  });

  it('parses and clones a valid render archive payload', () => {
    const parsed = parseAgentdownRenderArchive({
      format: 'agentdown.session/v1',
      framework: 'springai',
      status: 'completed',
      updated_at: 1776000000001,
      records: [
        {
          event: 'message',
          role: 'user',
          content: '帮我查一下北京天气',
          created_at: 1776000000000
        },
        {
          event: 'message',
          role: 'assistant',
          content: '我来帮您查询北京的天气情况。',
          created_at: 1776000000001
        }
      ]
    });

    expect(isAgentdownRenderArchive(parsed)).toBe(true);
    expect(parsed.records).toHaveLength(2);
    expect(parsed.records[1]?.role).toBe('assistant');
  });

  it('rejects an invalid archive payload', () => {
    expect(() => parseAgentdownRenderArchive({
      format: 'agentdown.session/v1',
      framework: 'agno',
      status: 'completed',
      updated_at: 1776000000001,
      records: [
        {
          event: 'message',
          content: 'missing role',
          created_at: 1776000000000
        }
      ]
    } as any)).toThrowError('Invalid Agentdown render archive payload.');
  });

  it('normalizes external records into a cloned array', () => {
    const source = [
      {
        event: 'message',
        role: 'assistant',
        content: 'hello',
        created_at: 1776000000000
      }
    ] as const;
    const normalized = normalizeAgentdownRenderRecords(source);

    expect(normalized).toEqual(source);
    expect(normalized).not.toBe(source);
  });
});
