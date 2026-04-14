<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  open?: boolean;
  title?: string;
  width?: number | string;
  showToggle?: boolean;
  dockLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  open: false,
  title: '',
  width: 320,
  showToggle: false,
  dockLabel: '展开面板'
});

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const resolvedWidth = computed(() => {
  if (typeof props.width === 'number') {
    return `${props.width}px`;
  }

  return props.width;
});

function openPanel() {
  emit('update:open', true);
}

function closePanel() {
  emit('update:open', false);
}
</script>

<template>
  <div class="agentdown-chat-floating-panel-host">
    <button
      v-if="!open && showToggle"
      type="button"
      class="agentdown-chat-floating-panel__dock"
      @click="openPanel"
    >
      {{ dockLabel }}
    </button>

    <aside
      v-else-if="open"
      class="agentdown-chat-floating-panel"
      :style="{ '--agentdown-chat-floating-panel-width': resolvedWidth }"
    >
      <header class="agentdown-chat-floating-panel__header">
        <slot
          name="header"
          :close="closePanel"
        >
          <strong
            v-if="title"
            class="agentdown-chat-floating-panel__title"
          >
            {{ title }}
          </strong>
        </slot>

        <button
          v-if="showToggle"
          type="button"
          class="agentdown-chat-floating-panel__close"
          title="收起面板"
          @click="closePanel"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.85"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12" />
            <path d="M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div class="agentdown-chat-floating-panel__body">
        <slot />
      </div>

      <footer
        v-if="$slots.footer"
        class="agentdown-chat-floating-panel__footer"
      >
        <slot name="footer" />
      </footer>
    </aside>
  </div>
</template>

<style scoped>
.agentdown-chat-floating-panel-host {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 4;
  pointer-events: none;
}

.agentdown-chat-floating-panel__dock,
.agentdown-chat-floating-panel {
  pointer-events: auto;
}

.agentdown-chat-floating-panel__dock {
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 999px;
  padding: 0.62rem 0.95rem;
  background: rgba(255, 255, 255, 0.94);
  color: #111827;
  font: inherit;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(18px);
}

.agentdown-chat-floating-panel {
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  bottom: 1.25rem;
  display: flex;
  width: var(--agentdown-chat-floating-panel-width);
  min-width: 0;
  flex-direction: column;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(22px);
  box-sizing: border-box;
  overflow: hidden;
}

.agentdown-chat-floating-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1rem 0.85rem;
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
}

.agentdown-chat-floating-panel__title {
  color: #111827;
  font-size: 0.94rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.agentdown-chat-floating-panel__close {
  display: inline-flex;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
}

.agentdown-chat-floating-panel__close:hover {
  background: rgba(15, 23, 42, 0.05);
  color: #111827;
}

.agentdown-chat-floating-panel__close svg {
  width: 0.95rem;
  height: 0.95rem;
}

.agentdown-chat-floating-panel__body {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow-y: auto;
}

.agentdown-chat-floating-panel__footer {
  padding: 0.85rem 1rem 1rem;
  border-top: 1px solid rgba(15, 23, 42, 0.06);
}
</style>
