import type { AgentdownConfig } from './types';

function assertPositiveNumber(value: unknown, path: string, allowFalse = false): void {
  if (allowFalse && value === false) {
    return;
  }
  if (value !== undefined && (!Number.isFinite(value) || Number(value) <= 0)) {
    throw new TypeError(`Agentdown config "${path}" must be a positive number${allowFalse ? ' or false' : ''}.`);
  }
}

/** 在安装插件或创建运行时前拒绝明显无效的生产配置。 */
export function validateAgentdownConfig(config: AgentdownConfig): AgentdownConfig {
  for (const [name, value] of Object.entries(config.runtime?.limits ?? {})) {
    if (value === false) {
      continue;
    }
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
      throw new TypeError(
        `Agentdown config "runtime.limits.${name}" must be a non-negative safe integer or false.`
      );
    }
  }

  assertPositiveNumber(config.markdown?.performance?.textSlabChars, 'markdown.performance.textSlabChars', true);
  assertPositiveNumber(config.surface?.performance?.groupWindow, 'surface.performance.groupWindow', true);
  assertPositiveNumber(config.surface?.performance?.groupWindowStep, 'surface.performance.groupWindowStep');
  assertPositiveNumber(config.surface?.performance?.textSlabChars, 'surface.performance.textSlabChars');
  assertPositiveNumber(
    config.surface?.performance?.blockVirtualizeThreshold,
    'surface.performance.blockVirtualizeThreshold'
  );

  if (config.markdown?.plugins && !Array.isArray(config.markdown.plugins)) {
    throw new TypeError('Agentdown config "markdown.plugins" must be an array.');
  }

  if (config.diagnostics?.handlers && !Array.isArray(config.diagnostics.handlers)) {
    throw new TypeError('Agentdown config "diagnostics.handlers" must be an array.');
  }
  config.diagnostics?.handlers?.forEach((handler, index) => {
    if (typeof handler !== 'function') {
      throw new TypeError(`Agentdown config "diagnostics.handlers[${index}]" must be a function.`);
    }
  });

  return config;
}
