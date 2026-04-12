<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  defineSpringAiToolComponents,
  RunSurface,
  useSpringAiChatSession
} from '../../index';
import MessageLoadingBubble from '../components/MessageLoadingBubble.vue';
import WeatherToolCard from '../components/WeatherToolCard.vue';

const DEFAULT_PROMPT = '帮我查一下北京天气，并说明工具调用过程。';
const DEMO_CONVERSATION_ID = 'session:demo:springai-weather';
const DEFAULT_BACKEND_BASE_URL = 'http://127.0.0.1:8080';
const hitlStatus = ref('尚未触发自定义 HITL 逻辑');
const hitlPayloadPreview = ref('尚未提交自定义 approval payload');
const hitlTrace = ref<string[]>([]);
const editedCity = ref('上海');

/**
 * 去掉 URL 末尾多余的 `/`，方便后面安全拼接路径。
 */
function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * 读取 demo 当前应连接的后端根地址。
 */
function resolveConfiguredBackendBaseUrl(): string {
  const configured = import.meta.env.VITE_AGENTDOWN_API_BASE;

  return trimTrailingSlash(configured && configured.length > 0
    ? configured
    : DEFAULT_BACKEND_BASE_URL);
}

/**
 * 按统一规则拼出真实 Spring AI SSE endpoint。
 */
function buildSpringAiEndpoint(baseUrl: string): string {
  return `${trimTrailingSlash(baseUrl)}/api/stream/springai`;
}

/**
 * 从未知值里尽量读取普通对象，方便继续复用原始 tool args。
 */
function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
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
 * 把当前准备提交给 Spring AI 的自定义 resume payload 转成便于阅读的 JSON。
 */
function updateHitlPayloadPreview(payload: Record<string, unknown>): void {
  hitlPayloadPreview.value = JSON.stringify(payload, null, 2);
}

/**
 * 在切换后端时重置 demo 状态，避免把旧 sessionId 带到新后端。
 */
function resetHitlDemoState(): void {
  hitlStatus.value = '尚未触发自定义 HITL 逻辑';
  hitlPayloadPreview.value = '尚未提交自定义 approval payload';
  hitlTrace.value = [];
}

const prompt = ref(DEFAULT_PROMPT);
const backendBaseUrl = ref(resolveConfiguredBackendBaseUrl());
const endpoint = computed(() => buildSpringAiEndpoint(backendBaseUrl.value));

const {
  runtime,
  surface,
  send,
  busy,
  statusLabel,
  transportError,
  sessionId: backendSessionId,
  reset
} = useSpringAiChatSession<string>({
  source: endpoint,
  input: prompt,
  conversationId: DEMO_CONVERSATION_ID,
  mode: 'hitl',
  title: 'Spring AI 助手',
  tools: defineSpringAiToolComponents({
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
        pushHitlTrace('approve handler 命中，沿用官方 decision，并继续走默认 approval resume 流程。');

        await context.submitDecision();
      },
      changes_requested: async (context) => {
        const resolvedCity = editedCity.value.trim() || '上海';
        const toolArgs = readRecord(context.target.toolArgs) ?? {};
        const decision = {
          type: 'edit' as const,
          message: `demo 自定义修改意见：请改查 ${resolvedCity}，并说明这是一次前端人工修正。`,
          edited_action: {
            name: context.target.toolName || 'lookup_weather',
            args: {
              ...toolArgs,
              city: resolvedCity
            }
          }
        };

        hitlStatus.value = '命中自定义 changes_requested handler';
        updateHitlPayloadPreview({
          decisions: [decision]
        });
        pushHitlTrace(`changes_requested handler 已把工具参数改成 city=${resolvedCity}，并提交官方 edit 决策。`);

        await context.submitDecision(decision);
      },
      reject: async (context) => {
        const resolvedMessage = context.reason?.trim() || 'demo 自定义拒绝：这次先不要执行天气查询工具。';
        const decision = {
          type: 'reject' as const,
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
        label: 'Spring AI 正在思考'
      }
    }
  }
});

let hasInitializedBackendWatcher = false;

