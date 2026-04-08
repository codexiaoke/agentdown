<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  defineCrewAIToolComponents,
  RunSurface,
  useCrewAIChatSession
} from '../../index';
import MessageLoadingBubble from '../components/MessageLoadingBubble.vue';
import WeatherToolCard from '../components/WeatherToolCard.vue';

const DEFAULT_PROMPT = '帮我查一下北京天气，并说明工具调用过程。';
const DEMO_CONVERSATION_ID = 'session:demo:crewai-weather';

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
 * 按统一规则拼出真实 CrewAI SSE endpoint。
 */
function buildCrewAIEndpoint(): string {
  return `${resolveBackendBaseUrl()}/api/stream/crewai`;
}

const prompt = ref(DEFAULT_PROMPT);
const endpoint = buildCrewAIEndpoint();

const {
  runtime,
  surface,
  send,
  busy,
  statusLabel,
  transportError,
  sessionId: backendSessionId
} = useCrewAIChatSession<string>({
  source: endpoint,
  input: prompt,
  conversationId: DEMO_CONVERSATION_ID,
  title: 'CrewAI 助手',
  tools: defineCrewAIToolComponents({
    lookup_weather: {
      match: 'lookup_weather',
      component: WeatherToolCard
    }
  }),
  surface: {
    draftPlaceholder: {
      component: MessageLoadingBubble,
      props: {
        label: 'CrewAI 正在思考'
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
      <h1>CrewAI 真实 SSE</h1>
      <p>启动 FastAPI backend 后，这个页面会直接请求真实 `/api/stream/crewai`，展示 CrewAI 官方 SSE chunk、真实工具调用和最终 `CrewOutput`。当前 demo 不默认演示审批，因为 CrewAI 更适合先作为真实流式输出适配层来接入。</p>
    </header>

    <form
      class="demo-form"
      @submit.prevent="send().catch(() => {})"
    >
      <label
        class="demo-form__label"
        for="crewai-prompt"
      >
        问题
      </label>

      <textarea
        id="crewai-prompt"
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

      <p class="demo-form__hint">
        当前 demo 会自动复用后端返回的 <code>sessionId</code>，方便连续追踪同一个真实 CrewAI 会话的文本流和工具调用。
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
  box-sizing: border-box;
  line-height: 1.7;
}

.demo-form__session {
  margin: 12px 0 0;
  color: #475569;
  font-size: 13px;
  line-height: 1.7;
}

.demo-form__hint {
  margin: 10px 0 0;
  color: #64748b;
  font-size: 12px;
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
  word-break: break-all;
}

.demo-page__replay {
  margin-top: 14px;
  border: 0;
  border-radius: 999px;
  padding: 10px 16px;
  background: #0f172a;
  color: #ffffff;
  font: inherit;
  cursor: pointer;
}

.demo-page__replay:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.demo-page__error {
  margin: 0 0 20px;
  color: #dc2626;
  font-size: 14px;
}
</style>
