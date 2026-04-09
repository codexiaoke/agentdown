<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  defineLangChainToolComponents,
  RunSurface,
  useLangChainChatSession
} from '../../index';
import MessageLoadingBubble from '../components/MessageLoadingBubble.vue';
import WeatherToolCard from '../components/WeatherToolCard.vue';

const DEFAULT_PROMPT = '帮我查一下北京天气，并说明工具调用过程。';
const DEMO_CONVERSATION_ID = 'session:demo:langchain-weather';
const hitlStatus = ref('尚未触发自定义 HITL 逻辑');
const hitlPayloadPreview = ref('尚未提交自定义 interrupt payload');
const hitlTrace = ref<string[]>([]);

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
 * 按统一规则拼出真实 LangChain SSE endpoint。
 */
function buildLangChainEndpoint(): string {
  return `${resolveBackendBaseUrl()}/api/stream/langchain`;
}

/**
 * 记录一次 demo 里的自定义 HITL 行为，方便直接在页面上观察。
 */
function pushHitlTrace(message: string): void {
  hitlTrace.value = [
    `${new Date().toLocaleTimeString()} ${message}`,
    ...hitlTrace.value
  ].slice(0, 6);
}

/**
 * 把当前准备提交给 LangChain 的自定义 resume payload 转成便于阅读的 JSON。
 */
function updateHitlPayloadPreview(payload: Record<string, unknown>): void {
  hitlPayloadPreview.value = JSON.stringify(payload, null, 2);
}

const prompt = ref(DEFAULT_PROMPT);
const endpoint = buildLangChainEndpoint();

const {
  runtime,
  surface,
  send,
  busy,
  statusLabel,
  transportError,
  sessionId: backendSessionId
} = useLangChainChatSession<string>({
  source: endpoint,
  input: prompt,
  conversationId: DEMO_CONVERSATION_ID,
  mode: 'hitl',
  title: 'LangChain 助手',
  tools: defineLangChainToolComponents({
    lookup_weather: {
      match: 'lookup_weather',
      component: WeatherToolCard
    }
  }),
  hitl: {
    handlers: {
      approve: async (context) => {
        const payload = {
          decisions: [context.defaultDecision]
        };

        hitlStatus.value = '命中自定义 approve handler';
        updateHitlPayloadPreview(payload);
        pushHitlTrace('approve handler 命中，沿用官方 decision，并继续走默认 interrupt resume 流程。');

        await context.submitDecision();
      },
      changes_requested: async (context) => {
        const resolvedMessage = context.reason?.trim() || 'demo 自定义修改意见：请补充工具调用过程，并简化最终总结。';
        const decision = {
          ...context.defaultDecision,
          message: resolvedMessage
        };

        hitlStatus.value = '命中自定义 changes_requested handler';
        updateHitlPayloadPreview({
          decisions: [decision]
        });
        pushHitlTrace(`changes_requested handler 已写入 message：${resolvedMessage}`);

        await context.submitDecision(decision);
      },
      reject: async (context) => {
        const resolvedMessage = context.reason?.trim() || 'demo 自定义拒绝：这次先不要执行天气查询工具。';
        const decision = {
          ...context.defaultDecision,
          message: resolvedMessage
        };

        hitlStatus.value = '命中自定义 reject handler';
        updateHitlPayloadPreview({
          decisions: [decision]
        });
        pushHitlTrace(`reject handler 已写入 message：${resolvedMessage}`);

        await context.submitDecision(decision);
      }
    }
  },
  surface: {
    draftPlaceholder: {
      component: MessageLoadingBubble,
      props: {
        label: 'LangChain 正在思考'
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
      <h1>LangChain 真实 SSE</h1>
      <p>启动 FastAPI backend 后，这个页面会直接请求真实 `/api/stream/langchain`，默认启用 `mode=hitl`，先展示 LangChain 官方 interrupt 审批，再继续执行工具并回写最终答案。这个 demo 现在已经改成使用 `useLangChainChatSession({ hitl: { handlers } })` 的自定义写法。</p>
    </header>

    <form
      class="demo-form"
      @submit.prevent="send().catch(() => {})"
    >
      <label
        class="demo-form__label"
        for="langchain-prompt"
      >
        问题
      </label>

      <textarea
        id="langchain-prompt"
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

      <p class="demo-form__session">
        自定义 HITL 状态：<code>{{ hitlStatus }}</code>
      </p>

      <div class="demo-form__hitl-panel">
        <div class="demo-form__hitl-card">
          <strong>自定义 payload</strong>
          <p>approve 会沿用默认 official decision；changes_requested / reject 会把说明写入 `message` 再提交。</p>
          <pre>{{ hitlPayloadPreview }}</pre>
        </div>

        <div class="demo-form__hitl-card">
          <strong>自定义逻辑日志</strong>
          <ul>
            <li
              v-for="item in hitlTrace"
              :key="item"
            >
              {{ item }}
            </li>
          </ul>
        </div>
      </div>

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

.demo-form__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.demo-form__status {
  border-radius: 999px;
  padding: 4px 10px;
  background: #e2e8f0;
  color: #334155;
  font-size: 12px;
}

.demo-form__endpoint {
  overflow-wrap: anywhere;
  color: #64748b;
  font-size: 12px;
}

.demo-form__session {
  margin: 12px 0 0;
  color: #475569;
  font-size: 13px;
  line-height: 1.7;
}

.demo-form__hitl-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.demo-form__hitl-card {
  border-radius: 14px;
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.demo-form__hitl-card strong {
  display: block;
  color: #0f172a;
  font-size: 13px;
}

.demo-form__hitl-card p {
  margin: 8px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.7;
}

.demo-form__hitl-card pre {
  margin: 10px 0 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: #0f172a;
  color: #dbeafe;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-x: auto;
}

.demo-form__hitl-card ul {
  margin: 10px 0 0;
  padding-left: 18px;
  color: #475569;
  font-size: 12px;
  line-height: 1.7;
}

.demo-form__hitl-card li + li {
  margin-top: 6px;
}

.demo-page__replay {
  margin-top: 14px;
  border: 0;
  border-radius: 999px;
  padding: 10px 14px;
  background: #e8eef7;
  color: #334155;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.demo-page__replay:disabled {
  cursor: wait;
  opacity: 0.72;
}

.demo-page__error {
  margin: 0 0 20px;
  border-radius: 14px;
  padding: 12px 14px;
  background: #fff1f2;
  color: #be123c;
  font-size: 13px;
  line-height: 1.7;
}

@media (max-width: 720px) {
  .demo-page {
    padding: 24px 16px 56px;
  }

  .demo-form__hitl-panel {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
