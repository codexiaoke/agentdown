<script setup lang="ts">
withDefaults(defineProps<{
  label?: string;
}>(), {
  label: '正在思考'
});
</script>

<template>
  <span
    class="agentdown-chat-loading-dots"
    role="status"
    :aria-label="label"
  >
    <i aria-hidden="true" />
    <i aria-hidden="true" />
    <i aria-hidden="true" />
  </span>
</template>

<style scoped>
.agentdown-chat-loading-dots {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 1.4rem;
  color: #9ca3af;
}

.agentdown-chat-loading-dots i {
  display: block;
  width: 0.56rem;
  height: 0.56rem;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.28;
  animation: agentdown-chat-loading-dots-bounce 1.15s ease-in-out infinite;
}

.agentdown-chat-loading-dots i:nth-child(2) {
  animation-delay: 0.12s;
}

.agentdown-chat-loading-dots i:nth-child(3) {
  animation-delay: 0.24s;
}

@keyframes agentdown-chat-loading-dots-bounce {
  0%,
  100% {
    opacity: 0.28;
    transform: translateY(0);
  }

  45% {
    opacity: 1;
    transform: translateY(-0.18rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .agentdown-chat-loading-dots i {
    animation: none;
    opacity: 0.65;
  }
}
</style>
