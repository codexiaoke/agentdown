import {
  computed,
  inject,
  provide,
  unref,
  type ComputedRef,
  type InjectionKey,
  type MaybeRefOrGetter
} from 'vue';
import { mergeAgentdownThemes } from './theme';
import type {
  AgentdownConfig,
  AgentdownDiagnosticsConfig,
  AgentdownMarkdownConfig,
  AgentdownSurfaceConfig
} from './types';
import { validateAgentdownConfig } from './validate';

const EMPTY_AGENTDOWN_CONFIG: AgentdownConfig = {};

/**
 * Agentdown config 的依赖注入 key。
 */
export const AGENTDOWN_CONFIG_KEY: InjectionKey<ComputedRef<AgentdownConfig>> =
  Symbol('agentdown-config');

/**
 * 读取一个也许是 ref / getter / 普通值的 config 源。
 */
function readAgentdownConfigSource(
  source: MaybeRefOrGetter<AgentdownConfig | undefined> | undefined
): AgentdownConfig | undefined {
  if (!source) {
    return undefined;
  }

  if (typeof source === 'function') {
    return source();
  }

  return unref(source);
}

function hasOwnKeys(value: object | undefined): boolean {
  return !!value && Object.keys(value).length > 0;
}

function mergeRecord<T extends object>(base?: T, override?: T): T | undefined {
  if (!base && !override) {
    return undefined;
  }

  return {
    ...(base ?? {}),
    ...(override ?? {})
  } as T;
}

function mergeRuntimeConfig(
  base: AgentdownConfig['runtime'],
  override: AgentdownConfig['runtime']
): AgentdownConfig['runtime'] {
  if (!base && !override) {
    return undefined;
  }

  const limits = mergeRecord(base?.limits, override?.limits);
  const merged = {
    ...(base ?? {}),
    ...(override ?? {})
  };

  if (limits) {
    merged.limits = limits;
  }

  return merged;
}

function mergeMarkdownConfig(
  base?: AgentdownMarkdownConfig,
  override?: AgentdownMarkdownConfig
): AgentdownMarkdownConfig | undefined {
  if (!base && !override) {
    return undefined;
  }

  const merged: AgentdownMarkdownConfig = { ...base, ...override };
  const performance = mergeRecord(base?.performance, override?.performance);
  const componentRegistry = mergeRecord(base?.componentRegistry, override?.componentRegistry);
  const builtinComponents = mergeRecord(base?.builtinComponents, override?.builtinComponents);

  if (performance) merged.performance = performance;
  if (componentRegistry) merged.componentRegistry = componentRegistry;
  if (builtinComponents) merged.builtinComponents = builtinComponents;

  return hasOwnKeys(merged) ? merged : undefined;
}

function mergeSurfaceConfig(
  base?: AgentdownSurfaceConfig,
  override?: AgentdownSurfaceConfig
): AgentdownSurfaceConfig | undefined {
  if (!base && !override) {
    return undefined;
  }

  const merged: AgentdownSurfaceConfig = { ...base, ...override };
  const performance = mergeRecord(base?.performance, override?.performance);
  const componentRegistry = mergeRecord(base?.componentRegistry, override?.componentRegistry);
  const builtinComponents = mergeRecord(base?.builtinComponents, override?.builtinComponents);
  const renderers = mergeRecord(base?.renderers, override?.renderers);
  const messageShells = mergeRecord(base?.messageShells, override?.messageShells);
  const messageActions = mergeRecord(base?.messageActions, override?.messageActions);

  if (performance) merged.performance = performance;
  if (componentRegistry) merged.componentRegistry = componentRegistry;
  if (builtinComponents) merged.builtinComponents = builtinComponents;
  if (renderers) merged.renderers = renderers;
  if (messageShells) merged.messageShells = messageShells;
  if (messageActions) merged.messageActions = messageActions;

  return hasOwnKeys(merged) ? merged : undefined;
}

function mergeDiagnosticsConfig(
  base?: AgentdownDiagnosticsConfig,
  override?: AgentdownDiagnosticsConfig
): AgentdownDiagnosticsConfig | undefined {
  if (!base && !override) {
    return undefined;
  }

  const handlers = [...(base?.handlers ?? []), ...(override?.handlers ?? [])];
  const enabled = override?.enabled ?? base?.enabled;
  const merged: AgentdownDiagnosticsConfig = {};

  if (enabled !== undefined) {
    merged.enabled = enabled;
  }
  if (handlers.length > 0) {
    merged.handlers = handlers;
  }

  return hasOwnKeys(merged) ? merged : undefined;
}

/**
 * 合并父级配置和当前局部配置。
 */
export function mergeAgentdownConfigs(
  base?: AgentdownConfig,
  override?: AgentdownConfig
): AgentdownConfig {
  const theme = mergeAgentdownThemes(base?.theme, override?.theme);
  const runtime = mergeRuntimeConfig(base?.runtime, override?.runtime);
  const markdown = mergeMarkdownConfig(base?.markdown, override?.markdown);
  const surface = mergeSurfaceConfig(base?.surface, override?.surface);
  const diagnostics = mergeDiagnosticsConfig(base?.diagnostics, override?.diagnostics);
  const merged: AgentdownConfig = {};

  if (theme) merged.theme = theme;
  if (runtime) merged.runtime = runtime;
  if (markdown) merged.markdown = markdown;
  if (surface) merged.surface = surface;
  if (diagnostics) merged.diagnostics = diagnostics;

  return validateAgentdownConfig(merged);
}

/**
 * 在当前组件树里注入一份新的 Agentdown config。
 */
export function provideAgentdownConfig(
  source: MaybeRefOrGetter<AgentdownConfig | undefined>
): ComputedRef<AgentdownConfig> {
  const parentConfig = inject(
    AGENTDOWN_CONFIG_KEY,
    computed(() => EMPTY_AGENTDOWN_CONFIG)
  );
  const mergedConfig = computed(() => {
    return mergeAgentdownConfigs(parentConfig.value, readAgentdownConfigSource(source));
  });

  provide(AGENTDOWN_CONFIG_KEY, mergedConfig);
  return mergedConfig;
}

/**
 * 读取当前组件可见的 Agentdown config，并叠加本地配置。
 */
export function useAgentdownConfig(
  localSource?: MaybeRefOrGetter<AgentdownConfig | undefined>
): ComputedRef<AgentdownConfig> {
  const parentConfig = inject(
    AGENTDOWN_CONFIG_KEY,
    computed(() => EMPTY_AGENTDOWN_CONFIG)
  );

  return computed(() => {
    return mergeAgentdownConfigs(parentConfig.value, readAgentdownConfigSource(localSource));
  });
}
