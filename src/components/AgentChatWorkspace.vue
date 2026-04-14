<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useSlots, watch } from 'vue';
import type { AgentRuntime } from '../runtime/types';
import type { RunSurfaceOptions } from '../surface/types';
import AgentChatLoadingDots from './AgentChatLoadingDots.vue';
import AgentChatComposer from './AgentChatComposer.vue';
import AgentChatFloatingPanel from './AgentChatFloatingPanel.vue';
import RunSurface from './RunSurface.vue';
import type { AgentChatWorkspaceExposed } from './agentChatWorkspace.types';
import { hasAgentChatAppendedConversationContent } from './agentChat';
import {
  resolveChatScrollFollowState
} from './chatScrollBehavior';
import type {
  AgentChatComposerSendPayload,
  AgentChatPendingAttachment,
  AgentChatUploadResolver
} from './agentChat';

interface Props {
  runtime: AgentRuntime;
  surface?: RunSurfaceOptions;
  modelValue?: string;
  uploads?: AgentChatPendingAttachment[];
  busy?: boolean;
  awaitingHumanInput?: boolean;
  disabled?: boolean;
  transportError?: string;
  placeholder?: string;
  disclaimer?: string | false;
  emptyTitle?: string;
  emptyDescription?: string;
  suggestions?: string[];
  panelOpen?: boolean;
  panelTitle?: string;
  panelWidth?: number | string;
  showPanelToggle?: boolean;
  reservePanelSpace?: boolean;
  uploadFile?: AgentChatUploadResolver | undefined;
  uploadContext?: unknown | undefined;
  accept?: string;
  multiple?: boolean;
  autoScroll?: boolean;
  initialScrollToBottom?: boolean;
  initialScrollReveal?: 'immediate' | 'after-sync';
  initialScrollSyncDelays?: number[];
  showScrollToBottomButton?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  surface: () => ({}),
  modelValue: '',
  uploads: () => [],
  busy: false,
  awaitingHumanInput: false,
  disabled: false,
  transportError: '',
  placeholder: '',
  disclaimer: 'AI 可能会出错，请核实重要信息。',
  emptyTitle: '开始一段新的对话',
  emptyDescription: '',
  suggestions: () => [],
  panelOpen: false,
  panelTitle: '',
  panelWidth: 320,
  showPanelToggle: false,
  reservePanelSpace: true,
  accept: '',
  multiple: true,
  autoScroll: true,
  initialScrollToBottom: true,
  initialScrollReveal: 'after-sync',
  initialScrollSyncDelays: () => [80, 180, 360],
  showScrollToBottomButton: true
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:uploads': [value: AgentChatPendingAttachment[]];
  'update:panelOpen': [value: boolean];
  send: [payload: AgentChatComposerSendPayload];
  'suggestion-click': [value: string];
  'upload-resolved': [attachment: AgentChatPendingAttachment];
  'upload-remove': [attachment: AgentChatPendingAttachment];
  'upload-error': [error: unknown];
}>();

const slots = useSlots();
const scrollRef = ref<HTMLElement | null>(null);
const runtimeVersion = ref(0);
const followBottom = ref(true);
const showScrollToBottom = ref(false);
const scrollToBottomHasUnread = ref(false);
const defaultConversationTailVisible = ref(false);
const conversationTailBaselineBlockIds = ref<string[]>([]);
const previousScrollTop = ref(0);
const initialScrollPending = ref(false);
const initialScrollReady = ref(false);

let scrollToBottomFrame: number | null = null;
let initialBottomSyncTimeouts: number[] = [];

let unsubscribe: (() => void) | null = null;

const slotName = computed(() => {
  return props.surface.slot ?? 'main';
});

const panelVisible = computed(() => {
  if (slots.panel) {
    return true;
  }

  if (slots['panel-header']) {
    return true;
  }

  if (slots['panel-footer']) {
    return true;
  }

  return props.panelTitle.trim().length > 0;
});

const panelOpenProxy = computed({
  get: () => props.panelOpen,
  set: (value: boolean) => {
    emit('update:panelOpen', value);
  }
});

const hasConversation = computed(() => {
  runtimeVersion.value;

  return props.runtime.snapshot().blocks.some((block) => block.slot === slotName.value);
});

