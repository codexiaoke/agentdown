<script setup lang="ts">
import { ref } from 'vue';

const props = withDefaults(defineProps<{
  title?: string;
  summary?: string;
  detail?: string;
  buttonText?: string;
}>(), {
  title: '运行态 AGUI 组件',
  summary: '这里可以直接挂你的业务组件。',
  detail: '点击后可以展开更多信息、触发交互，或者继续读取 runtime 数据。',
  buttonText: '查看详情'
});

const expanded = ref(false);
</script>

<template>
  <article class="builtin-agui-card">
    <div class="builtin-agui-card__header">
      <div>
        <span class="builtin-agui-card__eyebrow">AGUI</span>
        <strong>{{ title }}</strong>
      </div>

      <button
        type="button"
        class="builtin-agui-card__action"
        @click="expanded = !expanded"
      >
        {{ expanded ? '收起' : buttonText }}
      </button>
    </div>

    <p class="builtin-agui-card__summary">
      {{ summary }}
    </p>

    <p
      v-if="expanded"
      class="builtin-agui-card__detail"
    >
      {{ detail }}
    </p>
  </article>
</template>

<style scoped>
.builtin-agui-card {
  width: min(100%, 520px);
  border: 1px solid rgba(191, 219, 254, 0.92);
  border-radius: 18px;
  padding: 14px 16px;
  background: linear-gradient(180deg, #ffffff, #eff6ff);
}

.builtin-agui-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.builtin-agui-card__header strong {
  display: block;
  font-size: 15px;
}

.builtin-agui-card__eyebrow {
  display: block;
  margin-bottom: 4px;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.builtin-agui-card__action {
  border: 0;
  border-radius: 999px;
  padding: 7px 11px;
  background: #dbeafe;
  color: #1d4ed8;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.builtin-agui-card__summary,
.builtin-agui-card__detail {
  margin: 0;
  color: #475569;
  line-height: 1.75;
}

.builtin-agui-card__summary {
  margin-top: 12px;
}

.builtin-agui-card__detail {
  margin-top: 10px;
  color: #0f172a;
}
</style>
