<script setup lang="ts">
import { ref } from 'vue';
import { RunSurface, useAgentChat } from 'agentdown';

const apiBase = (import.meta.env.VITE_AGENTDOWN_API_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');
const prompt = ref('生成一个读书计划表单，包含书名、每日分钟数、阅读节奏和确认按钮。');
const session = useAgentChat<string>({
  source: `${apiBase}/api/stream/chat`,
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
      <p class="eyebrow">agentdown · useAgentChat</p>
      <h1>统一 Chat 消费者</h1>
      <p>一个 AG-UI 聊天流可返回普通文字、前端注册组件或受 Catalog 约束的 A2UI。</p>
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