const reservedPanelWidth = computed(() => {
  if (!panelVisible.value) {
    return '0px';
  }

  if (!panelOpenProxy.value) {
    return '0px';
  }

  if (!props.reservePanelSpace) {
    return '0px';
  }

  if (typeof props.panelWidth === 'number') {
    return `calc(${props.panelWidth}px + 1.5rem)`;
  }

  return `calc(${props.panelWidth} + 1.5rem)`;
});

const workspaceStyle = computed(() => ({
  '--agentdown-chat-panel-space': reservedPanelWidth.value
}));

function resetConversationTail() {
  defaultConversationTailVisible.value = false;
  conversationTailBaselineBlockIds.value = [];
}

function syncDefaultConversationTail() {
  if (
    !props.busy
    || props.awaitingHumanInput
    || props.transportError.trim().length > 0
    || !hasConversation.value
  ) {
    resetConversationTail();
    return;
  }

  if (conversationTailBaselineBlockIds.value.length === 0) {
    conversationTailBaselineBlockIds.value = props.runtime.snapshot().blocks.map((block) => block.id);
    defaultConversationTailVisible.value = true;
  }

  const blocks = props.runtime.snapshot().blocks;
  const hasNewConversationContent = hasAgentChatAppendedConversationContent(
    blocks,
    conversationTailBaselineBlockIds.value,
    {
      slot: slotName.value
    }
  );

  defaultConversationTailVisible.value = !hasNewConversationContent;
}

function bindRuntime(runtime: AgentRuntime) {
  unsubscribe?.();
  runtimeVersion.value += 1;
  unsubscribe = runtime.subscribe(() => {
    runtimeVersion.value += 1;
    syncDefaultConversationTail();

    if (!props.autoScroll) {
      if (!followBottom.value) {
        showScrollToBottom.value = true;
        scrollToBottomHasUnread.value = true;
      }
      return;
    }

    if (!followBottom.value) {
      showScrollToBottom.value = true;
      scrollToBottomHasUnread.value = true;
      return;
    }

    scheduleScrollToBottom();
  });
}

function scrollToBottom(behavior: ScrollBehavior = 'auto') {
  const element = scrollRef.value;

  if (!element) {
    return;
  }

  followBottom.value = true;
  showScrollToBottom.value = false;
  scrollToBottomHasUnread.value = false;

  element.scrollTo({
    top: element.scrollHeight,
    behavior
  });

  previousScrollTop.value = element.scrollTop;
}

function scheduleScrollToBottom(behavior: ScrollBehavior = 'auto') {
  if (scrollToBottomFrame !== null) {
    cancelAnimationFrame(scrollToBottomFrame);
  }

  scrollToBottomFrame = requestAnimationFrame(() => {
    scrollToBottomFrame = null;
    scrollToBottom(behavior);
  });
}

function clearInitialBottomSyncTimers() {
  for (const timeoutId of initialBottomSyncTimeouts) {
    window.clearTimeout(timeoutId);
  }

  initialBottomSyncTimeouts = [];
}

function finishInitialBottomSync() {
  initialScrollPending.value = false;
  initialScrollReady.value = true;
}

function scheduleInitialBottomSync() {
  clearInitialBottomSyncTimers();

  if (!props.autoScroll || !props.initialScrollToBottom) {
    finishInitialBottomSync();
    return;
  }

  initialScrollPending.value = props.initialScrollReveal === 'after-sync';

  const sync = () => {
    if (!followBottom.value) {
      return;
    }

    scheduleScrollToBottom();
  };

  nextTick(() => {
    sync();

    for (const delay of props.initialScrollSyncDelays) {
      const timeoutId = window.setTimeout(() => {
        initialBottomSyncTimeouts = initialBottomSyncTimeouts.filter((value) => value !== timeoutId);
        sync();

        if (initialBottomSyncTimeouts.length === 0) {
          finishInitialBottomSync();
        }
      }, delay);

      initialBottomSyncTimeouts.push(timeoutId);
    }

    if (props.initialScrollSyncDelays.length === 0) {
      finishInitialBottomSync();
    }
  });
}

function updateScrollState() {
  const element = scrollRef.value;

  if (!element) {
    followBottom.value = true;
    showScrollToBottom.value = false;
    scrollToBottomHasUnread.value = false;
    return;
  }

  const nextScrollTop = element.scrollTop;
  const nextFollow = resolveChatScrollFollowState({
    previousScrollTop: previousScrollTop.value,
    scrollTop: nextScrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    currentFollow: followBottom.value
  });

  previousScrollTop.value = nextScrollTop;
  followBottom.value = nextFollow;
  showScrollToBottom.value = !nextFollow;

  if (nextFollow) {
    scrollToBottomHasUnread.value = false;
  }
}

