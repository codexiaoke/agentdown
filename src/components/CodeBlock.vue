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
  <figure class="agentdown-code-block">
    <figcaption class="agentdown-code-toolbar">
      <span class="agentdown-code-language">{{ label }}</span>
      <button
        type="button"
        class="agentdown-copy-button"
        :data-copied="copied ? 'true' : 'false'"
        :aria-label="copied ? 'Code copied' : 'Copy code'"
        :title="copied ? 'Copied' : 'Copy'"
        @click="copyCode"
      >
        <svg
          v-if="copied"
          class="agentdown-copy-icon"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3.75 8.25 6.5 11l5.75-6"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>

        <svg
          v-else
          class="agentdown-copy-icon"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="5.25"
            y="3.25"
            width="7.5"
            height="9.5"
            rx="1.75"
            stroke="currentColor"
            stroke-width="1.25"
          />
          <path
            d="M3.75 10.25H3.25c-.552 0-1-.448-1-1v-6.5c0-.552.448-1 1-1h5.5c.552 0 1 .448 1 1v.5"
            stroke="currentColor"
            stroke-width="1.25"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </figcaption>

    <div class="agentdown-code-content">
      <pre class="agentdown-code-fallback"><code v-html="highlightedHtml" /></pre>
    </div>
  </figure>
</template>
