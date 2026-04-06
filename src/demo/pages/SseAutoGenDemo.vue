<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  defineAutoGenToolComponents,
  RunSurface,
  useAutoGenChatSession
} from '../../index';
import MessageLoadingBubble from '../components/MessageLoadingBubble.vue';
import WeatherToolCard from '../components/WeatherToolCard.vue';

const DEFAULT_PROMPT = '帮我查一下北京天气，并说明工具调用过程。';
const DEMO_CONVERSATION_ID = 'session:demo:autogen-weather';

/**
 * 去掉 URL 末尾多余的 `/`，方便后面安全拼接路径。
 */
function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * 解析 demo 当前应连接的后端根地址。
 */
function resolveBackendBaseUrl(): string {
  const configured = import.meta.env.VITE_AGENTDOWN_API_BASE;
  return trimTrailingSlash(configured && configured.length > 0
    ? configured
    : 'http://127.0.0.1:8000');
}

/**
 * 按统一规则拼出真实 AutoGen SSE endpoint。
 */
function buildAutoGenEndpoint(): string {
  return `${resolveBackendBaseUrl()}/api/stream/autogen`;
}

const prompt = ref(DEFAULT_PROMPT);
const endpoint = buildAutoGenEndpoint();
const autoGenTools = defineAutoGenToolComponents({
  'tool.weather': {
    match: ['weather', '天气'],
    mode: 'includes',
    component: WeatherToolCard
  }
});

/**
 * AutoGen demo 直接走更短的 `useAutoGenChatSession()`：
 * - 不再手写 preset + transport + bridge start/stop
 * - 不再手写 user message seed
 * - 不再手写 regenerate 接线
 */
const {
  runtime,
  surface,
  send,
  busy,
  statusLabel,
  transportError,
  sessionId: backendSessionId
} = useAutoGenChatSession<string>({
  source: endpoint,
  input: prompt,
  conversationId: DEMO_CONVERSATION_ID,
  title: 'AutoGen 助手',
  tools: autoGenTools,
  surface: {
    draftPlaceholder: {
      component: MessageLoadingBubble,
      props: {
        label: 'AutoGen 正在思考'
      }
    }
  }
});

onMounted(() => {
  send().catch(() => {
    // demo 页面里失败只需要保持当前状态，不需要再额外抛错。
  });
});
</script>

<template>
  <section class="demo-page">
    <header class="demo-page__header">
      <h1>AutoGen 真实 SSE</h1>
      <p>启动 FastAPI backend 后，这个页面会直接请求真实 `/api/stream/autogen`，并使用 `useAutoGenChatSession()` 把官方 `run_stream()` 事件渲染成聊天内容和工具组件。</p>
    </header>

    <form
      class="demo-form"
      @submit.prevent="send().catch(() => {})"
    >
      <label
        class="demo-form__label"
        for="autogen-prompt"
      >
        问题
      </label>

      <textarea
        id="autogen-prompt"
        v-model="prompt"
        class="demo-form__input"
        rows="2"
        placeholder="帮我查一下北京天气，并说明工具调用过程。"
      />

      <div class="demo-form__meta">
        <span class="demo-form__status">{{ statusLabel }}</span>
        <code class="demo-form__endpoint">{{ endpoint }}</code>
      </div>

      <p
        v-if="backendSessionId"
        class="demo-form__session"
      >
        后端 sessionId：<code>{{ backendSessionId }}</code>
      </p>

      <button
        type="submit"
        class="demo-page__replay"
        :disabled="busy"
      >
        {{ busy ? '请求中...' : '重新请求' }}
      </button>
    </form>

    <p
      v-if="transportError"
      class="demo-page__error"
    >
      {{ transportError }}
    </p>

    <RunSurface
      :runtime="runtime"
      v-bind="surface"
    />
  </section>
</template>

<style scoped>
.demo-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 44px 24px 80px;
  min-height: 100%;
}

.demo-page__header {
  margin-bottom: 24px;
}

.demo-page__header h1,
.demo-page__header p {
  margin: 0;
}

.demo-page__header h1 {
  font-size: 28px;
  letter-spacing: -0.05em;
}

.demo-page__header p {
  margin-top: 10px;
  color: #64748b;
  line-height: 1.8;
}

.demo-form {
  margin-bottom: 28px;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 16px;
  background: #ffffff;
}

.demo-form__label {
  display: block;
  margin-bottom: 8px;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
}

.demo-form__input {
  width: 100%;
  min-height: 72px;
  border: 1px solid #dbe3ee;
  border-radius: 14px;
  padding: 12px 14px;
  resize: vertical;
  background: #f8fafc;
  color: #0f172a;
  font: inherit;
  line-height: 1.7;
}

.demo-form__session {
  margin: 12px 0 0;
  color: #475569;
  font-size: 13px;
  line-height: 1.7;
}

.demo-form__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
}

.demo-form__status {
  color: #475569;
  font-size: 13px;
}

.demo-form__endpoint {
  color: #1d4ed8;
  font-size: 12px;
}

.demo-page__replay {
  margin-top: 16px;
  border: 0;
  border-radius: 999px;
  padding: 10px 18px;
  background: #0f172a;
  color: #ffffff;
  font: inherit;
  cursor: pointer;
}

.demo-page__replay:disabled {
  cursor: progress;
  opacity: 0.72;
}

.demo-page__error {
  margin: 0 0 20px;
  color: #b91c1c;
  font-size: 14px;
}
</style>
