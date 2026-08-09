<script setup lang="ts">
import { ref } from 'vue';
import { RunSurface } from 'agentdown';
import { useAgUiChatSession } from 'agentdown/ag-ui';

const apiBase = (import.meta.env.VITE_AGENTDOWN_API_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');
const prompt = ref('请用三点介绍 AG-UI 协议适合解决什么问题。');
const session = useAgUiChatSession<string>({
  source: `${apiBase}/api/examples/agui`,
  input: prompt,
  conversationId: 'example:pure-ag-ui'
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
      <p class="eyebrow">agentdown/ag-ui</p>
      <h1>纯 AG-UI 消费者</h1>
      <p>只处理标准 RunAgentInput 和 AG-UI lifecycle/text 事件，不注册 A2UI。</p>
    </header>

    <section class="chat">
      <RunSurface :runtime="session.runtime" v-bind="session.surface.value" />
      <p v-if="session.transportError.value" class="error">{{ session.transportError.value }}</p>
    </section>

    <form class="composer" @submit.prevent="submit">
      <textarea v-model="prompt" rows="3" aria-label="消息" />
      <button :disabled="session.busy.value || !prompt.trim()">
        {{ session.busy.value ? session.statusLabel.value : '发送' }}
      </button>
    </form>
  </main>
</template>
