<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  type AgentRuntime,
  type AgnoEvent,
  type RunSurfaceMessageActionItem,
  type RunSurfaceMessageActionsRoleOptions,
  cmd,
  createAgnoAdapter,
  createAgnoSseTransport,
  defineAgnoToolComponents,
  eventToAction,
  RunSurface,
  useAdapterSession
} from '../../index';
import MessageLoadingBubble from '../components/MessageLoadingBubble.vue';
import WeatherToolCard from '../components/WeatherToolCard.vue';

const DEFAULT_PROMPT = '帮我查一下北京今天天气';
const DEMO_CONVERSATION_ID = 'session:demo:agno-weather';

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
 * 按统一规则拼出真实 Agno SSE endpoint。
 */
function buildAgnoEndpoint(): string {
  return `${resolveBackendBaseUrl()}/api/stream/agno`;
}

/**
 * 为当前这次演示生成一组新的聊天语义 id。
 */
function createChatIds() {
  const seed = Date.now();
  const turnId = `turn:demo:agno-weather:${seed}`;
  const userMessageId = `message:user:demo:agno-weather:${seed}`;
  const assistantMessageId = `message:assistant:demo:agno-weather:${seed}`;

  return {
    conversationId: DEMO_CONVERSATION_ID,
    turnId,
    userMessageId,
    assistantMessageId
  };
}

/**
 * 预先插入一条用户消息，方便观察 assistant 回复和工具卡片。
 */
function seedConversation(
  input: string,
  runtime: AgentRuntime,
  chatIds: ReturnType<typeof createChatIds>
) {
  runtime.apply(cmd.message.text({
    id: `block:${chatIds.userMessageId}:text`,
    role: 'user',
    text: input,
    conversationId: chatIds.conversationId,
    turnId: chatIds.turnId,
    messageId: chatIds.userMessageId,
    at: Date.now()
  }));
}

const prompt = ref(DEFAULT_PROMPT);
const endpoint = buildAgnoEndpoint();
const currentChatIds = ref(createChatIds());
const backendSessionId = ref('');
const agnoTools = defineAgnoToolComponents({
  'tool.weather': {
    match: ['weather', '天气'],
    mode: 'includes',
    component: WeatherToolCard
  }
});

/**
 * 这里演示“收到某个原始事件后做副作用”，而不是渲染 UI。
 *
 * 在真实项目里：
 * - 如果后端发 `CreateSession`
 * - 或 `SessionCreated`
 * - 或任何你们自己定义的事件名
 *
 * 都可以在这里监听，然后把 sessionId 存到外部状态里。
 */
const sessionActions = eventToAction<AgnoEvent>(
  {
    captureSession: {
      /**
       * 这个 demo 的 Agno 后端不会专门发 `CreateSession`，
       * 但事件里会携带 `session_id`，所以这里直接按字段存在与否拦截。
       *
       * 如果你的后端会发专门事件，也可以直接写：
       * on: 'CreateSession'
       */
      match: ({ event }) => {
        return typeof event.session_id === 'string' || typeof event.sessionId === 'string';
      },
      run: ({ event }) => {
        const sessionId = typeof event.session_id === 'string'
          ? event.session_id
          : typeof event.sessionId === 'string'
            ? event.sessionId
            : '';

        if (sessionId.length > 0) {
          backendSessionId.value = sessionId;
        }
      }
    }
  },
  {
    resolveEventName: (event) => event.event
  }
);

/**
 * 新写法里，Agno 的 protocol / assembler / surface 入口都收敛到 adapter。
 */
const agnoAdapter = createAgnoAdapter<string>({
  title: 'Agno 助手',
  protocolOptions: {
    /**
     * demo 里把 assistant 响应显式绑定到当前这一轮 turn 上，
     * 这样页面里的 user / assistant / tool 都能落进统一会话语义。
     */
    conversationId() {
      return currentChatIds.value.conversationId;
    },
    turnId() {
      return currentChatIds.value.turnId;
    },
    messageId() {
      return currentChatIds.value.assistantMessageId;
    }
  },
  tools: agnoTools,
  surface: {
    draftPlaceholder: {
      component: MessageLoadingBubble,
      props: {
        label: 'Agno 正在思考'
      }
    }
  }
});

const {
  runtime,
  surface,
  connect,
  disconnect,
  reset,
  status,
  error
} = useAdapterSession(agnoAdapter, {
  overrides: {
    source: endpoint,
    bridge: {
      hooks: sessionActions.hooks
    },
    /**
     * Agno helper 会自动补上 JSON SSE 常见配置：
     * - mode: 'json'
     * - POST
     * - application/json
     * - { message }
     */
    transport: createAgnoSseTransport<string>({
      message() {
        return prompt.value;
      }
    })
  }
});

/**
 * 给 demo 注入一层最终 surface 配置：
 * - 复制保留内置行为
 * - 重新生成真正触发一次新的后端请求
 * - 请求进行中禁用重新生成，避免重复提交
 */
const surfaceOptions = computed(() => {
  const assistantActions = surface.messageActions?.assistant;
  const actions: RunSurfaceMessageActionItem[] = [
    'copy',
    {
      key: 'regenerate',
      disabled: () => busy.value
    },
    'like',
    'dislike',
    'share'
  ];
  const resolvedAssistantActions: RunSurfaceMessageActionsRoleOptions | false = assistantActions === false
    ? false
    : {
        enabled: true,
        showOnDraft: false,
        showWhileRunning: false,
        ...(assistantActions ?? {}),
        actions,
        builtinHandlers: {
          ...(assistantActions?.builtinHandlers ?? {}),
          regenerate: async () => {
            await replayDemo();
          }
        }
      };

  return {
    ...surface,
    messageActions: {
      ...(surface.messageActions ?? {}),
      assistant: resolvedAssistantActions
    }
  };
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
 * 重置当前会话，并重新连接真实 Agno backend。
 */
async function replayDemo() {
  disconnect();
  reset();
  backendSessionId.value = '';
  currentChatIds.value = createChatIds();
  seedConversation(prompt.value, runtime, currentChatIds.value);
  await connect();
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
      <h1>Agno 真实 SSE</h1>
      <p>启动 FastAPI backend 后，这个页面会直接请求真实 `/api/stream/agno`，并使用 `createAgnoAdapter() + useAdapterSession()` 把官方事件映射成聊天 UI。</p>
    </header>

    <form
      class="demo-form"
      @submit.prevent="replayDemo().catch(() => {})"
    >
      <label
        class="demo-form__label"
        for="agno-prompt"
      >
        问题
      </label>

      <textarea
        id="agno-prompt"
        v-model="prompt"
        class="demo-form__input"
        rows="2"
        placeholder="帮我查一下北京今天天气"
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
      v-bind="surfaceOptions"
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
}
</style>
