import { describe, expect, it, vi } from 'vitest';
import { createAgentdown, inspectAgentdownConfig } from './createAgentdown';
import { reportAgentdownDiagnostic } from './diagnostics';
import { validateAgentdownConfig } from './validate';

describe('createAgentdown', () => {
  it('binds runtime defaults, plugin config and structured diagnostics', () => {
    const diagnostics = vi.fn();
    const listenerErrors = vi.fn();
    const agentdown = createAgentdown({
      runtime: {
        limits: { maxNodes: 1 },
        onListenerError: listenerErrors
      },
      diagnostics: {
        handlers: [diagnostics]
      }
    });
    const runtime = agentdown.createRuntime();

    runtime.subscribe(() => {
      throw new Error('subscriber failed');
    });
    runtime.apply({
      type: 'node.upsert',
      node: { id: 'root', type: 'run', data: {} }
    });

    expect(listenerErrors).toHaveBeenCalledTimes(1);
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'runtime',
      level: 'error',
      code: 'runtime.listener-error',
      details: expect.objectContaining({ revision: 1 })
    }));
    expect(agentdown.inspectConfig()).toMatchObject({
      configuredSections: ['runtime', 'diagnostics'],
      runtimeLimits: { maxNodes: 1 },
      diagnosticHandlerCount: 1
    });
  });

  it('supports serializable inspection without exposing registered implementations', () => {
    expect(inspectAgentdownConfig({
      markdown: {
        plugins: [() => undefined],
        componentRegistry: { ProductCard: {} as never }
      },
      surface: {
        renderers: { a2ui: {} as never }
      }
    })).toMatchObject({
      configuredSections: ['markdown', 'surface'],
      markdownPluginCount: 1,
      markdownComponentCount: 1,
      surfaceRendererCount: 1
    });
  });

  it('rejects invalid production config before installation', () => {
    expect(() => validateAgentdownConfig({
      runtime: { limits: { maxNodes: -1 } }
    })).toThrow(/runtime\.limits\.maxNodes/);

    expect(() => createAgentdown({
      surface: { performance: { groupWindowStep: 0 } }
    })).toThrow(/surface\.performance\.groupWindowStep/);
  });

  it('isolates diagnostic handler failures', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const healthyHandler = vi.fn();

    reportAgentdownDiagnostic({
      diagnostics: {
        handlers: [() => {
          throw new Error('sink unavailable');
        }, healthyHandler]
      }
    }, {
      scope: 'config',
      level: 'warning',
      code: 'config.test',
      message: 'diagnostic isolation test',
      timestamp: 1
    });

    expect(healthyHandler).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
