import { describe, expect, it } from 'vitest';
import {
  resolveMarkdownRenderMode,
  resolveMarkdownRendererPerformance
} from './markdownRendererPerformance';

describe('markdownRendererPerformance', () => {
  it('defaults to typing mode for legacy configs without virtualization', () => {
    expect(resolveMarkdownRenderMode(undefined)).toBe('typing');
    expect(resolveMarkdownRendererPerformance(undefined)).toEqual({
      mode: 'typing',
      textSlabChars: 1600,
      virtualize: false,
      virtualizeMargin: '1200px 0px'
    });
  });

  it('infers window mode from legacy virtualize=true configs', () => {
    expect(resolveMarkdownRenderMode({
      virtualize: true
    })).toBe('window');
  });

  it('uses window mode defaults when explicitly requested', () => {
    expect(resolveMarkdownRendererPerformance({
      mode: 'window'
    })).toEqual({
      mode: 'window',
      textSlabChars: 1200,
      virtualize: true,
      virtualizeMargin: '1400px 0px'
    });
  });

  it('lets explicit performance options override mode defaults', () => {
    expect(resolveMarkdownRendererPerformance({
      mode: 'window',
      textSlabChars: 800,
      virtualize: false,
      virtualizeMargin: '800px 0px'
    })).toEqual({
      mode: 'window',
      textSlabChars: 800,
      virtualize: false,
      virtualizeMargin: '800px 0px'
    });
  });

  it('respects textSlabChars=false in typing mode', () => {
    expect(resolveMarkdownRendererPerformance({
      mode: 'typing',
      textSlabChars: false
    })).toEqual({
      mode: 'typing',
      textSlabChars: false,
      virtualize: false,
      virtualizeMargin: '1200px 0px'
    });
  });
});
