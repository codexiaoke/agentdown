<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import {
  AgentChatWorkspace,
  createAgentChatComposerSendPayload,
  type AgentChatComposerSendPayload,
  type AgentChatPendingAttachment,
  type AgentChatUploadResolver,
  type AgentChatUploadResolverResult,
  useAgentChat
} from '../index';
import DemoWeatherCard from './components/DemoWeatherCard.vue';

const FASTAPI_BASE_URL = resolveConfiguredBaseUrl('http://127.0.0.1:8000');
const suggestions = [
  '用两句话解释 AG-UI 是什么，不需要界面组件',
  '使用这些数据回答天气：深圳，26°C，多云，湿度 72%，风速 3.2m/s',
  '为《Designing Data-Intensive Applications》生成一个可调整并提交的读书计划'
];

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveConfiguredBaseUrl(fallback: string): string {
  const configured = import.meta.env.VITE_AGENTDOWN_API_BASE;
  return trimTrailingSlash(configured && configured.length > 0 ? configured : fallback);
}

const prompt = ref('');
const pendingUploads = ref<AgentChatPendingAttachment[]>([]);
const objectUrls = new Set<string>();

const session = useAgentChat<string>({
  source: `${FASTAPI_BASE_URL}/api/stream/chat`,
  input: prompt,
  conversationId: 'session:demo:agentdown-chat',
  title: 'Agentdown Chat',
  recovery: {},
  components: {
    weather_card: {
      component: DemoWeatherCard,
      description: '展示一座城市的天气结果。仅当对话已有可信的城市、温度、天气状况、湿度和风速数据时使用。',
      propsSchema: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名称' },
          temperature: { type: 'number', description: '摄氏温度' },
          condition: { type: 'string', description: '天气状况' },
          humidity: { type: 'number', description: '湿度百分比' },
          windSpeed: { type: 'number', description: '风速，单位 m/s' }
        },
        required: ['city', 'temperature', 'condition', 'humidity', 'windSpeed'],
        additionalProperties: false
      }
    }
  },
  transport: {
    state: { client: 'agentdown-demo', a2uiVersion: 'v0.9.1' }
  }
});

const composerDisabled = computed(() => session.busy.value || session.awaitingHumanInput.value);
const composerPlaceholder = computed(() => {
  if (session.awaitingHumanInput.value) return '请先处理对话中的动态界面';
  if (session.busy.value) return 'Agentdown Chat 正在回答...';
  return '发送消息；Agent 会自行选择文本、前端组件或 A2UI';
});

const uploadFile: AgentChatUploadResolver = async (
  file: File,
  context: Parameters<AgentChatUploadResolver>[1]
): Promise<AgentChatUploadResolverResult> => ({
  fileId: `demo-file:${Date.now()}:${file.name}:${file.size}`,
  href: context.localObjectUrl,
  ...(context.attachmentKind === 'image' ? { previewSrc: context.localObjectUrl } : {})
});

function handleUploadResolved(attachment: AgentChatPendingAttachment): void {
  if (attachment.localObjectUrl) objectUrls.add(attachment.localObjectUrl);
}

async function sendMessage(payload: AgentChatComposerSendPayload): Promise<void> {
  if (composerDisabled.value || (payload.text.length === 0 && payload.attachments.length === 0)) return;

  const previousPrompt = payload.text;
  const previousUploads = [...payload.attachments];
  prompt.value = '';
  pendingUploads.value = [];

  try {
    await session.send(payload.input);
  } catch (error) {
    prompt.value = previousPrompt;
    pendingUploads.value = previousUploads;
    throw error;
  }
}

async function submitSuggestion(suggestion: string): Promise<void> {
  prompt.value = suggestion;
  await sendMessage(createAgentChatComposerSendPayload(suggestion, []));
}

function clearConversation(): void {
  session.reset();
  session.sessionId.value = '';
  session.lastInput.value = '';
  prompt.value = '';
  pendingUploads.value = [];
}

onBeforeUnmount(() => {
  for (const objectUrl of objectUrls) URL.revokeObjectURL(objectUrl);
  objectUrls.clear();
});
</script>

