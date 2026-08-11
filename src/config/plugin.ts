import { computed, type Plugin } from 'vue';
import { AGENTDOWN_CONFIG_KEY, mergeAgentdownConfigs } from './context';
import type { AgentdownConfig } from './types';
import { validateAgentdownConfig } from './validate';

/**
 * 创建 Agentdown 的全局安装插件。
 */
export function createAgentdownPlugin(config: AgentdownConfig = {}): Plugin {
  const resolvedConfig = validateAgentdownConfig(mergeAgentdownConfigs(undefined, config));

  return {
    install(app) {
      app.provide(
        AGENTDOWN_CONFIG_KEY,
        computed(() => resolvedConfig)
      );
    }
  };
}
