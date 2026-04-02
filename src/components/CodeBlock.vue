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
const copyLabel = computed(() => (copied.value ? 'done' : 'copy'));

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

const highlightedHtml = computed(() => {
  const language = props.language?.trim();

  // 语言未知时降级成纯转义文本，避免因为高亮失败把原始代码吞掉。
  if (language && hljs.getLanguage(language)) {
    return hljs.highlight(props.code, {
      language
    }).value;
  }

  return escapeHtml(props.code);
});

async function copyCode() {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return;
  }

  try {
    await navigator.clipboard.writeText(props.code);
    copied.value = true;

    // 复制反馈只做一个轻量状态，不引入额外依赖。
    window.setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch {
    copied.value = false;
  }
}
</script>

<template>
  <figure class="vpm-code-block">
    <figcaption class="vpm-code-toolbar">
      <span class="vpm-code-language">{{ label }}</span>
      <button
        type="button"
        class="vpm-copy-button"
        :data-copied="copied ? 'true' : 'false'"
        :aria-label="copied ? 'Code copied' : 'Copy code'"
        :title="copied ? 'Copied' : 'Copy'"
        @click="copyCode"
      >
        {{ copyLabel }}
      </button>
    </figcaption>

    <div class="vpm-code-content">
      <pre class="vpm-code-fallback"><code v-html="highlightedHtml" /></pre>
    </div>
  </figure>
</template>
