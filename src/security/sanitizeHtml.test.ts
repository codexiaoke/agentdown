import { describe, expect, it, vi } from 'vitest';
import {
  resolveAgentdownHtml,
  sanitizeAgentdownHtml
} from './sanitizeHtml';

describe('Agentdown HTML security boundary', () => {
  it('allows markdown-it generated HTML to render during SSR', () => {
    const sanitizer = vi.fn(() => 'sanitized');

    expect(resolveAgentdownHtml(
      '<table><tr><td>safe</td></tr></table>',
      'generated',
      sanitizer,
      false
    )).toContain('<table>');
    expect(sanitizer).not.toHaveBeenCalled();
  });

  it('fails closed for untrusted HTML before a browser sanitizer is available', () => {
    const sanitizer = vi.fn(() => '<p>unsafe</p>');

    expect(resolveAgentdownHtml(
      '<img src=x onerror=alert(1)>',
      'untrusted',
      sanitizer,
      false
    )).toBe('');
    expect(sanitizer).not.toHaveBeenCalled();
    expect(sanitizeAgentdownHtml('<script>alert(1)</script>', { trust: 'untrusted' })).toBe('');
  });

  it('supports an explicit host sanitizer for untrusted HTML', () => {
    const sanitizer = vi.fn(() => '<p>clean</p>');

    expect(resolveAgentdownHtml(
      '<p onclick="bad()">clean</p>',
      'untrusted',
      sanitizer,
      true
    )).toBe('<p>clean</p>');
    expect(sanitizer).toHaveBeenCalledWith(
      '<p onclick="bad()">clean</p>',
      { trust: 'untrusted' }
    );
  });
});
