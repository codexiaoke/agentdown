<script setup lang="ts">
const props = withDefaults(defineProps<{
  label?: string;
}>(), {
  label: '正在思考'
});
</script>

<template>
  <div class="demo-thinking-bubble">
    <span class="demo-thinking-bubble__label">{{ label }}</span>

    <span
      class="demo-thinking-bubble__dots"
      aria-hidden="true"
    >
      <i />
      <i />
      <i />
    </span>
  </div>
</template>

<style scoped>
.demo-thinking-bubble {
  display: inline-flex;
  align-items: center;
  gap: 0.64rem;
  border-radius: 999px;
  padding: 0.46rem 0.78rem;
  background: #f4f4f5;
  box-shadow: inset 0 0 0 1px #ececf1;
}

.demo-thinking-bubble__label {
  position: relative;
  color: #6b7280;
  font-size: 0.8rem;
  font-weight: 520;
  letter-spacing: -0.015em;
}

.demo-thinking-bubble__label::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, transparent 16%, rgba(255, 255, 255, 0.8) 48%, transparent 80%);
  transform: translateX(-135%);
  animation: demo-thinking-shimmer 2.6s ease-in-out infinite;
  pointer-events: none;
}

.demo-thinking-bubble__dots {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.demo-thinking-bubble__dots i {
  display: block;
  width: 0.3rem;
  height: 0.3rem;
  border-radius: 999px;
  background: #9ca3af;
  animation: demo-thinking-bounce 1.2s ease-in-out infinite;
}

.demo-thinking-bubble__dots i:nth-child(2) {
  animation-delay: 0.12s;
}

.demo-thinking-bubble__dots i:nth-child(3) {
  animation-delay: 0.24s;
}

@keyframes demo-thinking-bounce {
  0%,
  100% {
    opacity: 0.32;
    transform: translateY(0);
  }

  45% {
    opacity: 1;
    transform: translateY(-0.12rem);
  }
}

@keyframes demo-thinking-shimmer {
  0% {
    transform: translateX(-135%);
  }

  55% {
    transform: translateX(55%);
  }

  100% {
    transform: translateX(135%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .demo-thinking-bubble__label::after,
  .demo-thinking-bubble__dots i {
    animation: none;
  }
}
</style>
