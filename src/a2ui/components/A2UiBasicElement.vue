<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import type { A2UiElementProps } from '../types';
import { parseA2UiSimpleMarkdown } from '../simpleMarkdown';

const props = defineProps<A2UiElementProps>();

const modalOpen = ref(false);
const activeTab = ref(0);
const choiceFilter = ref('');
const modalTriggerRef = ref<HTMLDivElement | null>(null);
const modalDialogRef = ref<HTMLElement | null>(null);
let modalReturnFocus: HTMLElement | null = null;

const values = computed(() => props.resolvedProps);
const accessibility = computed<Record<string, unknown>>(() => {
  const candidate = values.value.accessibility;
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : {};
});
const ariaLabel = computed(() => String(accessibility.value.label ?? ''));
const ariaDescription = computed(() => String(accessibility.value.description ?? ''));
const validationErrors = computed(() => Array.isArray(values.value.validationErrors)
  ? values.value.validationErrors.map(String)
  : []);
const isInvalid = computed(() => values.value.isValid === false || validationErrors.value.length > 0);
const actionPending = computed(() => (
  props.actionState?.phase === 'delivery'
    ? props.actionState.status === 'sending'
    : props.actionState?.status === 'pending'
));
const actionFailed = computed(() => props.actionState?.status === 'failed');
const actionRetryable = computed(() => props.actionState?.retryable === true);
const actionError = computed(() => props.actionState?.error ?? (
  props.actionState?.phase === 'delivery'
    ? '消息发送失败。'
    : '操作失败。'
));
const actionErrorId = computed(() => `${props.componentId}-action-error`);
const validationErrorId = computed(() => `${props.componentId}-validation-error`);
const actionDisabled = computed(() => (
  isInvalid.value || actionPending.value || props.interactionDisabled === true
));
const weightStyle = computed(() => {
  const weight = Number(values.value.weight);
  return Number.isFinite(weight) && weight > 0 ? { flexGrow: weight } : undefined;
});
const iconName = computed(() => typeof values.value.name === 'string'
  ? values.value.name
  : 'custom');
const iconSvgPath = computed(() => {
  const name = values.value.name;
  if (!name || typeof name !== 'object' || Array.isArray(name)) return '';
  const path = (name as Record<string, unknown>).svgPath;
  return typeof path === 'string' ? path.slice(0, props.securityPolicy.maxStringLength) : '';
});
const textSegments = computed(() => parseA2UiSimpleMarkdown(String(values.value.text ?? '')));
const choiceOptions = computed(() => Array.isArray(values.value.options)
  ? values.value.options as Array<Record<string, unknown>>
  : []);
const filteredChoiceOptions = computed(() => {
  const query = choiceFilter.value.trim().toLocaleLowerCase();

  if (!query) {
    return choiceOptions.value;
  }

  return choiceOptions.value.filter((option) => (
    String(option.label ?? option.value ?? '').toLocaleLowerCase().includes(query)
  ));
});

const iconGlyphs: Readonly<Record<string, string>> = {
  add: '+',
  arrowBack: '←',
  arrowForward: '→',
  check: '✓',
  close: '×',
  delete: '⌫',
  error: '!',
  favorite: '♥',
  favoriteOff: '♡',
  help: '?',
  info: 'i',
  locationOn: '●',
  menu: '☰',
  moreHoriz: '…',
  moreVert: '⋮',
  pause: 'Ⅱ',
  play: '▶',
  search: '⌕',
  send: '➤',
  star: '★',
  starHalf: '☆',
  starOff: '☆',
  stop: '■',
  warning: '⚠'
};

function safeUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }

  try {
    const url = new URL(value, globalThis.location?.href ?? 'https://localhost/');
    return props.securityPolicy.allowedUrlProtocols.has(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function invokeAction() {
  if (actionDisabled.value) {
    return;
  }
  const action = values.value.action;
  if (typeof action === 'function') {
    void action();
  }
}

async function retryFailedAction() {
  if (actionPending.value) {
    return;
  }
  await props.retryAction?.();
}

function updateValue(value: unknown) {
  const setter = values.value.setValue;
  if (typeof setter === 'function') {
    setter(value);
  }
}

function updateTextField(event: Event) {
  updateValue((event.target as HTMLInputElement | HTMLTextAreaElement).value);
}

function updateCheckbox(event: Event) {
  updateValue((event.target as HTMLInputElement).checked);
}

function updateSlider(event: Event) {
  updateValue(Number((event.target as HTMLInputElement).value));
}

function updateChoice(event: Event, option: string) {
  const checked = (event.target as HTMLInputElement).checked;
  if (values.value.variant === 'mutuallyExclusive') {
    updateValue(checked ? [option] : []);
    return;
  }

  const current = Array.isArray(values.value.value) ? values.value.value.map(String) : [];
  updateValue(checked
    ? Array.from(new Set([...current, option]))
    : current.filter((value) => value !== option));
}

function isChoiceSelected(option: string): boolean {
  return Array.isArray(values.value.value) && values.value.value.map(String).includes(option);
}

function justifyClass(value: unknown): string {
  return `a2ui-justify--${String(value ?? 'start')}`;
}

function alignClass(value: unknown): string {
  return `a2ui-align--${String(value ?? 'stretch')}`;
}

function activateTab(event: KeyboardEvent, index: number) {
  const tabs = values.value.tabs as unknown[] | undefined;
  const lastIndex = Math.max(0, (tabs?.length ?? 1) - 1);
  let nextIndex: number | null = null;

  if (event.key === 'ArrowRight') nextIndex = index >= lastIndex ? 0 : index + 1;
  if (event.key === 'ArrowLeft') nextIndex = index <= 0 ? lastIndex : index - 1;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = lastIndex;

  if (nextIndex === null) {
    return;
  }

  event.preventDefault();
  activeTab.value = nextIndex;
  const buttons = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  buttons?.[nextIndex]?.focus();
}

function getModalFocusableElements(): HTMLElement[] {
  if (!modalDialogRef.value) {
    return [];
  }

  return Array.from(modalDialogRef.value.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.hasAttribute('hidden'));
}

function resolveModalReturnFocus(event?: MouseEvent): HTMLElement | null {
  const activeElement = document.activeElement;
  if (
    activeElement instanceof HTMLElement
    && activeElement !== document.body
    && activeElement !== document.documentElement
  ) {
    return activeElement;
  }

  const eventTarget = event?.target;
  if (eventTarget instanceof Element) {
    const focusableTarget = eventTarget.closest<HTMLElement>(
      'button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])'
    );
    if (focusableTarget) {
      return focusableTarget;
    }
  }

  return modalTriggerRef.value?.querySelector<HTMLElement>(
    'button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])'
  ) ?? modalTriggerRef.value;
}

async function openModal(event?: MouseEvent) {
  if (modalOpen.value) {
    return;
  }

  modalReturnFocus = resolveModalReturnFocus(event);
  modalOpen.value = true;
  await nextTick();
  (getModalFocusableElements()[0] ?? modalDialogRef.value)?.focus();
}

async function closeModal() {
  if (!modalOpen.value) {
    return;
  }

  modalOpen.value = false;
  await nextTick();
  modalReturnFocus?.focus();
  modalReturnFocus = null;
}

function handleModalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    void closeModal();
    return;
  }

  if (event.key !== 'Tab') {
    return;
  }

  const focusable = getModalFocusableElements();
  if (focusable.length === 0) {
    event.preventDefault();
    modalDialogRef.value?.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

onBeforeUnmount(() => {
  modalReturnFocus = null;
});
</script>

<template>
  <component
    :is="String(values.variant ?? 'body').startsWith('h') ? String(values.variant) : 'p'"
    v-if="componentType === 'Text'"
    class="agentdown-a2ui-text"
    :class="`agentdown-a2ui-text--${String(values.variant ?? 'body')}`"
    :style="weightStyle"
    :aria-label="ariaLabel || undefined"
  >
    <template v-for="(segment, index) in textSegments" :key="index">
      <code v-if="segment.code">{{ segment.text }}</code>
      <strong v-else-if="segment.strong">{{ segment.text }}</strong>
      <em v-else-if="segment.emphasis">{{ segment.text }}</em>
      <del v-else-if="segment.deleted">{{ segment.text }}</del>
      <template v-else>{{ segment.text }}</template>
    </template>
  </component>

  <figure v-else-if="componentType === 'Image'" class="agentdown-a2ui-media" :style="weightStyle">
    <img
      v-if="safeUrl(values.url)"
      :src="safeUrl(values.url)"
      :alt="ariaLabel || String(values.description ?? '')"
      :style="{ objectFit: String(values.fit ?? 'cover').replace('scaleDown', 'scale-down') as any }"
      loading="lazy"
    >
    <figcaption v-if="values.description">{{ String(values.description) }}</figcaption>
  </figure>

  <span
    v-else-if="componentType === 'Icon'"
    class="agentdown-a2ui-icon"
    role="img"
    :aria-label="ariaLabel || iconName"
    :title="iconName"
  >
    <svg v-if="iconSvgPath" viewBox="0 0 24 24" aria-hidden="true">
      <path :d="iconSvgPath" />
    </svg>
    <span v-else aria-hidden="true">{{ iconGlyphs[iconName] ?? '●' }}</span>
  </span>

  <video
    v-else-if="componentType === 'Video' && safeUrl(values.url)"
    class="agentdown-a2ui-video"
    :src="safeUrl(values.url)"
    :aria-label="ariaLabel || undefined"
    controls
    preload="metadata"
  />

  <figure v-else-if="componentType === 'AudioPlayer'" class="agentdown-a2ui-media">
    <audio v-if="safeUrl(values.url)" :src="safeUrl(values.url)" controls preload="metadata" />
    <figcaption v-if="values.description">{{ String(values.description) }}</figcaption>
  </figure>

  <div
    v-else-if="componentType === 'Row' || componentType === 'Column'"
    class="agentdown-a2ui-layout"
    :class="[
      `agentdown-a2ui-layout--${componentType.toLowerCase()}`,
      justifyClass(values.justify),
      alignClass(values.align)
    ]"
    :style="weightStyle"
    :aria-label="ariaLabel || undefined"
  >
    <slot />
  </div>

  <component
    :is="values.listStyle === 'ordered' ? 'ol' : 'ul'"
    v-else-if="componentType === 'List'"
    class="agentdown-a2ui-list"
    :class="`agentdown-a2ui-list--${String(values.direction ?? 'vertical')}`"
    :aria-label="ariaLabel || undefined"
  >
    <slot />
  </component>

  <section
    v-else-if="componentType === 'Card'"
    class="agentdown-a2ui-card"
    :style="weightStyle"
    :aria-label="ariaLabel || undefined"
  >
    <slot />
  </section>

  <section v-else-if="componentType === 'Tabs'" class="agentdown-a2ui-tabs">
    <div class="agentdown-a2ui-tabs__list" role="tablist">
      <button
        v-for="(tab, index) in (values.tabs as any[] ?? [])"
        :id="`${componentId}-tab-${index}`"
        :key="index"
        type="button"
        role="tab"
        :aria-selected="activeTab === index"
        :aria-controls="`${componentId}-panel-${index}`"
        :tabindex="activeTab === index ? 0 : -1"
        @click="activeTab = index"
        @keydown="activateTab($event, index)"
      >
        {{ String(tab.title ?? `Tab ${index + 1}`) }}
      </button>
    </div>
    <div
      :id="`${componentId}-panel-${activeTab}`"
      role="tabpanel"
      :aria-labelledby="`${componentId}-tab-${activeTab}`"
      class="agentdown-a2ui-tabs__panel"
      tabindex="0"
    >
      <slot :name="`tab-${activeTab}`" />
    </div>
  </section>

  <div v-else-if="componentType === 'Modal'" class="agentdown-a2ui-modal">
    <div ref="modalTriggerRef" class="agentdown-a2ui-modal__trigger" @click="openModal">
      <slot name="trigger" />
    </div>
    <div
      v-if="modalOpen"
      class="agentdown-a2ui-modal__backdrop"
      @click.self="closeModal"
      @keydown="handleModalKeydown"
    >
      <section
        ref="modalDialogRef"
        class="agentdown-a2ui-modal__dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="ariaLabel || 'Dialog'"
        tabindex="-1"
      >
        <button type="button" class="agentdown-a2ui-modal__close" aria-label="Close" @click="closeModal">×</button>
        <slot name="content" />
      </section>
    </div>
  </div>

  <hr
    v-else-if="componentType === 'Divider'"
    class="agentdown-a2ui-divider"
    :class="`agentdown-a2ui-divider--${String(values.axis ?? 'horizontal')}`"
  >

  <template v-else-if="componentType === 'Button'">
    <button
      type="button"
      class="agentdown-a2ui-button"
      :class="`agentdown-a2ui-button--${String(values.variant ?? 'primary')}`"
      :disabled="actionDisabled"
      :aria-busy="actionPending"
      :aria-label="ariaLabel || undefined"
      :aria-describedby="actionFailed ? actionErrorId : ariaDescription ? `${componentId}-description` : undefined"
      @click="invokeAction"
    >
      <span v-if="actionPending" class="agentdown-a2ui-button__pending">处理中…</span>
      <slot v-else />
    </button>
    <div
      v-if="actionFailed"
      :id="actionErrorId"
      class="agentdown-a2ui-action-error"
      role="alert"
    >
      <span>{{ actionError }}</span>
      <button
        v-if="actionRetryable"
        type="button"
        :disabled="interactionDisabled"
        @click="retryFailedAction"
      >重试</button>
    </div>
  </template>

  <label v-else-if="componentType === 'TextField'" class="agentdown-a2ui-field">
    <span v-if="values.label">{{ String(values.label) }}</span>
    <textarea
      v-if="values.variant === 'longText'"
      :value="String(values.value ?? '')"
      :aria-invalid="isInvalid"
      :aria-describedby="isInvalid ? validationErrorId : ariaDescription ? `${componentId}-description` : undefined"
      @input="updateTextField"
    />
    <input
      v-else
      :type="values.variant === 'obscured' ? 'password' : values.variant === 'number' ? 'number' : 'text'"
      :value="String(values.value ?? '')"
      :aria-invalid="isInvalid"
      :aria-describedby="isInvalid ? validationErrorId : ariaDescription ? `${componentId}-description` : undefined"
      @input="updateTextField"
    >
    <small
      v-for="(error, index) in validationErrors"
      :id="index === 0 ? validationErrorId : undefined"
      :key="error"
      class="agentdown-a2ui-field__error"
    >{{ error }}</small>
  </label>

  <label v-else-if="componentType === 'CheckBox'" class="agentdown-a2ui-checkbox">
    <input type="checkbox" :checked="Boolean(values.value)" :aria-invalid="isInvalid" @change="updateCheckbox">
    <span>{{ String(values.label ?? '') }}</span>
  </label>

  <fieldset
    v-else-if="componentType === 'ChoicePicker'"
    class="agentdown-a2ui-choice"
    :class="`agentdown-a2ui-choice--${String(values.displayStyle ?? 'checkbox')}`"
  >
    <legend v-if="values.label">{{ String(values.label) }}</legend>
    <input
      v-if="values.filterable"
      v-model="choiceFilter"
      type="search"
      class="agentdown-a2ui-choice__filter"
      :aria-label="`${String(values.label ?? '选项')}筛选`"
    >
    <div class="agentdown-a2ui-choice__options">
    <label v-for="option in filteredChoiceOptions" :key="String(option.value)">
      <input
        :type="values.variant === 'mutuallyExclusive' ? 'radio' : 'checkbox'"
        :name="values.variant === 'mutuallyExclusive' ? componentId : undefined"
        :checked="isChoiceSelected(String(option.value))"
        @change="updateChoice($event, String(option.value))"
      >
      <span>{{ String(option.label ?? option.value) }}</span>
    </label>
    </div>
  </fieldset>

  <label v-else-if="componentType === 'Slider'" class="agentdown-a2ui-field">
    <span>{{ String(values.label ?? '') }} <output>{{ String(values.value ?? '') }}</output></span>
    <input
      type="range"
      :min="Number(values.min ?? 0)"
      :max="Number(values.max ?? 100)"
      :value="Number(values.value ?? 0)"
      :aria-label="String(values.label ?? 'Slider')"
      :aria-invalid="isInvalid"
      @input="updateSlider"
    >
  </label>

  <label v-else-if="componentType === 'DateTimeInput'" class="agentdown-a2ui-field">
    <span v-if="values.label">{{ String(values.label) }}</span>
    <input
      :type="values.enableDate && values.enableTime ? 'datetime-local' : values.enableTime ? 'time' : 'date'"
      :value="String(values.value ?? '')"
      :min="values.min ? String(values.min) : undefined"
      :max="values.max ? String(values.max) : undefined"
      :aria-invalid="isInvalid"
      @input="updateTextField"
    >
  </label>

  <div v-else class="agentdown-a2ui-unsupported" role="alert">
    Unsupported A2UI component: {{ componentType }}
  </div>
</template>

<style scoped>
.agentdown-a2ui-text { margin: 0; color: var(--agentdown-text, #172033); }
.agentdown-a2ui-text--caption { color: var(--agentdown-muted, #667085); font-size: 0.78rem; }
.agentdown-a2ui-text--h1, .agentdown-a2ui-text--h2, .agentdown-a2ui-text--h3,
.agentdown-a2ui-text--h4, .agentdown-a2ui-text--h5 { line-height: 1.2; }
.agentdown-a2ui-media { display: grid; gap: 0.45rem; margin: 0; }
.agentdown-a2ui-media img, .agentdown-a2ui-video { width: 100%; max-height: 24rem; border-radius: 0.75rem; }
.agentdown-a2ui-media audio { width: 100%; }
.agentdown-a2ui-icon { display: inline-flex; width: 1.2em; height: 1.2em; align-items: center; justify-content: center; }
.agentdown-a2ui-icon svg { width: 100%; height: 100%; fill: currentColor; }
.agentdown-a2ui-layout { display: flex; gap: 0.8rem; min-width: 0; }
.agentdown-a2ui-layout--row { flex-direction: row; flex-wrap: wrap; }
.agentdown-a2ui-layout--column { flex-direction: column; }
.a2ui-justify--center { justify-content: center; }
.a2ui-justify--end { justify-content: flex-end; }
.a2ui-justify--spaceBetween { justify-content: space-between; }
.a2ui-justify--spaceAround { justify-content: space-around; }
.a2ui-justify--spaceEvenly { justify-content: space-evenly; }
.a2ui-align--start { align-items: flex-start; }
.a2ui-align--center { align-items: center; }
.a2ui-align--end { align-items: flex-end; }
.a2ui-align--stretch { align-items: stretch; }
.agentdown-a2ui-list { display: flex; flex-direction: column; gap: 0.55rem; margin: 0; padding-inline-start: 1.25rem; }
.agentdown-a2ui-list--horizontal { flex-direction: row; flex-wrap: wrap; }
.agentdown-a2ui-card { display: block; padding: 1rem; border: 1px solid color-mix(in srgb, var(--agentdown-border, #d8dee9) 82%, transparent); border-radius: 0.9rem; background: var(--agentdown-surface, #fff); box-shadow: 0 10px 30px rgb(15 23 42 / 6%); }
.agentdown-a2ui-tabs { display: grid; gap: 0.75rem; }
.agentdown-a2ui-tabs__list { display: flex; gap: 0.35rem; border-bottom: 1px solid var(--agentdown-border, #d8dee9); }
.agentdown-a2ui-tabs__list button { padding: 0.55rem 0.75rem; border: 0; border-bottom: 2px solid transparent; background: transparent; color: inherit; cursor: pointer; }
.agentdown-a2ui-tabs__list button[aria-selected='true'] { border-bottom-color: var(--agentdown-accent, #4f46e5); color: var(--agentdown-accent, #4f46e5); }
.agentdown-a2ui-modal__trigger { display: inline-flex; }
.agentdown-a2ui-modal__backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 1rem; background: rgb(15 23 42 / 54%); }
.agentdown-a2ui-modal__dialog { position: relative; width: min(36rem, 100%); max-height: 85vh; overflow: auto; padding: 1.25rem; border-radius: 1rem; background: #fff; color: #172033; }
.agentdown-a2ui-modal__close { position: absolute; top: 0.55rem; right: 0.65rem; border: 0; background: transparent; font-size: 1.5rem; cursor: pointer; }
.agentdown-a2ui-divider--vertical { width: 1px; min-height: 2rem; border: 0; background: var(--agentdown-border, #d8dee9); }
.agentdown-a2ui-button { min-height: 2.35rem; padding: 0.55rem 0.9rem; border: 1px solid transparent; border-radius: 0.7rem; font: inherit; cursor: pointer; }
.agentdown-a2ui-button--primary { background: var(--agentdown-accent, #4f46e5); color: white; }
.agentdown-a2ui-button :deep(.agentdown-a2ui-text) { color: inherit; }
.agentdown-a2ui-button--default { border-color: var(--agentdown-border, #d8dee9); background: var(--agentdown-surface, #fff); color: inherit; }
.agentdown-a2ui-button--borderless { padding-inline: 0.2rem; border-color: transparent; background: transparent; color: var(--agentdown-accent, #4f46e5); }
.agentdown-a2ui-button:disabled { cursor: not-allowed; opacity: 0.5; }
.agentdown-a2ui-button__pending { display: inline-flex; align-items: center; gap: 0.45rem; }
.agentdown-a2ui-button__pending::before {
  width: 0.8rem;
  height: 0.8rem;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 999px;
  content: '';
  animation: agentdown-a2ui-spin 0.75s linear infinite;
}
.agentdown-a2ui-action-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.45rem;
  color: var(--agentdown-danger, #b42318);
  font-size: 0.82rem;
}
.agentdown-a2ui-action-error button {
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
}
@keyframes agentdown-a2ui-spin { to { transform: rotate(360deg); } }
.agentdown-a2ui-field { display: grid; gap: 0.38rem; color: var(--agentdown-text, #172033); }
.agentdown-a2ui-field input, .agentdown-a2ui-field textarea { width: 100%; box-sizing: border-box; padding: 0.58rem 0.7rem; border: 1px solid var(--agentdown-border, #cbd5e1); border-radius: 0.6rem; background: var(--agentdown-surface, #fff); color: inherit; font: inherit; }
.agentdown-a2ui-field textarea { min-height: 6rem; resize: vertical; }
.agentdown-a2ui-field__error { color: #b42318; }
.agentdown-a2ui-checkbox, .agentdown-a2ui-choice label { display: flex; align-items: center; gap: 0.5rem; }
.agentdown-a2ui-choice { display: grid; gap: 0.45rem; margin: 0; padding: 0; border: 0; }
.agentdown-a2ui-choice__filter { width: 100%; box-sizing: border-box; padding: 0.5rem 0.65rem; border: 1px solid var(--agentdown-border, #cbd5e1); border-radius: 0.6rem; font: inherit; }
.agentdown-a2ui-choice__options { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.agentdown-a2ui-choice--checkbox .agentdown-a2ui-choice__options { flex-direction: column; align-items: flex-start; }
.agentdown-a2ui-choice--chips label { position: relative; padding: 0.42rem 0.68rem; border: 1px solid var(--agentdown-border, #cbd5e1); border-radius: 999px; cursor: pointer; }
.agentdown-a2ui-choice--chips label:has(input:checked) { border-color: var(--agentdown-accent, #4f46e5); background: color-mix(in srgb, var(--agentdown-accent, #4f46e5) 12%, transparent); color: var(--agentdown-accent, #4f46e5); }
.agentdown-a2ui-choice--chips label input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.agentdown-a2ui-unsupported { padding: 0.75rem; border: 1px solid #fda29b; border-radius: 0.6rem; color: #b42318; background: #fff1f0; }
</style>
