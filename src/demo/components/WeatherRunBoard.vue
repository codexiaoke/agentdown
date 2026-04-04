<script setup lang="ts">
import { computed } from 'vue';
import { useAguiChildren, type AgentNodeState } from '../../index';
import WeatherToolCard from './WeatherToolCard.vue';

const children = useAguiChildren<AgentNodeState>();
const tools = computed(() => children.value.filter(item => item.kind === 'tool'));
</script>

<template>
  <section
    v-if="tools.length > 0"
    class="weather-run-board"
  >
    <WeatherToolCard
      v-for="tool in tools"
      :key="tool.id"
      :tool="tool"
    />
  </section>
</template>

<style scoped>
.weather-run-board {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
