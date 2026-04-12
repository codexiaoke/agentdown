<script setup lang="ts">
import { computed } from 'vue';

/**
 * `BranchBlock` 的组件输入参数。
 */
interface Props {
  title: string;
  message?: string;
  branchId?: string;
  sourceRunId?: string;
  targetRunId?: string;
  status?: string;
  label?: string;
  refId?: string;
}

const props = defineProps<Props>();

/**
 * 收敛 branch 状态，缺省时回退到 pending。
 */
const resolvedStatus = computed(() => props.status ?? 'pending');

/**
 * 把 branch 状态映射成更自然的中文文案。
 */
const statusLabel = computed(() => {
  switch (resolvedStatus.value) {
    case 'running':
      return '进行中';
    case 'done':
      return '已完成';
    case 'merged':
      return '已合并';
    case 'rejected':
      return '已放弃';
    default:
      return '待开始';
  }
});
</script>

<template>
  <section
    class="agentdown-branch-block"
    :data-status="resolvedStatus"
  >
    <div class="agentdown-branch-head">
      <div class="agentdown-branch-copy">
        <strong>{{ title }}</strong>
        <p
          v-if="message"
          class="agentdown-branch-message"
        >
          {{ message }}
        </p>
      </div>

      <span class="agentdown-branch-badge">{{ statusLabel }}</span>
    </div>
  </section>
</template>

<style scoped>
.agentdown-branch-block {
  display: inline-flex;
  width: min(100%, 42rem);
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 1.35rem;
  padding: 0.84rem 0.92rem;
  background: rgba(255, 255, 255, 0.96);
}

.agentdown-branch-block[data-status='running'],
.agentdown-branch-block[data-status='merged'] {
  border-color: rgba(124, 178, 156, 0.24);
}

.agentdown-branch-block[data-status='rejected'] {
  border-color: rgba(216, 121, 121, 0.26);
}

.agentdown-branch-head {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.9rem;
}

.agentdown-branch-copy {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.2rem;
}

.agentdown-branch-copy strong {
  color: #2f343b;
  font-size: 0.95rem;
  font-weight: 540;
  letter-spacing: -0.025em;
  line-height: 1.28;
  overflow-wrap: anywhere;
}

.agentdown-branch-message {
  margin: 0;
  color: #7b8490;
  font-size: 0.84rem;
  line-height: 1.58;
}

.agentdown-branch-badge {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 0.24rem 0.56rem;
  background: rgba(226, 232, 240, 0.58);
  color: #64748b;
  font-size: 0.74rem;
  font-weight: 550;
  white-space: nowrap;
}

.agentdown-branch-block[data-status='running'] .agentdown-branch-badge,
.agentdown-branch-block[data-status='merged'] .agentdown-branch-badge {
  background: rgba(111, 199, 174, 0.16);
  color: #537f6b;
}

.agentdown-branch-block[data-status='rejected'] .agentdown-branch-badge {
  background: rgba(234, 157, 149, 0.18);
  color: #9f5f59;
}
</style>
