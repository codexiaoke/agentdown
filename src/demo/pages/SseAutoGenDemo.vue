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
const hitlStatus = ref('尚未触发自定义 HITL 逻辑');
const hitlPayloadPreview = ref('尚未提交自定义 handoff payload');
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
 * 按统一规则拼出真实 AutoGen SSE endpoint。
 */
function buildAutoGenEndpoint(): string {
  return `${resolveBackendBaseUrl()}/api/stream/autogen`;
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
 * 把当前真正提交给 AutoGen 的自定义 handoff payload 转成便于阅读的 JSON。
 */
function updateHitlPayloadPreview(payload: Record<string, unknown>): void {
  hitlPayloadPreview.value = JSON.stringify(payload, null, 2);
}

const prompt = ref(DEFAULT_PROMPT);
const endpoint = buildAutoGenEndpoint();

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
  mode: 'hitl',
  title: 'AutoGen 助手',
  tools: defineAutoGenToolComponents({
    lookup_weather: {
      match: 'lookup_weather',
      component: WeatherToolCard
    }
  }),
  hitl: {
    handlers: {
      approve: async (context) => {
        const payload = {
          ...context.defaultRequest,
          content: 'demo 自定义批准：请继续执行，并先给出天气结论，再解释工具调用过程。'
        };

        hitlStatus.value = '命中自定义 approve handler';
        updateHitlPayloadPreview(payload);
        pushHitlTrace('approve handler 已覆写 handoff content，并继续走默认 resume 流程。');

        await context.submit(payload);
      },
      reject: async (context) => {
        const resolvedReason = context.reason?.trim() || 'demo 自定义拒绝：用户这次不需要继续执行。';
        const payload = {
          ...context.defaultRequest,
          content: `这次不继续执行，原因：${resolvedReason}。请停止当前任务，并简要确认已收到。`
        };

        hitlStatus.value = '命中自定义 reject handler';
        updateHitlPayloadPreview(payload);
        pushHitlTrace(`reject handler 已覆写 handoff content：${resolvedReason}`);

        await context.submit(payload);
      }
    }
  },
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
      <p>启动 FastAPI backend 后，这个页面会直接请求真实 `/api/stream/autogen`，默认启用 `mode=hitl`。当 AutoGen 发出官方 `HandoffMessage` 时，前端会渲染成更轻量的 approval 卡片，直接点击继续或拒绝即可复用同一个 SSE 入口。这个 demo 现在已经改成使用 `useAutoGenChatSession({ hitl: { handlers } })` 的自定义写法。</p>
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

      <p class="demo-form__session">
        自定义 HITL 状态：<code>{{ hitlStatus }}</code>
      </p>

      <div class="demo-form__hitl-panel">
        <div class="demo-form__hitl-card">
          <strong>自定义 payload</strong>
          <p>approve / reject 都会在默认 handoff request 上覆写 `content`，让你直接看到前端如何接管人工回复内容。</p>
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

@media (max-width: 720px) {
  .demo-page {
    padding: 24px 16px 56px;
  }

  .demo-form__hitl-panel {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