function handleScroll() {
  updateScrollState();
}

function handleScrollToBottomClick() {
  scheduleScrollToBottom('smooth');
}

function handleSend(payload: AgentChatComposerSendPayload) {
  emit('send', payload);

  nextTick(() => {
    scheduleScrollToBottom('smooth');
  });
}

function handleSuggestionClick(suggestion: string) {
  emit('update:modelValue', suggestion);
  emit('suggestion-click', suggestion);

  nextTick(() => {
    scheduleScrollToBottom('smooth');
  });
}

watch(
  () => props.runtime,
  (runtime) => {
    resetConversationTail();
    bindRuntime(runtime);
    syncDefaultConversationTail();
  },
  {
    immediate: true
  }
);

watch(
  hasConversation,
  (value) => {
    if (!value) {
      return;
    }

    if (!initialScrollReady.value) {
      scheduleInitialBottomSync();
      return;
    }

    nextTick(() => {
      scheduleScrollToBottom();
    });
  }
);

watch(
  () => props.busy,
  (value, previousValue) => {
    if (!value) {
      resetConversationTail();
      return;
    }

    if (!previousValue) {
      conversationTailBaselineBlockIds.value = props.runtime.snapshot().blocks.map((block) => block.id);
      defaultConversationTailVisible.value = true;
    }

    syncDefaultConversationTail();

    if (!value || previousValue || !hasConversation.value) {
      return;
    }

    nextTick(() => {
      scheduleScrollToBottom('smooth');
    });
  }
);

watch(
  [hasConversation, () => props.awaitingHumanInput, () => props.transportError, slotName],
  () => {
    syncDefaultConversationTail();
  }
);

onMounted(() => {
  nextTick(() => {
    updateScrollState();

    if (hasConversation.value) {
      scheduleInitialBottomSync();
      return;
    }

    initialScrollReady.value = true;
  });
});

onBeforeUnmount(() => {
  if (scrollToBottomFrame !== null) {
    cancelAnimationFrame(scrollToBottomFrame);
    scrollToBottomFrame = null;
  }

  clearInitialBottomSyncTimers();

  unsubscribe?.();
  unsubscribe = null;
});

defineExpose<AgentChatWorkspaceExposed>({
  scrollToBottom,
  scheduleScrollToBottom,
  scheduleInitialBottomSync,
  followBottom,
  showScrollToBottom,
  scrollToBottomHasUnread
});
</script>

