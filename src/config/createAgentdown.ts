import type { Plugin } from 'vue';
import { createAgentRuntime, DEFAULT_AGENT_RUNTIME_LIMITS } from '../runtime/createAgentRuntime';
import type { AgentRuntime, AgentRuntimeOptions } from '../runtime/types';
import { mergeAgentdownConfigs } from './context';
import { describeAgentdownError, reportAgentdownDiagnostic } from './diagnostics';
import { createAgentdownPlugin } from './plugin';
import type { AgentdownConfig } from './types';
import { validateAgentdownConfig } from './validate';

export interface AgentdownConfigInspection {
  configuredSections: Array<'theme' | 'runtime' | 'markdown' | 'surface' | 'diagnostics'>;
  runtimeLimits: Required<NonNullable<AgentRuntimeOptions['limits']>>;
  markdownPluginCount: number;
  markdownComponentCount: number;
  surfaceRendererCount: number;
  diagnosticHandlerCount: number;
}

export interface AgentdownInstance {
  readonly config: AgentdownConfig;
  readonly plugin: Plugin;
  createRuntime: (overrides?: AgentRuntimeOptions) => AgentRuntime;
  inspectConfig: () => AgentdownConfigInspection;
}

function mergeRuntimeOptions(
  base: AgentRuntimeOptions | undefined,
  override: AgentRuntimeOptions | undefined
): AgentRuntimeOptions {
  return {
    ...(base ?? {}),
    ...(override ?? {}),
    limits: {
      ...(base?.limits ?? {}),
      ...(override?.limits ?? {})
    }
  };
}

/** 返回不包含 Vue 组件和函数源码的配置诊断摘要，适合启动日志与问题报告。 */
export function inspectAgentdownConfig(config: AgentdownConfig): AgentdownConfigInspection {
  validateAgentdownConfig(config);
  const configuredSections = (
    ['theme', 'runtime', 'markdown', 'surface', 'diagnostics'] as const
  ).filter((section) => config[section] !== undefined);

  return {
    configuredSections,
    runtimeLimits: {
      ...DEFAULT_AGENT_RUNTIME_LIMITS,
      ...(config.runtime?.limits ?? {})
    },
    markdownPluginCount: config.markdown?.plugins?.length ?? 0,
    markdownComponentCount: Object.keys(config.markdown?.componentRegistry ?? {}).length,
    surfaceRendererCount: Object.keys(config.surface?.renderers ?? {}).length,
    diagnosticHandlerCount: config.diagnostics?.handlers?.length ?? 0
  };
}

/**
 * 创建一个应用级 Agentdown 实例，把 Vue plugin、runtime 默认值和诊断出口绑定到同一配置。
 */
export function createAgentdown(config: AgentdownConfig = {}): AgentdownInstance {
  const resolvedConfig = validateAgentdownConfig(mergeAgentdownConfigs(undefined, config));

  return {
    config: resolvedConfig,
    plugin: createAgentdownPlugin(resolvedConfig),
    createRuntime(overrides) {
      const options = mergeRuntimeOptions(resolvedConfig.runtime, overrides);
      const listenerErrorHandler = options.onListenerError;
      const diagnosticsEnabled = resolvedConfig.diagnostics?.enabled !== false
        && (resolvedConfig.diagnostics?.handlers?.length ?? 0) > 0;

      if (listenerErrorHandler || diagnosticsEnabled) {
        options.onListenerError = (error, context) => {
          try {
            listenerErrorHandler?.(error, context);
          } finally {
            reportAgentdownDiagnostic(resolvedConfig, {
              scope: 'runtime',
              level: 'error',
              code: 'runtime.listener-error',
              message: 'A runtime subscriber threw while processing an update.',
              details: {
                revision: context.revision,
                error: describeAgentdownError(error)
              }
            });
          }
        };
      }

      return createAgentRuntime(options);
    },
    inspectConfig() {
      return inspectAgentdownConfig(resolvedConfig);
    }
  };
}
