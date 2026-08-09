<script setup lang="ts">
import { ref } from 'vue';
import { RunSurface } from 'agentdown';
import { useAgUiA2UiChatSession } from 'agentdown/ag-ui-a2ui';

const apiBase = (import.meta.env.VITE_AGENTDOWN_API_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');
const prompt = ref('生成一个读书计划表单，包含书名、每日分钟数、阅读节奏和确认按钮。');
const session = useAgUiA2UiChatSession<string>({
  source: `${apiBase}/api/stream/agui`,
  input: prompt,
  conversationId: 'example:ag-ui-a2ui',
  recovery: {}
});

async function submit() {
  if (!prompt.value.trim() || session.busy.value) return;
  await session.send();
  prompt.value = '';
}
</script>

<template>
  <main class="page">
    <header>
      <p class="eyebrow">agentdown/ag-ui-a2ui</p>
      <h1>AG-UI + A2UI 消费者</h1>
      <p>AG-UI 管理 run 与恢复，A2UI 负责受前端 Catalog 约束的生成式界面。</p>
    </header>

    <section class="chat">
      <RunSurface :runtime="session.runtime" v-bind="session.surface.value" />
      <p v-if="session.a2uiClientError.value" class="error">{{ session.a2uiClientError.value.message }}</p>
      <p v-else-if="session.transportError.value" class="error">{{ session.transportError.value }}</p>
    </section>

    <form class="composer" @submit.prevent="submit">
      <textarea v-model="prompt" rows="3" aria-label="生成式界面需求" />
      <button :disabled="session.busy.value || !prompt.trim()">
        {{ session.busy.value ? session.statusLabel.value : '发送' }}
      </button>
    </form>
  </main>
</template>