<template>
  <section
    class="agentdown-chat-workspace"
    :style="workspaceStyle"
  >
    <div class="agentdown-chat-workspace__main">
      <header
        v-if="$slots.header"
        class="agentdown-chat-workspace__header"
      >
        <slot name="header" />
      </header>

      <div
        ref="scrollRef"
        class="agentdown-chat-workspace__scroll"
        :data-initial-scroll-pending="initialScrollPending"
        @scroll="handleScroll"
      >
        <slot
          name="notice"
          :transport-error="transportError"
          :awaiting-human-input="awaitingHumanInput"
          :busy="busy"
        >
          <div
            v-if="transportError.trim().length > 0"
            class="agentdown-chat-workspace__notice agentdown-chat-workspace__notice--error"
          >
            {{ transportError }}
          </div>

          <div
            v-else-if="awaitingHumanInput"
            class="agentdown-chat-workspace__notice agentdown-chat-workspace__notice--waiting"
          >
            等待人工确认
          </div>
        </slot>

        <div
          v-if="!hasConversation"
          class="agentdown-chat-workspace__empty"
        >
          <slot name="empty">
            <div class="agentdown-chat-workspace__empty-copy">
              <h2>{{ emptyTitle }}</h2>
              <p v-if="emptyDescription.trim().length > 0">
                {{ emptyDescription }}
              </p>
            </div>

            <div
              v-if="suggestions.length > 0"
              class="agentdown-chat-workspace__suggestions"
            >
              <button
                v-for="suggestion in suggestions"
                :key="suggestion"
                type="button"
                class="agentdown-chat-workspace__suggestion"
                @click="handleSuggestionClick(suggestion)"
              >
                {{ suggestion }}
              </button>
            </div>
          </slot>
        </div>

        <div
          v-else
          class="agentdown-chat-workspace__surface"
        >
          <RunSurface
            :runtime="runtime"
            v-bind="surface"
          />

          <div
            v-if="$slots['conversation-tail'] || defaultConversationTailVisible"
            class="agentdown-chat-workspace__conversation-tail"
          >
            <slot
              name="conversation-tail"
              :busy="busy"
              :awaiting-human-input="awaitingHumanInput"
              :visible="defaultConversationTailVisible"
            />

            <div
              v-if="!$slots['conversation-tail'] && defaultConversationTailVisible"
              class="agentdown-chat-workspace__conversation-tail-default"
            >
              <AgentChatLoadingDots />
            </div>
          </div>
        </div>
      </div>

      <div class="agentdown-chat-workspace__composer">
        <slot
          name="scroll-to-bottom"
          :visible="showScrollToBottom && hasConversation && showScrollToBottomButton"
          :unread="scrollToBottomHasUnread"
          :follow-bottom="followBottom"
          :scroll-to-bottom="handleScrollToBottomClick"
        >
          <Transition name="agentdown-chat-scroll-to-bottom">
            <button
              v-if="showScrollToBottomButton && showScrollToBottom && hasConversation"
              type="button"
              class="agentdown-chat-workspace__scroll-to-bottom"
              :data-unread="scrollToBottomHasUnread"
              @click="handleScrollToBottomClick"
            >
              <span
                v-if="scrollToBottomHasUnread"
                class="agentdown-chat-workspace__scroll-to-bottom-dot"
              />

              <svg
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M5.5 7.75 10 12.25l4.5-4.5"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </Transition>
        </slot>

        <slot
          name="composer"
          :model-value="modelValue"
          :uploads="uploads"
        >
          <AgentChatComposer
            :model-value="modelValue"
            :uploads="uploads"
            :busy="busy"
            :awaiting-human-input="awaitingHumanInput"
            :disabled="disabled"
            :placeholder="placeholder"
            :disclaimer="disclaimer"
            :accept="accept"
            :multiple="multiple"
            :upload-file="uploadFile"
            :upload-context="uploadContext"
            @update:model-value="emit('update:modelValue', $event)"
            @update:uploads="emit('update:uploads', $event)"
            @send="handleSend"
            @upload-resolved="emit('upload-resolved', $event)"
            @upload-remove="emit('upload-remove', $event)"
            @upload-error="emit('upload-error', $event)"
          >
            <template
              v-if="$slots['upload-trigger-icon']"
              #upload-trigger-icon
            >
              <slot name="upload-trigger-icon" />
            </template>

            <template
              v-if="$slots.attachment"
              #attachment="slotProps"
            >
              <slot
                name="attachment"
                v-bind="slotProps"
              />
            </template>

            <template
              v-if="$slots['send-icon']"
              #send-icon
            >
              <slot name="send-icon" />
            </template>

            <template
              v-if="$slots.disclaimer"
              #disclaimer
            >
              <slot name="disclaimer" />
            </template>
          </AgentChatComposer>
        </slot>
      </div>
    </div>

    <AgentChatFloatingPanel
      v-if="panelVisible"
      v-model:open="panelOpenProxy"
      :title="panelTitle"
      :width="panelWidth"
      :show-toggle="showPanelToggle"
    >
      <template
        v-if="$slots['panel-header']"
        #header="slotProps"
      >
        <slot
          name="panel-header"
          v-bind="slotProps"
        />
      </template>

      <slot name="panel" />

      <template
        v-if="$slots['panel-footer']"
        #footer
      >
        <slot name="panel-footer" />
      </template>
    </AgentChatFloatingPanel>
  </section>
</template>

