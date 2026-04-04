<script setup lang="ts">
const props = withDefaults(defineProps<{
  label?: string;
}>(), {
  label: ''
});
</script>

<template>
  <article class="message-loading-bubble">
    <p>{{ label }}</p>

    <div class="message-loading-bubble__dots" aria-hidden="true">
      <span class="message-loading-bubble__dot" />
      <span class="message-loading-bubble__dot" />
      <span class="message-loading-bubble__dot" />
    </div>
  </article>
</template>

<style scoped>
.message-loading-bubble {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: #334155;
}

.message-loading-bubble p {
  margin: 0;
  font-size: 14px;
}

.message-loading-bubble__dots {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.message-loading-bubble__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #94a3b8;
  animation: message-loading-bubble-pulse 1s ease-in-out infinite;
}

.message-loading-bubble__dot:nth-child(2) {
  animation-delay: 0.12s;
}

.message-loading-bubble__dot:nth-child(3) {
  animation-delay: 0.24s;
}

@keyframes message-loading-bubble-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }

  50% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .message-loading-bubble__dot {
    animation: none;
  }
}
</style>
