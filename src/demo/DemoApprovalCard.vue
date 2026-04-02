<script setup lang="ts">
defineProps<{
  id: number;
  status: string;
}>();
</script>

<template>
  <div class="demo-approval-card">
    <div>
      <strong>Approval #{{ id }}</strong>
      <p>Status: {{ status }}</p>
    </div>

    <div class="demo-approval-actions">
      <button type="button">Approve</button>
      <button type="button">Reject</button>
    </div>
  </div>
</template>

<style scoped>
.demo-approval-card {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  padding: 1rem;
  border-radius: 16px;
  background: #ffffff;
  border: 1px solid #cfe0dc;
}

.demo-approval-card p {
  margin: 0.35rem 0 0;
}

.demo-approval-actions {
  display: flex;
  gap: 0.65rem;
}

.demo-approval-actions button {
  border: 0;
  border-radius: 999px;
  padding: 0.65rem 0.9rem;
  background: #124c5a;
  color: white;
  cursor: pointer;
}
</style>
