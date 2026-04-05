<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  type AgentRuntime,
  type LangChainEvent,
  cmd,
  createSseTransport,
  defineLangChainToolComponents,
  defineLangChainPreset,
  RunSurface,
  useBridgeTransport
} from '../../index';
import MessageLoadingBubble from '../components/MessageLoadingBubble.vue';
import WeatherToolCard from '../components/WeatherToolCard.vue';

const DEFAULT_PROMPT = '帮我查一下北京天气，并说明工具调用过程。';
const USER_GROUP_ID = 'turn:user:langchain-weather';

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
 * 预先插入一条用户消息，方便观察 assistant 回复和工具卡片。
 */
function seedConversation(input: string, runtime: AgentRuntime) {
  runtime.apply(cmd.message.text({
    id: 'block:user:langchain-weather',
    role: 'user',
    text: input,
    groupId: USER_GROUP_ID,
    at: Date.now()
  }));
}

const prompt = ref(DEFAULT_PROMPT);
const endpoint = buildLangChainEndpoint();
const langChainTools = defineLangChainToolComponents({
  'tool.weather': {
    match: ['weather', '天气'],
    mode: 'includes',
    component: WeatherToolCard
  }
});

const langChainPreset = defineLangChainPreset<string>({
  protocolOptions: {
    defaultRunTitle: 'LangChain 助手',
    toolRenderer: langChainTools.toolRenderer
  },
  surface: {
    draftPlaceholder: {
      component: MessageLoadingBubble,
      props: {
        label: 'LangChain 正在思考'
      }
    },
    renderers: langChainTools.renderers
  }
});

const { runtime, bridge, surface } = langChainPreset.createSession({
  bridge: {
    transport: createSseTransport<LangChainEvent, string>({
      mode: 'json',
      init() {
        return {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: prompt.value
          })
        };
      }
    })
  }
});

const {
  start,
  stop,
  reset,
  status,
  error
} = useBridgeTransport({
  bridge,
  source: endpoint
});

/**
 * 生成当前 bridge 状态对应的简短文案。
 */
const statusLabel = computed(() => {
  switch (status.value.phase) {
    case 'consuming':
      return '连接中';
    case 'errored':
      return '连接失败';
    case 'closed':
      return '已关闭';
    default:
      return '待命';
  }
});

/**
 * 判断当前是否仍在消费 SSE 数据流。
 */
const busy = computed(() => status.value.phase === 'consuming');

/**
 * 提取页面需要展示的 transport 错误文案。
 */
const transportError = computed(() => error.value?.message ?? '');

/**
 * 重置当前会话，并重新连接真实 LangChain backend。
 */
async function replayDemo() {
  stop();
  reset();
  seedConversation(prompt.value, runtime);
  await start();
}

onMounted(() => {
  replayDemo().catch(() => {
    // demo 页面里失败只需要保持当前状态，不需要再额外抛错。
  });
});
</script>

<template>
  <section class="demo-page">
    <header class="demo-page__header">
      <h1>LangChain 真实 SSE</h1>
      <p>启动 FastAPI backend 后，这个页面会直接请求真实 `/api/stream/langchain`，然后用 `defineLangChainPreset()` 把官方 `astream_events()` 渲染成聊天内容和工具组件。</p>
    </header>

    <form
      class="demo-form"
      @submit.prevent="replayDemo().catch(() => {})"
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
  font: inherit;
  color: #0f172a;
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
