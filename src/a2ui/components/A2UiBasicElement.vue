<script setup lang="ts">
import { computed, ref } from 'vue';
import type { A2UiElementProps } from '../types';

const props = defineProps<A2UiElementProps>();

const modalOpen = ref(false);
const activeTab = ref(0);

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
  const action = values.value.action;
  if (typeof action === 'function' && !isInvalid.value) {
    void action();
  }
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
    {{ String(values.text ?? '') }}
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
        @click="activeTab = index"
      >
        {{ String(tab.title ?? `Tab ${index + 1}`) }}
      </button>
    </div>
    <div
      :id="`${componentId}-panel-${activeTab}`"
      role="tabpanel"
      :aria-labelledby="`${componentId}-tab-${activeTab}`"
      class="agentdown-a2ui-tabs__panel"
    >
      <slot :name="`tab-${activeTab}`" />
    </div>
  </section>

  <div v-else-if="componentType === 'Modal'" class="agentdown-a2ui-modal">
    <div class="agentdown-a2ui-modal__trigger" @click="modalOpen = true">
      <slot name="trigger" />
    </div>
    <div v-if="modalOpen" class="agentdown-a2ui-modal__backdrop" @click.self="modalOpen = false">
      <section
        class="agentdown-a2ui-modal__dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="ariaLabel || 'Dialog'"
      >
        <button type="button" class="agentdown-a2ui-modal__close" aria-label="Close" @click="modalOpen = false">×</button>
        <slot name="content" />
      </section>
    </div>
  </div>

  <hr
    v-else-if="componentType === 'Divider'"
    class="agentdown-a2ui-divider"
    :class="`agentdown-a2ui-divider--${String(values.axis ?? 'horizontal')}`"
  >

  <button
    v-else-if="componentType === 'Button'"
    type="button"
    class="agentdown-a2ui-button"
    :class="`agentdown-a2ui-button--${String(values.variant ?? 'primary')}`"
    :disabled="isInvalid"
    :aria-label="ariaLabel || undefined"
    :aria-describedby="ariaDescription ? `${componentId}-description` : undefined"
    @click="invokeAction"
  >
    <slot />
  </button>

  <label v-else-if="componentType === 'TextField'" class="agentdown-a2ui-field">
    <span v-if="values.label">{{ String(values.label) }}</span>
    <textarea
      v-if="values.variant === 'longText'"
      :value="String(values.value ?? '')"
      :aria-invalid="isInvalid"
      @input="updateTextField"
    />
    <input
      v-else
      :type="values.variant === 'obscured' ? 'password' : values.variant === 'number' ? 'number' : 'text'"
      :value="String(values.value ?? '')"
      :aria-invalid="isInvalid"
      @input="updateTextField"
    >
    <small v-for="error in validationErrors" :key="error" class="agentdown-a2ui-field__error">{{ error }}</small>
  </label>

  <label v-else-if="componentType === 'CheckBox'" class="agentdown-a2ui-checkbox">
    <input type="checkbox" :checked="Boolean(values.value)" :aria-invalid="isInvalid" @change="updateCheckbox">
    <span>{{ String(values.label ?? '') }}</span>
  </label>

  <fieldset v-else-if="componentType === 'ChoicePicker'" class="agentdown-a2ui-choice">
    <legend v-if="values.label">{{ String(values.label) }}</legend>
    <label v-for="option in (values.options as any[] ?? [])" :key="String(option.value)">
      <input
        :type="values.variant === 'mutuallyExclusive' ? 'radio' : 'checkbox'"
        :name="values.variant === 'mutuallyExclusive' ? componentId : undefined"
        :checked="isChoiceSelected(String(option.value))"
        @change="updateChoice($event, String(option.value))"
      >
      <span>{{ String(option.label ?? option.value) }}</span>
    </label>
  </fieldset>

  <label v-else-if="componentType === 'Slider'" class="agentdown-a2ui-field">
    <span>{{ String(values.label ?? '') }} <output>{{ String(values.value ?? '') }}</output></span>
    <input
      type="range"
      :min="Number(values.min ?? 0)"
      :max="Number(values.max ?? 100)"
      :value="Number(values.value ?? 0)"
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
.agentdown-a2ui-field { display: grid; gap: 0.38rem; color: var(--agentdown-text, #172033); }
.agentdown-a2ui-field input, .agentdown-a2ui-field textarea { width: 100%; box-sizing: border-box; padding: 0.58rem 0.7rem; border: 1px solid var(--agentdown-border, #cbd5e1); border-radius: 0.6rem; background: var(--agentdown-surface, #fff); color: inherit; font: inherit; }
.agentdown-a2ui-field textarea { min-height: 6rem; resize: vertical; }
.agentdown-a2ui-field__error { color: #b42318; }
.agentdown-a2ui-checkbox, .agentdown-a2ui-choice label { display: flex; align-items: center; gap: 0.5rem; }
.agentdown-a2ui-choice { display: grid; gap: 0.45rem; margin: 0; padding: 0; border: 0; }
.agentdown-a2ui-unsupported { padding: 0.75rem; border: 1px solid #fda29b; border-radius: 0.6rem; color: #b42318; background: #fff1f0; }
</style>
