<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';
import type { FileCardPreviewMode } from './fileCardPreview';

interface Props {
  open: boolean;
  title?: string;
  subtitle?: string;
  mode?: Exclude<FileCardPreviewMode, 'image' | null>;
  src?: string;
  text?: string;
  loading?: boolean;
  error?: string;
  externalHref?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  subtitle: '',
  mode: 'iframe',
  src: '',
  text: '',
  loading: false,
  error: '',
  externalHref: ''
});

const emit = defineEmits<{
  close: [];
}>();

function syncBodyScrollLock(open: boolean) {
  if (typeof document === 'undefined') {
    return;
  }

  document.body.style.overflow = open ? 'hidden' : '';
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close');
  }
}

watch(
  () => props.open,
  (open) => {
    syncBodyScrollLock(open);

    if (typeof window === 'undefined') {
      return;
    }

    if (open) {
      window.addEventListener('keydown', handleKeydown);
      return;
    }

    window.removeEventListener('keydown', handleKeydown);
  },
  {
    immediate: true
  }
);

onBeforeUnmount(() => {
  syncBodyScrollLock(false);

  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeydown);
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition name="agentdown-lightbox-transition">
      <div
        v-if="open"
        class="agentdown-lightbox"
        @click.self="emit('close')"
      >
        <div class="agentdown-lightbox-shell agentdown-file-preview-shell">
          <header class="agentdown-lightbox-toolbar">
            <div class="agentdown-lightbox-meta">
              <strong>{{ title || '文件预览' }}</strong>
              <span>{{ subtitle || '在线预览' }}</span>
            </div>

            <div class="agentdown-lightbox-actions">
              <a
                v-if="externalHref"
                class="agentdown-lightbox-button agentdown-file-preview-open-link"
                :href="externalHref"
                target="_blank"
                rel="noreferrer"
                title="在新窗口打开"
                aria-label="在新窗口打开"
              >
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M9.25 3.25h3.5v3.5M12.5 3.5 7.75 8.25M6.5 4.5H4.75A1.25 1.25 0 0 0 3.5 5.75v5.5A1.25 1.25 0 0 0 4.75 12.5h5.5a1.25 1.25 0 0 0 1.25-1.25V9.5"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </a>

              <button
                type="button"
                class="agentdown-lightbox-button"
                aria-label="关闭预览"
                title="关闭预览"
                @click="emit('close')"
              >
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
            </div>
          </header>

          <div class="agentdown-file-preview-stage">
            <div
              v-if="loading"
              class="agentdown-file-preview-empty"
            >
              正在加载预览...
            </div>

            <div
              v-else-if="error"
              class="agentdown-file-preview-empty agentdown-file-preview-empty--error"
            >
              <strong>预览失败</strong>
              <p>{{ error }}</p>
            </div>

            <iframe
              v-else-if="mode === 'iframe' && src"
              class="agentdown-file-preview-frame"
              :src="src"
              title="文件在线预览"
            />

            <pre
              v-else-if="mode === 'text'"
              class="agentdown-file-preview-text"
            ><code>{{ text }}</code></pre>

            <div
              v-else
              class="agentdown-file-preview-empty"
            >
              当前文件暂不支持在线预览。
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
