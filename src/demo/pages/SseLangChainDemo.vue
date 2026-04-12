<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  defineLangChainToolComponents,
  RunSurface,
  useLangChainChatSession
} from '../../index';
import MessageLoadingBubble from '../components/MessageLoadingBubble.vue';
import WeatherToolCard from '../components/WeatherToolCard.vue';

const DEFAULT_PROMPT = '帮我查一下北京天气，并说明工具调用过程。';
const DEMO_CONVERSATION_ID = 'session:demo:langchain-weather';
const SPRING_BACKEND_BASE_URL = 'http://127.0.0.1:8080';
const FASTAPI_BACKEND_BASE_URL = 'http://127.0.0.1:8000';
const hitlStatus = ref('尚未触发自定义 HITL 逻辑');
const hitlPayloadPreview = ref('尚未提交自定义 interrupt payload');
const hitlTrace = ref<string[]>([]);
const editedCity = ref('上海');

/**
 * LangChain demo 当前支持的后端预设。
 */
type LangChainDemoBackendPreset = 'spring' | 'fastapi' | 'custom';

/**
 * 去掉 URL 末尾多余的 `/`，方便后面安全拼接路径。
 */
function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * 读取 demo 的默认后端根地址。
 *
 * 优先级：
 * 1. `VITE_AGENTDOWN_API_BASE`
 * 2. Spring Boot LangChain demo 默认地址
 */
function resolveConfiguredBackendBaseUrl(): string {
  const configured = import.meta.env.VITE_AGENTDOWN_API_BASE;

  return trimTrailingSlash(configured && configured.length > 0
    ? configured
    : SPRING_BACKEND_BASE_URL);
}

/**
 * 根据初始地址推断当前应该默认选中哪个后端预设。
 */
function resolveInitialBackendPreset(baseUrl: string): LangChainDemoBackendPreset {
  if (baseUrl === SPRING_BACKEND_BASE_URL) {
    return 'spring';
  }

  if (baseUrl === FASTAPI_BACKEND_BASE_URL) {
    return 'fastapi';
  }

  return 'custom';
}

/**
 * 根据当前预设和自定义地址，解析最终要连接的后端根地址。
 */
function resolveSelectedBackendBaseUrl(
  preset: LangChainDemoBackendPreset,
  customBaseUrl: string
): string {
  if (preset === 'spring') {
    return SPRING_BACKEND_BASE_URL;
  }

  if (preset === 'fastapi') {
    return FASTAPI_BACKEND_BASE_URL;
  }

  return trimTrailingSlash(customBaseUrl);
}

/**
 * 按统一规则拼出真实 LangChain SSE endpoint。
 */
function buildLangChainEndpoint(baseUrl: string): string {
  return `${trimTrailingSlash(baseUrl)}/api/stream/langchain`;
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
 * 把当前准备提交给 LangChain 的自定义 resume payload 转成便于阅读的 JSON。
 */
function updateHitlPayloadPreview(payload: Record<string, unknown>): void {
  hitlPayloadPreview.value = JSON.stringify(payload, null, 2);
}

/**
 * 在切换后端时重置 demo 状态，避免把旧 sessionId 带到新后端。
 */
function resetHitlDemoState(): void {
  hitlStatus.value = '尚未触发自定义 HITL 逻辑';
  hitlPayloadPreview.value = '尚未提交自定义 interrupt payload';
  hitlTrace.value = [];
}

const prompt = ref(DEFAULT_PROMPT);
const configuredBackendBaseUrl = resolveConfiguredBackendBaseUrl();
const backendPreset = ref<LangChainDemoBackendPreset>(
  resolveInitialBackendPreset(configuredBackendBaseUrl)
);
const customBackendBaseUrl = ref(configuredBackendBaseUrl);
const backendBaseUrl = computed(() => resolveSelectedBackendBaseUrl(
  backendPreset.value,
  customBackendBaseUrl.value
));
const endpoint = computed(() => buildLangChainEndpoint(backendBaseUrl.value));

const {
  runtime,
  surface,
  send,
  busy,
  statusLabel,
  transportError,
  sessionId: backendSessionId,
  reset
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

let hasInitializedBackendWatcher = false;

watch(backendBaseUrl, () => {
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
      <h1>LangChain 真实 SSE</h1>
      <p>这个页面会直接请求真实 `/api/stream/langchain`。现在默认优先接 Spring Boot 版 LangChain backend，你也可以切回 FastAPI。demo 会完整演示 LangChain interrupt 的 approve / edit / reject 接入方式，其中“需修改”已经改成提交官方 `edit` 决策，而不是只传一段文本说明。</p>
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

      <div class="demo-form__backend-panel">
        <span class="demo-form__label demo-form__label--inline">后端</span>

        <div class="demo-form__backend-switch">
          <button
            type="button"
            class="demo-form__backend-button"
            :data-active="backendPreset === 'spring'"
            @click="backendPreset = 'spring'"
          >
            Spring Boot
          </button>

          <button
            type="button"
            class="demo-form__backend-button"
            :data-active="backendPreset === 'fastapi'"
            @click="backendPreset = 'fastapi'"
          >
            FastAPI
          </button>

          <button
            type="button"
            class="demo-form__backend-button"
            :data-active="backendPreset === 'custom'"
            @click="backendPreset = 'custom'"
          >
            自定义
          </button>
        </div>
      </div>

      <input
        v-if="backendPreset === 'custom'"
        v-model="customBackendBaseUrl"
        class="demo-form__input demo-form__input--single-line"
        type="text"
        placeholder="http://127.0.0.1:8080"
      >

      <div class="demo-form__backend-panel">
        <label
          class="demo-form__label demo-form__label--inline"
          for="langchain-edited-city"
        >
          需修改时改成城市
        </label>

        <input
          id="langchain-edited-city"
          v-model="editedCity"
          class="demo-form__input demo-form__input--single-line"
          type="text"
          placeholder="上海"
        >
      </div>

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
          <p>approve 会沿用默认 official decision；changes_requested 会提交官方 `edit` 决策并真正改 tool args；reject 会把拒绝原因写回 `message`。</p>
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

.demo-form__label--inline {
  margin-bottom: 0;
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

.demo-form__input--single-line {
  min-height: 0;
  margin-top: 12px;
}

.demo-form__backend-panel {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.demo-form__backend-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.demo-form__backend-button {
  border: 1px solid #dbe3ee;
  background: #f8fafc;
  color: #334155;
  border-radius: 999px;
  padding: 8px 12px;
  font: inherit;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.demo-form__backend-button[data-active='true'] {
  background: #0f172a;
  border-color: #0f172a;
  color: #ffffff;
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
