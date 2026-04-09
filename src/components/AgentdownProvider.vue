<script setup lang="ts">
import { computed } from 'vue';
import { provideAgentdownConfig, mergeAgentdownConfigs } from '../config/context';
import type { AgentdownConfig, AgentdownTheme } from '../config/types';

/**
 * `AgentdownProvider` 的输入参数。
 */
interface Props {
  /** 当前子树级配置。 */
  config?: AgentdownConfig | undefined;
  /** 当前子树级主题；作为 `config.theme` 的简写。 */
  theme?: AgentdownTheme | undefined;
}

const props = defineProps<Props>();

/**
 * 把 `config` 和 `theme` 简写统一收敛成一份局部配置。
 */
const localConfig = computed<AgentdownConfig>(() => {
  const shorthandTheme = props.theme ? { theme: props.theme } : undefined;
  return mergeAgentdownConfigs(props.config, shorthandTheme);
});

provideAgentdownConfig(localConfig);
</script>

<template>
  <slot />
</template>