watch(endpoint, () => {
  if (!hasInitializedBackendWatcher) {
    hasInitializedBackendWatcher = true;
    return;
  }

  reset();
  resetHitlDemoState();
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
      <h1>Spring AI 真实 SSE</h1>
      <p>这个页面会直接请求真实 `/api/stream/springai`。demo 会完整演示 Spring AI approval 的 approve / edit / reject 接入方式，其中“需修改”会真正提交官方 `edit` 决策并改 tool args。</p>
    </header>

    <form
      class="demo-form"
      @submit.prevent="send().catch(() => {})"
    >
      <label
        class="demo-form__label"
        for="springai-prompt"
      >
        问题
      </label>

      <textarea
        id="springai-prompt"
        v-model="prompt"
        class="demo-form__input"
        placeholder="帮我查一下北京天气，并说明工具调用过程。"
      />

      <div class="demo-form__backend-panel">
        <label
          class="demo-form__label demo-form__label--inline"
          for="springai-backend-base-url"
        >
          后端根地址
        </label>

        <input
          id="springai-backend-base-url"
          v-model="backendBaseUrl"
          class="demo-form__input demo-form__input--single-line"
          type="text"
          placeholder="http://127.0.0.1:8080"
        >
      </div>

      <div class="demo-form__backend-panel">
        <label
          class="demo-form__label demo-form__label--inline"
          for="springai-edited-city"
        >
          需修改时改成城市
        </label>

        <input
          id="springai-edited-city"
          v-model="editedCity"
          class="demo-form__input demo-form__input--single-line"
          type="text"
          placeholder="上海"
        >
      </div>

      <div class="demo-form__meta">
        <span class="demo-form__status">{{ statusLabel }}</span>
        <code class="demo-form__endpoint">{{ endpoint }}</code>
        <code class="demo-form__endpoint">sessionId: {{ backendSessionId || '(等待后端返回)' }}</code>
      </div>

      <p
        v-if="transportError"
        class="demo-form__error"
      >
        {{ transportError }}
      </p>

      <div class="demo-form__actions">
        <button
          class="demo-form__submit"
          type="submit"
          :disabled="busy"
        >
          {{ busy ? '请求中…' : '发送并重新请求 SSE' }}
        </button>
      </div>

      <div class="demo-form__hitl-panel">
        <div class="demo-form__hitl-card">
          <strong>自定义 payload</strong>
          <p>approve 会沿用默认 official decision；changes_requested 会提交官方 `edit` 决策并真正改 tool args；reject 会把拒绝原因写回 `message`。</p>
          <pre>{{ hitlPayloadPreview }}</pre>
        </div>

        <div class="demo-form__hitl-card">
          <strong>自定义 HITL 状态</strong>
          <p>{{ hitlStatus }}</p>
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
    </form>

    <div class="demo-runtime">
      <RunSurface
        :runtime="runtime"
        v-bind="surface"
      />
    </div>
  </section>
</template>

<style scoped>
.demo-page {
  display: grid;
  gap: 20px;
  padding: 32px;
}

.demo-page__header h1,
.demo-page__header p {
  margin: 0;
}

.demo-page__header {
  display: grid;
  gap: 10px;
}

.demo-page__header p {
  max-width: 960px;
  color: #475569;
  line-height: 1.8;
}

.demo-form {
  display: grid;
  gap: 14px;
  padding: 20px;
  border-radius: 20px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
}

.demo-form__label {
  font-size: 14px;
  font-weight: 600;
}

.demo-form__label--inline {
  margin-bottom: 0;
}

.demo-form__input {
  width: 100%;
  min-height: 72px;
  border-radius: 14px;
  border: 1px solid #cbd5e1;
  padding: 12px 14px;
  resize: vertical;
  font: inherit;
  color: #0f172a;
  background: #ffffff;
  line-height: 1.7;
}

.demo-form__input--single-line {
  min-height: 0;
  margin-top: 12px;
}

.demo-form__backend-panel {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.demo-form__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  color: #475569;
  font-size: 13px;
}

.demo-form__status {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  padding: 6px 10px;
  font-weight: 600;
}

.demo-form__endpoint {
  border-radius: 10px;
  background: #f8fafc;
  padding: 6px 10px;
  color: #334155;
}

.demo-form__error {
  margin: 0;
  border-radius: 14px;
  background: #fef2f2;
  color: #b91c1c;
  padding: 12px 14px;
}

.demo-form__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.demo-form__submit {
  border: none;
  border-radius: 999px;
  background: #0f172a;
  color: #ffffff;
  padding: 12px 18px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.demo-form__submit:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.demo-form__hitl-panel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
}

.demo-form__hitl-card {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-radius: 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.demo-form__hitl-card strong,
.demo-form__hitl-card p {
  margin: 0;
}

.demo-form__hitl-card p,
.demo-form__hitl-card li {
  color: #475569;
  line-height: 1.7;
}

.demo-form__hitl-card ul {
  margin: 0;
  padding-left: 18px;
}

.demo-form__hitl-card pre {
  margin: 0;
  overflow: auto;
  border-radius: 12px;
  background: #0f172a;
  color: #e2e8f0;
  padding: 12px;
  font-size: 12px;
  line-height: 1.6;
}

.demo-runtime {
  min-height: 320px;
  border-radius: 24px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  padding: 20px;
}
</style>
