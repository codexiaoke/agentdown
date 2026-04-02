<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  id: number;
  status: string;
}>();

const statusLabel = computed(() =>
  props.status
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
);
</script>

<template>
  <div class="demo-approval-card">
    <div class="demo-approval-main">
      <span class="demo-approval-eyebrow">AGUI Component</span>
      <strong>Approval request #{{ id }}</strong>
      <p>
        这个卡片是从 markdown 指令里动态注入进来的 Vue 组件，不是写死在模板里的静态块。
      </p>
    </div>

    <div class="demo-approval-side">
      <span class="demo-approval-status">{{ statusLabel }}</span>
      <div class="demo-approval-actions">
        <button type="button">Approve</button>
        <button
          type="button"
          class="demo-approval-secondary"
        >
          Request change
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.demo-approval-card {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: center;
  padding: 18px;
  border-radius: 16px;
}

.demo-approval-main {
  min-width: 0;
}

.demo-approval-eyebrow {
  display: inline-flex;
  margin-bottom: 8px;
  color: #6b7280;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
}

.demo-approval-main strong {
  display: block;
  font-size: 17px;
  letter-spacing: -0.02em;
}

.demo-approval-main p {
  margin: 8px 0 0;
  color: #4b5563;
  line-height: 1.7;
}

.demo-approval-side {
  display: grid;
  gap: 12px;
  justify-items: end;
}

.demo-approval-status {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 6px 10px;
  background: #f3f4f6;
  color: #374151;
  font-size: 12px;
  font-weight: 700;
}

.demo-approval-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.demo-approval-actions button {
  border: 1px solid #d1d5db;
  border-radius: 999px;
  padding: 10px 12px;
  background: #111827;
  color: #ffffff;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.demo-approval-actions .demo-approval-secondary {
  background: #ffffff;
  color: #111827;
}

@media (max-width: 720px) {
  .demo-approval-card {
    flex-direction: column;
    align-items: stretch;
  }

  .demo-approval-side {
    justify-items: start;
  }

  .demo-approval-actions {
    justify-content: flex-start;
  }
}
</style>
