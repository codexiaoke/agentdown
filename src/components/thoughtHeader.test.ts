import { describe, expect, it } from 'vitest';
import {
  extractThoughtDurationText,
  formatThoughtDuration,
  normalizeThoughtDurationText,
  resolveThoughtHeader
} from './thoughtHeader';

describe('thoughtHeader', () => {
  it('formats the thinking state into a Chinese title', () => {
    expect(resolveThoughtHeader({
      title: '正在思考',
      status: 'thinking'
    })).toEqual({
      title: '正在思考',
      shimmering: true,
      status: 'thinking'
    });
  });

  it('normalizes a completed title with duration text', () => {
    expect(resolveThoughtHeader({
      title: '已思考（用时 7 秒）'
    })).toEqual({
      title: '已思考（用时 7 秒）',
      shimmering: false,
      status: 'done'
    });
  });

  it('prefers explicit duration milliseconds for completed thoughts', () => {
    expect(resolveThoughtHeader({
      title: '思考中',
      status: 'done',
      durationMs: 7_200
    })).toEqual({
      title: '已思考（用时 7.2 秒）',
      shimmering: false,
      status: 'done'
    });
  });

  it('keeps the thinking state even when the title contains elapsed time', () => {
    expect(resolveThoughtHeader({
      title: '思考中（用时 3 秒）',
      status: 'thinking'
    })).toEqual({
      title: '正在思考',
      shimmering: true,
      status: 'thinking'
    });
  });

  it('preserves custom idle titles', () => {
    expect(resolveThoughtHeader({
      title: '问题拆解'
    })).toEqual({
      title: '问题拆解',
      shimmering: false,
      status: 'idle'
    });
  });

  it('extracts duration text from raw titles', () => {
    expect(extractThoughtDurationText('思考完成（用时 5 秒）')).toBe('5 秒');
    expect(extractThoughtDurationText('已完成，耗时 12 秒')).toBe('12 秒');
  });

  it('normalizes explicit duration text payloads', () => {
    expect(normalizeThoughtDurationText('用时 9 秒')).toBe('9 秒');
    expect(normalizeThoughtDurationText('耗时 1 分 2 秒')).toBe('1 分 2 秒');
    expect(normalizeThoughtDurationText('7 秒')).toBe('7 秒');
  });

  it('formats millisecond durations into readable Chinese strings', () => {
    expect(formatThoughtDuration(500)).toBe('1 秒');
    expect(formatThoughtDuration(4_400)).toBe('4.4 秒');
    expect(formatThoughtDuration(28_900)).toBe('29 秒');
    expect(formatThoughtDuration(122_000)).toBe('2 分 2 秒');
  });
});