<template>
  <div class="demo-app">
    <aside class="demo-sidebar">
      <div class="demo-brand">
        <div class="demo-brand__logo">A</div>

        <div class="demo-brand__copy">
          <strong>Agentdown Chat</strong>
          <span>一个入口，三种回答形式</span>
        </div>
      </div>

      <button type="button" class="demo-reset" @click="clearConversation">
        新建聊天
      </button>

      <section class="demo-section">
        <h2>统一聊天流</h2>

        <div class="demo-stream">
          <strong>POST /api/stream/chat</strong>
          <p>AG-UI 负责传输事件，Agent 根据问题直接返回文字、选择前端注册组件，或生成动态 A2UI。</p>
        </div>
      </section>

      <section class="demo-section">
        <h2>回答形式</h2>

        <div class="demo-modes">
          <div><strong>普通文本</strong><span>解释和自然语言回答</span></div>
          <div><strong>WeatherCard</strong><span>前端拥有并注册的固定组件</span></div>
          <div><strong>动态 A2UI</strong><span>固定组件无法表达的交互界面</span></div>
        </div>
      </section>

      <section class="demo-section demo-section--grow">
        <h2>快捷测试</h2>

        <div class="demo-prompts">
          <button
            v-for="suggestion in suggestions"
            :key="suggestion"
            type="button"
            :disabled="composerDisabled"
            @click="submitSuggestion(suggestion).catch(() => {})"
          >
            {{ suggestion }}
          </button>
        </div>
      </section>
    </aside>

    <main class="demo-stage">
      <AgentChatWorkspace
        v-model="prompt"
        v-model:uploads="pendingUploads"
        :runtime="session.runtime"
        :surface="session.surface.value"
        :busy="session.busy.value"
        :awaiting-human-input="session.awaitingHumanInput.value"
        :transport-error="session.transportError.value"
        :placeholder="composerPlaceholder"
        empty-title="今天想让 Agent 做什么？"
        :suggestions="suggestions"
        :upload-file="uploadFile"
        @send="sendMessage($event).catch(() => {})"
        @suggestion-click="submitSuggestion($event).catch(() => {})"
        @upload-resolved="handleUploadResolved"
      >
        <template #header>
          <div class="demo-header">
            <div>
              <strong>Agentdown Chat</strong>
              <span>文本 · 前端组件 · A2UI</span>
            </div>

            <button type="button" @click="clearConversation">新建聊天</button>
          </div>
        </template>

        <template #empty>
          <div class="demo-empty">
            <div class="demo-empty__copy">
              <h1>同一个聊天接口，自然选择最合适的 UI</h1>
              <p>前端只注册可信组件；Agent 返回组件名和 props，不返回 Vue、HTML 或 JavaScript。</p>
            </div>

            <div class="demo-empty__suggestions">
              <button
                v-for="suggestion in suggestions"
                :key="suggestion"
                type="button"
                @click="submitSuggestion(suggestion).catch(() => {})"
              >
                {{ suggestion }}
              </button>
            </div>
          </div>
        </template>

        <template #notice="{ transportError, awaitingHumanInput }">
          <div v-if="transportError.trim().length > 0" class="demo-notice demo-notice--error">
            {{ transportError }}
          </div>
          <div v-else-if="awaitingHumanInput" class="demo-notice">
            请先完成当前动态界面操作
          </div>
        </template>
      </AgentChatWorkspace>
    </main>
  </div>
</template>

<style scoped>
:global(html),
:global(body),
:global(#app) {
  width: 100%;
  height: 100vh;
  margin: 0;
  overflow: hidden;
}

.demo-app {
  display: grid;
  width: 100%;
  height: 100vh;
  grid-template-columns: 290px minmax(0, 1fr);
  background: linear-gradient(180deg, #fbfbfc 0%, #f7f7f8 100%);
  color: #111827;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;
  overflow: hidden;
}

.demo-sidebar {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 1.1rem;
  padding: 1rem 0.85rem;
  border-right: 1px solid rgba(15, 23, 42, 0.07);
  background: rgba(247, 247, 248, 0.92);
  overflow-y: auto;
}

.demo-brand,
.demo-header,
.demo-header > div {
  display: flex;
  align-items: center;
}

.demo-brand {
  gap: 0.75rem;
}

.demo-brand__logo {
  display: grid;
  width: 2.2rem;
  height: 2.2rem;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 999px;
  background: #111827;
  color: white;
  font-weight: 800;
}

.demo-brand__copy,
.demo-header > div,
.demo-modes > div {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
}

.demo-brand__copy span,
.demo-header span,
.demo-modes span {
  color: #6b7280;
  font-size: 0.78rem;
}

.demo-reset,
.demo-header button,
.demo-prompts button,
.demo-empty__suggestions button {
  border: 1px solid rgba(15, 23, 42, 0.09);
  background: rgba(255, 255, 255, 0.9);
  color: #111827;
  font: inherit;
  cursor: pointer;
}

.demo-reset,
.demo-header button {
  border-radius: 999px;
  padding: 0.62rem 0.9rem;
  font-size: 0.84rem;
  font-weight: 650;
}

.demo-section {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.demo-section--grow {
  flex: 1;
}

.demo-section h2 {
  margin: 0;
  color: #6b7280;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.demo-stream,
.demo-modes {
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 18px;
  padding: 0.85rem;
  background: rgba(255, 255, 255, 0.86);
}

.demo-stream strong,
.demo-modes strong {
  font-size: 0.84rem;
}

.demo-stream p {
  margin: 0.45rem 0 0;
  color: #6b7280;
  font-size: 0.78rem;
  line-height: 1.55;
}

.demo-modes,
.demo-prompts {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.demo-prompts button,
.demo-empty__suggestions button {
  border-radius: 18px;
  padding: 0.8rem 0.9rem;
  font-size: 0.82rem;
  line-height: 1.5;
  text-align: left;
}

.demo-prompts button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.demo-stage {
  min-width: 0;
  min-height: 0;
}

.demo-header {
  justify-content: space-between;
  gap: 1rem;
}

.demo-header button {
  display: none;
}

.demo-empty {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.4rem;
  padding: 2rem;
  box-sizing: border-box;
}

.demo-empty__copy {
  max-width: 700px;
  text-align: center;
}

.demo-empty h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3rem);
  letter-spacing: -0.05em;
}

.demo-empty p {
  margin: 0.7rem 0 0;
  color: #6b7280;
  line-height: 1.65;
}

.demo-empty__suggestions {
  display: grid;
  width: min(100%, 800px);
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.demo-notice {
  width: min(100%, 720px);
  margin: 0 auto 1rem;
  border-radius: 16px;
  padding: 0.8rem 0.95rem;
  background: #f5f7fb;
  color: #475569;
}

.demo-notice--error {
  background: #fef2f2;
  color: #b91c1c;
}

@media (max-width: 800px) {
  .demo-app {
    grid-template-columns: 1fr;
  }

  .demo-sidebar {
    display: none;
  }

  .demo-header button {
    display: inline-flex;
  }

  .demo-empty__suggestions {
    grid-template-columns: 1fr;
  }
}
</style>
