import { computed, type Plugin } from 'vue';
import { AGENTDOWN_CONFIG_KEY, mergeAgentdownConfigs } from './context';
import type { AgentdownConfig } from './types';

/**
 * 创建 Agentdown 的全局安装插件。
 */
export function createAgentdownPlugin(config: AgentdownConfig = {}): Plugin {
  return {
    install(app) {
      app.provide(
        AGENTDOWN_CONFIG_KEY,
        computed(() => mergeAgentdownConfigs(undefined, config))
      );
    }
  };
}
