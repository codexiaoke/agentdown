import { describe, expect, it, vi } from 'vitest';
import { mergeAgentdownConfigs } from './context';
import type { AgentdownDiagnosticHandler } from './types';

describe('mergeAgentdownConfigs', () => {
  it('deep merges layered defaults and replaces markdown plugin lists', () => {
    const baseDiagnostic = vi.fn() as AgentdownDiagnosticHandler;
    const localDiagnostic = vi.fn() as AgentdownDiagnosticHandler;
    const basePlugin = vi.fn();
    const localPlugin = vi.fn();

    const merged = mergeAgentdownConfigs(
      {
        runtime: {
          limits: { maxNodes: 100, maxBlocks: 200 }
        },
        markdown: {
          performance: { mode: 'window', virtualize: true },
          componentRegistry: { BaseCard: {} as never },
          plugins: [basePlugin]
        },
        surface: {
          performance: { groupWindow: 80 },
          renderers: { base: {} as never },
          handoffActions: { enabled: true }
        },
        diagnostics: {
          handlers: [baseDiagnostic]
        }
      },
      {
        runtime: {
          limits: { maxNodes: 50 }
        },
        markdown: {
          performance: { virtualizeMargin: '900px' },
          componentRegistry: { LocalCard: {} as never },
          plugins: [localPlugin]
        },
        surface: {
          performance: { lazyMount: false },
          renderers: { local: {} as never },
          handoffActions: false
        },
        diagnostics: {
          handlers: [localDiagnostic]
        }
      }
    );

    expect(merged.runtime?.limits).toEqual({ maxNodes: 50, maxBlocks: 200 });
    expect(merged.markdown?.performance).toEqual({
      mode: 'window',
      virtualize: true,
      virtualizeMargin: '900px'
    });
    expect(Object.keys(merged.markdown?.componentRegistry ?? {})).toEqual(['BaseCard', 'LocalCard']);
    expect(merged.markdown?.plugins).toEqual([localPlugin]);
    expect(merged.surface?.performance).toEqual({ groupWindow: 80, lazyMount: false });
    expect(Object.keys(merged.surface?.renderers ?? {})).toEqual(['base', 'local']);
    expect(merged.surface?.handoffActions).toBe(false);
    expect(merged.diagnostics?.handlers).toEqual([baseDiagnostic, localDiagnostic]);
  });
});
