<script setup lang="ts">
import { ref } from 'vue';
import {
  A2UiSurface,
  createA2UiClientCapabilities,
  defaultA2UiBasicCatalog,
  type A2UiClientEnvelope
} from 'agentdown/a2ui';

interface A2UiResponse {
  assistantText: string;
  messages: unknown[];
  model: string;
}

const apiBase = (import.meta.env.VITE_AGENTDOWN_API_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');
const catalogs = [defaultA2UiBasicCatalog];
const capabilities = createA2UiClientCapabilities({ catalogs });
const prompt = ref('生成一个读书计划界面，包含书名、每日分钟数和确认按钮。');
const messages = ref<unknown[]>([]);
const assistantText = ref('');
const model = ref('');
const busy = ref(false);
const error = ref('');

async function request(payload: Record<string, unknown>) {
  busy.value = true;
  error.value = '';
  try {
    const response = await fetch(`${apiBase}/api/examples/a2ui`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(typeof payload.requestId === 'string'
          ? { 'Idempotency-Key': payload.requestId }
          : {})
      },
      body: JSON.stringify({
        sessionId: 'example:pure-a2ui',
        clientCapabilities: capabilities,
        ...payload
      })
    });
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json() as A2UiResponse;
    messages.value = result.messages;
    assistantText.value = result.assistantText;
    model.value = result.model;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

async function submit() {
  if (!prompt.value.trim() || busy.value) return;
  await request({ prompt: prompt.value });
}

async function sendClient(envelope: A2UiClientEnvelope) {
  await request({
    requestId: envelope.requestId,
    clientMessage: envelope.message,
    clientCapabilities: envelope.capabilities,
    ...(envelope.dataModel ? { clientDataModel: envelope.dataModel } : {})
  });
}
</script>

<template>
  <main class="page">
    <header>
      <p class="eyebrow">agentdown/a2ui</p>
      <h1>独立 A2UI 消费者</h1>
      <p>普通 JSON transport，不依赖 AG-UI；组件和 Catalog 仍由前端控制。</p>
    </header>

    <form class="composer" @submit.prevent="submit">
      <textarea v-model="prompt" rows="3" aria-label="界面需求" />
      <button :disabled="busy || !prompt.trim()">{{ busy ? '生成中…' : '生成界面' }}</button>
    </form>

    <section class="surface">
      <div v-if="assistantText" class="meta">
        <strong>{{ assistantText }}</strong>
        <span>{{ model }}</span>
      </div>
      <A2UiSurface
        v-if="messages.length"
        surface-id="agent-surface"
        :messages="messages"
        :catalogs="catalogs"
        :send-client-message="sendClient"
      />
      <p v-else class="empty">输入需求后，真实 DeepSeek 会返回经过后端校验的 A2UI 消息。</p>
      <p v-if="error" class="error">{{ error }}</p>
    </section>
  </main>
</template>
