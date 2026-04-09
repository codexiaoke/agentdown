<script setup lang="ts">
import { computed, ref } from 'vue';
import { resolveThoughtHeader, type ThoughtHeaderStatus } from './thoughtHeader';

/**
 * `ThoughtBlock` 的输入参数。
 */
interface Props {
  /** 原始标题文案。 */
  title?: string | undefined;
  /** 显式传入的思考状态。 */
  status?: ThoughtHeaderStatus | undefined;
  /** 后端直接返回的耗时文本。 */
  durationText?: string | undefined;
  /** 以后端毫秒值传入的思考耗时。 */
  durationMs?: number | undefined;
}

const props = defineProps<Props>();

/**
 * 当前 thought 面板是否展开。
 */
const expanded = ref(false);

/**
 * 归一化后的 thought 头部展示模型。
 */
const header = computed(() => {
  return resolveThoughtHeader({
    title: props.title,
    status: props.status,
    durationText: props.durationText,
    durationMs: props.durationMs
  });
});
</script>

<template>
  <section
    class="agentdown-thought"
    :data-expanded="expanded ? 'true' : 'false'"
    :data-shimmer="header.shimmering ? 'true' : 'false'"
    :data-status="header.status"
  >
    <button
      type="button"
      class="agentdown-thought-toggle"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span class="agentdown-thought-copy">
        <span class="agentdown-thought-title">{{ header.title }}</span>
        <span
          class="agentdown-thought-chevron"
          aria-hidden="true"
        />
      </span>
    </button>

    <transition name="agentdown-thought-transition">
      <div
        v-if="expanded"
        class="agentdown-thought-body"
      >
        <slot />
      </div>
    </transition>
  </section>
</template>
