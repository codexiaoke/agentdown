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
import type { AgentdownConfig } from './types';

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

/**
 * 合并父级配置和当前局部配置。
 */
export function mergeAgentdownConfigs(
  base?: AgentdownConfig,
  override?: AgentdownConfig
): AgentdownConfig {
  const theme = mergeAgentdownThemes(base?.theme, override?.theme);

  return theme ? { theme } : {};
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
