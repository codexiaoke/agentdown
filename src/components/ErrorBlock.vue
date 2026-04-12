<script setup lang="ts">
import { computed } from 'vue';

/**
 * `ErrorBlock` 的组件输入参数。
 */
interface Props {
  title: string;
  message: string;
  code?: string;
  refId?: string;
}

const props = defineProps<Props>();

/**
 * 默认错误块只显示最关键的一句错误文案。
 */
const resolvedMessage = computed(() => {
  return props.message?.trim() || props.title?.trim() || '发生错误';
});
</script>

<template>
  <p
    class="agentdown-error-block"
    role="alert"
  >
    {{ resolvedMessage }}
  </p>
</template>

<style scoped>
.agentdown-error-block {
  width: fit-content;
  max-width: 100%;
  min-width: 0;
  margin: 0;
  color: #a14a4a;
  font-size: 0.92rem;
  line-height: 1.72;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
