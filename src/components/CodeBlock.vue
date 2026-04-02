<script setup lang="ts">
import { computed, ref } from 'vue';
import hljs from 'highlight.js';

interface Props {
  code: string;
  language?: string;
}

const props = withDefaults(defineProps<Props>(), {
  language: 'text'
});

const copied = ref(false);

const label = computed(() => props.language || 'text');

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

const highlightedHtml = computed(() => {
  const language = props.language?.trim();

  if (language && hljs.getLanguage(language)) {
    return hljs.highlight(props.code, {
      language
    }).value;
  }

  return escapeHtml(props.code);
});

async function copyCode() {
  await navigator.clipboard.writeText(props.code);
  copied.value = true;
  window.setTimeout(() => {
    copied.value = false;
  }, 1500);
}
</script>

<template>
  <div class="vpm-code-block">
    <div class="vpm-code-toolbar">
      <span class="vpm-code-language">{{ label }}</span>
      <button
        type="button"
        class="vpm-copy-button"
        @click="copyCode"
      >
        {{ copied ? 'Copied' : 'Copy' }}
      </button>
    </div>

    <div
      class="vpm-code-content"
    >
      <pre class="vpm-code-fallback"><code v-html="highlightedHtml" /></pre>
    </div>
  </div>
</template>