<style scoped>
.agentdown-chat-workspace {
  position: relative;
  display: flex;
  height: 100%;
  min-height: 0;
  min-width: 0;
  flex-direction: column;
  background:
    radial-gradient(circle at top, rgba(243, 244, 246, 0.72), transparent 48%),
    linear-gradient(180deg, #ffffff 0%, #fbfbfc 100%);
}

.agentdown-chat-workspace__main {
  display: flex;
  min-height: 0;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  padding-right: var(--agentdown-chat-panel-space);
  transition: padding-right 180ms ease;
}

.agentdown-chat-workspace__header {
  flex-shrink: 0;
  padding: 1.1rem 1.4rem 0;
}

.agentdown-chat-workspace__scroll {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 1.15rem 1.4rem 1.4rem;
  box-sizing: border-box;
}

.agentdown-chat-workspace__scroll[data-initial-scroll-pending='true'] {
  visibility: hidden;
}

.agentdown-chat-workspace__notice {
  width: min(100%, 720px);
  margin: 0 auto 1rem;
  border-radius: 16px;
  padding: 0.8rem 0.95rem;
  font-size: 0.9rem;
  line-height: 1.55;
}

.agentdown-chat-workspace__notice--error {
  background: #fef2f2;
  color: #b91c1c;
}

.agentdown-chat-workspace__notice--waiting {
  background: #f5f7fb;
  color: #475569;
}

.agentdown-chat-workspace__empty {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.4rem;
  padding: 2rem 0 3rem;
  box-sizing: border-box;
}

.agentdown-chat-workspace__empty-copy {
  display: flex;
  max-width: 720px;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
  text-align: center;
}

.agentdown-chat-workspace__empty-copy h2,
.agentdown-chat-workspace__empty-copy p {
  margin: 0;
}

.agentdown-chat-workspace__empty-copy h2 {
  color: #111827;
  font-size: clamp(2rem, 4vw, 2.9rem);
  font-weight: 700;
  letter-spacing: -0.05em;
}

.agentdown-chat-workspace__empty-copy p {
  color: #6b7280;
  font-size: 0.96rem;
  line-height: 1.6;
}

.agentdown-chat-workspace__suggestions {
  display: grid;
  width: min(100%, 760px);
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
}

.agentdown-chat-workspace__suggestion {
  display: flex;
  min-height: 4.35rem;
  align-items: center;
  justify-content: flex-start;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 20px;
  padding: 0.95rem 1rem;
  background: rgba(255, 255, 255, 0.9);
  color: #1f2937;
  font: inherit;
  font-size: 0.92rem;
  line-height: 1.55;
  text-align: left;
  cursor: pointer;
  transition: border-color 160ms ease, transform 160ms ease, background 160ms ease;
}

.agentdown-chat-workspace__suggestion:hover {
  border-color: rgba(15, 23, 42, 0.16);
  background: #ffffff;
  transform: translateY(-1px);
}

.agentdown-chat-workspace__conversation-tail {
  padding-top: 0.8rem;
}

.agentdown-chat-workspace__conversation-tail-default {
  display: flex;
  width: fit-content;
}

.agentdown-chat-workspace__surface {
  width: min(100%, 860px);
  margin: 0 auto;
}

.agentdown-chat-workspace__composer {
  position: relative;
  flex-shrink: 0;
  padding: 0.25rem 1.4rem 1.2rem;
}

.agentdown-chat-workspace__scroll-to-bottom {
  position: absolute;
  left: 50%;
  top: 0;
  z-index: 2;
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 999px;
  padding: 0;
  background: rgba(255, 255, 255, 0.96);
  color: #475569;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  cursor: pointer;
  transform: translate(-50%, -115%);
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.agentdown-chat-workspace__scroll-to-bottom:hover {
  border-color: rgba(15, 23, 42, 0.14);
  background: #ffffff;
  color: #111827;
}

.agentdown-chat-workspace__scroll-to-bottom-dot {
  position: absolute;
  right: 0.38rem;
  top: 0.38rem;
  width: 0.42rem;
  height: 0.42rem;
  border-radius: 999px;
  background: #2563eb;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.98);
}

.agentdown-chat-workspace__scroll-to-bottom svg {
  width: 1rem;
  height: 1rem;
}

.agentdown-chat-scroll-to-bottom-enter-active,
.agentdown-chat-scroll-to-bottom-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.agentdown-chat-scroll-to-bottom-enter-from,
.agentdown-chat-scroll-to-bottom-leave-to {
  opacity: 0;
  transform: translateY(0.4rem);
}

.agentdown-chat-workspace__composer :deep(.agentdown-chat-composer) {
  width: min(100%, 860px);
  margin: 0 auto;
}

@media (max-width: 960px) {
  .agentdown-chat-workspace__main {
    padding-right: 0;
  }
}

@media (max-width: 720px) {
  .agentdown-chat-workspace__header {
    padding: 0.9rem 1rem 0;
  }

  .agentdown-chat-workspace__scroll {
    padding: 0.9rem 1rem 1rem;
  }

  .agentdown-chat-workspace__composer {
    padding: 0.15rem 1rem 1rem;
  }

  .agentdown-chat-workspace__suggestions {
    grid-template-columns: 1fr;
  }

  .agentdown-chat-workspace__empty-copy h2 {
    font-size: 1.85rem;
  }
}
</style>
