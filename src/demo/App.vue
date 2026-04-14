<script setup lang="ts">
import { computed, onBeforeUnmount, ref, type Ref } from 'vue';
import {
  AgentChatWorkspace,
  createAgentChatComposerSendPayload,
  restoreAgentdownRenderArchive,
  type AgentChatComposerSendPayload,
  type AgentChatPendingAttachment,
  type AgentChatUploadResolver,
  type AgentChatUploadResolverResult,
  type FrameworkChatTransportContext,
  useAgnoChatSession,
  useAutoGenChatSession,
  useCrewAIChatSession,
  useLangChainChatSession,
  useSpringAiChatSession,
  type UseAgnoChatSessionResult
} from '../index';
import DemoThinkingBubble from './components/DemoThinkingBubble.vue';
import {
  demoReplayPresetsByProvider,
  resolveDemoReplayPresetRecordsCount
} from './replayRecords.mock';
import type {
  DemoReplayPreset
} from './replayRecords.mock';

type DemoFrameworkId = 'agno' | 'springai' | 'langchain' | 'autogen' | 'crewai';
type ProviderStatusTone = 'idle' | 'busy' | 'waiting' | 'error';

interface DemoChatSessionLike extends Pick<
  UseAgnoChatSessionResult<string>,
  | 'awaitingHumanInput'
  | 'busy'
  | 'lastInput'
  | 'regenerate'
  | 'resolvingHumanInput'
  | 'reset'
  | 'runtime'
  | 'runtimeState'
  | 'send'
  | 'sessionId'
  | 'statusLabel'
  | 'surface'
  | 'transportError'
> {}

interface DemoProviderState {
  id: DemoFrameworkId;
  label: string;
  subtitle: string;
  suggestions: string[];
  prompt: Ref<string>;
  pendingUploads: Ref<AgentChatPendingAttachment[]>;
  session: DemoChatSessionLike;
}

interface DemoSidePanelSection {
  label: string;
  value: string;
}

interface DemoSidePanelState {
  title: string;
  summary: string;
  badge: string;
  sections: DemoSidePanelSection[];
}

const FASTAPI_BASE_URL = resolveConfiguredBaseUrl('http://127.0.0.1:8000');
const SPRING_BASE_URL = resolveConfiguredBaseUrl('http://127.0.0.1:8080');
const DEFAULT_EDITED_CITY = '上海';
const providerOrder: DemoFrameworkId[] = [
  'agno',
  'springai',
  'langchain',
  'autogen',
  'crewai'
];

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveConfiguredBaseUrl(fallback: string): string {
  const configured = import.meta.env.VITE_AGENTDOWN_API_BASE;

  if (configured && configured.length > 0) {
    return trimTrailingSlash(configured);
  }

  return trimTrailingSlash(fallback);
}

function createConversationId(provider: DemoFrameworkId): string {
  return `session:demo:chat:${provider}`;
}

function createThinkingPlaceholder(label: string) {
  return {
    draftPlaceholder: {
      component: DemoThinkingBubble,
      props: {
        label
      }
    }
  };
}

function resolveSubmissionFileIds(context: FrameworkChatTransportContext | undefined): string[] {
  const blocks = context?.submission?.blocks ?? [];

  return blocks.flatMap((block) => {
    if (block.kind !== 'attachment') {
      return [];
    }

    if (typeof block.attachmentId !== 'string' || block.attachmentId.length === 0) {
      return [];
    }

    return [block.attachmentId];
  });
}

function buildTransportFileBody(context: FrameworkChatTransportContext | undefined) {
  const fileIds = resolveSubmissionFileIds(context);

  if (fileIds.length === 0) {
    return undefined;
  }

  return {
    file_ids: fileIds
  };
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function isDemoFrameworkId(value: unknown): value is DemoFrameworkId {
  return value === 'agno'
    || value === 'springai'
    || value === 'langchain'
    || value === 'autogen'
    || value === 'crewai';
}

function resolveUploadProviderId(value: unknown): DemoFrameworkId | null {
  if (isDemoFrameworkId(value)) {
    return value;
  }

  const record = readRecord(value);
  const providerId = record?.providerId;

  if (!isDemoFrameworkId(providerId)) {
    return null;
  }

  return providerId;
}

const agnoPrompt = ref('');
const springAiPrompt = ref('');
const langChainPrompt = ref('');
const autoGenPrompt = ref('');
const crewAiPrompt = ref('');
const agnoPendingUploads = ref<AgentChatPendingAttachment[]>([]);
const springAiPendingUploads = ref<AgentChatPendingAttachment[]>([]);
const langChainPendingUploads = ref<AgentChatPendingAttachment[]>([]);
const autoGenPendingUploads = ref<AgentChatPendingAttachment[]>([]);
const crewAiPendingUploads = ref<AgentChatPendingAttachment[]>([]);

const agnoSession = useAgnoChatSession<string>({
  source: `${FASTAPI_BASE_URL}/api/stream/agno`,
  input: agnoPrompt,
  conversationId: createConversationId('agno'),
  mode: 'hitl',
  title: 'Agno',
  transport: {
    body: (_source, context) => buildTransportFileBody(context)
  },
  hitl: {
    handlers: {
      approve: async (context) => {
        await context.submit({
          ...context.defaultRequest,
          note: '请继续执行，并在最终回复里先总结结果。'
        });
      },
      reject: async (context) => {
        const note = context.reason?.trim() || '用户取消了这次工具执行。';

        await context.submit({
          ...context.defaultRequest,
          note
        });
      }
    }
  },
  // surface: createThinkingPlaceholder('Agno 正在思考')
});

const springAiSession = useSpringAiChatSession<string>({
  source: `${SPRING_BASE_URL}/api/stream/springai`,
  input: springAiPrompt,
  conversationId: createConversationId('springai'),
  mode: 'hitl',
  title: 'Spring AI',
  transport: {
    body: (_source, context) => buildTransportFileBody(context)
  },
  hitl: {
    handlers: {
      approve: async (context) => {
        await context.submitDecision();
      },
      changes_requested: async (context) => {
        const toolArgs = readRecord(context.target.toolArgs) ?? {};

        await context.submitDecision({
          type: 'edit',
          message: `请把城市改成 ${DEFAULT_EDITED_CITY}，并明确说明这次是人工修正后的执行。`,
          edited_action: {
            name: context.target.toolName || 'lookup_weather',
            args: {
              ...toolArgs,
              city: DEFAULT_EDITED_CITY
            }
          }
        });
      },
      reject: async (context) => {
        await context.submitDecision({
          type: 'reject',
          message: context.reason?.trim() || '这次先不要执行工具。'
        });
      }
    }
  },
  surface: createThinkingPlaceholder('Spring AI 正在思考')
});

const langChainSession = useLangChainChatSession<string>({
  source: `${FASTAPI_BASE_URL}/api/stream/langchain`,
  input: langChainPrompt,
  conversationId: createConversationId('langchain'),
  mode: 'hitl',
  title: 'LangChain',
  transport: {
    body: (_source, context) => buildTransportFileBody(context)
  },
  hitl: {
    handlers: {
      approve: async (context) => {
        await context.submitDecision();
      },
      changes_requested: async (context) => {
        const toolArgs = readRecord(context.target.toolArgs) ?? {};

        await context.submitDecision({
          type: 'edit',
          message: `请把工具参数里的城市修改成 ${DEFAULT_EDITED_CITY}。`,
          edited_action: {
            name: context.target.toolName || 'lookup_weather',
            args: {
              ...toolArgs,
              city: DEFAULT_EDITED_CITY
            }
          }
        });
      },
      reject: async (context) => {
        await context.submitDecision({
          ...context.defaultDecision,
          message: context.reason?.trim() || '这次先暂停工具执行。'
        });
      }
    }
  },
  surface: createThinkingPlaceholder('LangChain 正在思考')
});

const autoGenSession = useAutoGenChatSession<string>({
  source: `${FASTAPI_BASE_URL}/api/stream/autogen`,
  input: autoGenPrompt,
  conversationId: createConversationId('autogen'),
  mode: 'hitl',
  title: 'AutoGen',
  transport: {
    body: (_source, context) => buildTransportFileBody(context)
  },
  hitl: {
    handlers: {
      approve: async (context) => {
        await context.submit({
          ...context.defaultRequest,
          content: '请继续执行，并把最终答案整理成简洁结论。'
        });
      },
      reject: async (context) => {
        const reason = context.reason?.trim() || '用户这次不希望继续执行。';

        await context.submit({
          ...context.defaultRequest,
          content: `这次先不继续执行，原因：${reason}。请确认已停止当前任务。`
        });
      }
    }
  },
  surface: createThinkingPlaceholder('AutoGen 正在思考')
});

const crewAiSession = useCrewAIChatSession<string>({
  source: `${FASTAPI_BASE_URL}/api/stream/crewai`,
  input: crewAiPrompt,
  conversationId: createConversationId('crewai'),
  title: 'CrewAI',
  transport: {
    body: (_source, context) => buildTransportFileBody(context)
  },
  surface: createThinkingPlaceholder('CrewAI 正在思考')
});

const currentProviderId = ref<DemoFrameworkId>('agno');
const panelOpen = ref(false);
const panelState = ref<DemoSidePanelState | null>(null);

const objectUrlsByProvider: Record<DemoFrameworkId, Set<string>> = {
  agno: new Set<string>(),
  springai: new Set<string>(),
  langchain: new Set<string>(),
  autogen: new Set<string>(),
  crewai: new Set<string>()
};

const providerStateMap: Record<DemoFrameworkId, DemoProviderState> = {
  agno: {
    id: 'agno',
    label: 'Agno',
    subtitle: 'Approval',
    suggestions: [
      '帮我查一下北京今天天气',
      '帮我查一下上海天气，并说明工具调用过程',
      '先查一下深圳天气，结果要先给结论再解释过程'
    ],
    prompt: agnoPrompt,
    pendingUploads: agnoPendingUploads,
    session: agnoSession
  },
  springai: {
    id: 'springai',
    label: 'Spring AI',
    subtitle: 'Approval',
    suggestions: [
      '帮我查一下北京天气，并说明工具调用过程',
      '请查询杭州天气，等我确认后再继续执行',
      '查一下广州天气，如果工具需要执行先暂停让我决定'
    ],
    prompt: springAiPrompt,
    pendingUploads: springAiPendingUploads,
    session: springAiSession
  },
  langchain: {
    id: 'langchain',
    label: 'LangChain',
    subtitle: 'Interrupt',
    suggestions: [
      '帮我查一下北京天气，并说明工具调用过程',
      '查一下南京天气，如果要执行工具先让我确认',
      '请查询成都天气，如果参数不对我再手动改'
    ],
    prompt: langChainPrompt,
    pendingUploads: langChainPendingUploads,
    session: langChainSession
  },
  autogen: {
    id: 'autogen',
    label: 'AutoGen',
    subtitle: 'Handoff',
    suggestions: [
      '帮我查一下北京天气，并说明工具调用过程',
      '查询厦门天气，继续执行前先征求我的同意',
      '查一下苏州天气，并像一个多代理系统一样拆解过程'
    ],
    prompt: autoGenPrompt,
    pendingUploads: autoGenPendingUploads,
    session: autoGenSession
  },
  crewai: {
    id: 'crewai',
    label: 'CrewAI',
    subtitle: 'Streaming',
    suggestions: [
      '帮我查一下北京天气，并说明工具调用过程',
      '查一下武汉天气，尽量用更自然的流式回答方式',
      '请查询重庆天气，并补充这次工具执行过程'
    ],
    prompt: crewAiPrompt,
    pendingUploads: crewAiPendingUploads,
    session: crewAiSession
  }
};

const providers = computed(() => providerOrder.map((providerId) => providerStateMap[providerId]));
const activeProvider = computed(() => providerStateMap[currentProviderId.value]);
const activeSurface = computed(() => activeProvider.value.session.surface.value);
const activeRuntime = computed(() => activeProvider.value.session.runtime);
const activeReplayPresets = computed(() => demoReplayPresetsByProvider[currentProviderId.value]);
const composerDisabled = computed(() => {
  return activeProvider.value.session.busy.value || activeProvider.value.session.awaitingHumanInput.value;
});
const replayDisabled = computed(() => {
  return activeProvider.value.session.busy.value || activeProvider.value.session.resolvingHumanInput.value;
});
const replayingPresetId = ref<string | null>(null);

const activePrompt = computed({
  get: () => activeProvider.value.prompt.value,
  set: (value: string) => {
    activeProvider.value.prompt.value = value;
  }
});

const activeUploads = computed({
  get: () => activeProvider.value.pendingUploads.value,
  set: (value: AgentChatPendingAttachment[]) => {
    activeProvider.value.pendingUploads.value = value;
  }
});

const composerPlaceholder = computed(() => {
  if (activeProvider.value.session.awaitingHumanInput.value) {
    return '请先处理对话中的人工确认卡片';
  }

  if (activeProvider.value.session.busy.value) {
    return `${activeProvider.value.label} 正在返回内容...`;
  }

  return `问 ${activeProvider.value.label} 一个容易触发工具调用的问题`;
});

const emptyTitle = computed(() => {
  return `今天想让 ${activeProvider.value.label} 做什么？`;
});

const uploadFileByProvider: Record<DemoFrameworkId, AgentChatUploadResolver> = {
  agno: resolveDemoUpload,
  springai: resolveDemoUpload,
  langchain: resolveDemoUpload,
  autogen: resolveDemoUpload,
  crewai: resolveDemoUpload
};

function revokeProviderObjectUrls(providerId: DemoFrameworkId) {
  for (const objectUrl of objectUrlsByProvider[providerId]) {
    URL.revokeObjectURL(objectUrl);
  }

  objectUrlsByProvider[providerId].clear();
}

function trackProviderObjectUrl(providerId: DemoFrameworkId, objectUrl: string) {
  if (objectUrl.length === 0) {
    return;
  }

  objectUrlsByProvider[providerId].add(objectUrl);
}

async function resolveDemoUpload(
  file: File,
  context: Parameters<AgentChatUploadResolver>[1]
): Promise<AgentChatUploadResolverResult> {
  const providerId = resolveUploadProviderId(context.context);
  const stableSeed = `${Date.now()}:${Math.random().toString(36).slice(2, 8)}:${file.name}:${file.size}`;
  const scopedPrefix = providerId ? `${providerId}:` : '';

  return {
    fileId: `${scopedPrefix}demo-file:${stableSeed}`,
    href: context.localObjectUrl,
    ...(context.attachmentKind === 'image'
      ? {
          previewSrc: context.localObjectUrl
        }
      : {})
  };
}

function switchProvider(providerId: DemoFrameworkId) {
  currentProviderId.value = providerId;
}

function openDemoPanelForTest() {
  panelState.value = {
    title: '顺丰速运',
    summary: '这是一个 demo 面板示例。真实业务里，你可以在工具返回后把物流、订单、资料卡等详情放到这里。',
    badge: '运输中',
    sections: [
      {
        label: '运单号',
        value: 'SF1234567890'
      },
      {
        label: '最新节点',
        value: '上海转运中心已发出，正在前往杭州滨江网点'
      },
      {
        label: '预计送达',
        value: '明天 14:00 - 18:00'
      },
      {
        label: '收件信息',
        value: '杭州市滨江区演示路 88 号'
      }
    ]
  };
  panelOpen.value = true;
}

function handleUploadResolved(attachment: AgentChatPendingAttachment) {
  trackProviderObjectUrl(currentProviderId.value, attachment.localObjectUrl);
}

function resolveProviderPreview(provider: DemoProviderState): string {
  if (provider.session.transportError.value.trim().length > 0) {
    return '连接失败';
  }

  if (provider.session.awaitingHumanInput.value) {
    return '等待人工确认';
  }

  if (provider.session.busy.value) {
    return '正在流式返回';
  }

  if (provider.session.lastInput.value.trim().length > 0) {
    return provider.session.lastInput.value.trim();
  }

  return '点击开始';
}

function resolveProviderStatusTone(provider: DemoProviderState): ProviderStatusTone {
  if (provider.session.transportError.value.trim().length > 0) {
    return 'error';
  }

  if (provider.session.awaitingHumanInput.value) {
    return 'waiting';
  }

  if (provider.session.busy.value) {
    return 'busy';
  }

  return 'idle';
}

async function sendActiveMessage(payload: AgentChatComposerSendPayload): Promise<void> {
  if (composerDisabled.value) {
    return;
  }

  if (payload.text.length === 0 && payload.attachments.length === 0) {
    return;
  }

  const provider = activeProvider.value;
  const prompt = payload.text;
  const attachments = [...payload.attachments];
  const normalizedPrompt = prompt.trim().toLowerCase();

  if (normalizedPrompt === 'test') {
    openDemoPanelForTest();
  }

  provider.prompt.value = '';
  provider.pendingUploads.value = [];

  try {
    await provider.session.send(payload.input);
  } catch (error) {
    provider.prompt.value = prompt;
    provider.pendingUploads.value = attachments;
    throw error;
  }
}

async function submitSuggestion(suggestion: string): Promise<void> {
  activePrompt.value = suggestion;

  await sendActiveMessage(createAgentChatComposerSendPayload(suggestion, []));
}

function clearActiveConversation() {
  const provider = activeProvider.value;

  provider.session.reset();
  provider.session.sessionId.value = '';
  provider.session.lastInput.value = '';
  provider.prompt.value = '';
  provider.pendingUploads.value = [];
  panelOpen.value = false;
  panelState.value = null;
  revokeProviderObjectUrls(currentProviderId.value);
}

function loadReplayPreset(preset: DemoReplayPreset) {
  if (replayDisabled.value) {
    return;
  }

  const provider = activeProvider.value;
  replayingPresetId.value = preset.id;

  try {
    provider.session.reset();
    provider.prompt.value = '';
    provider.pendingUploads.value = [];
    provider.session.lastInput.value = '';
    provider.session.sessionId.value = '';
    panelOpen.value = false;
    panelState.value = null;
    revokeProviderObjectUrls(currentProviderId.value);

    const restored = restoreAgentdownRenderArchive(preset.archive);
    provider.session.runtime.apply(restored.commands);
    provider.session.sessionId.value = restored.metadata.sessionId;
    provider.session.lastInput.value = restored.lastUserMessage;
  } finally {
    replayingPresetId.value = null;
  }
}

onBeforeUnmount(() => {
  for (const providerId of providerOrder) {
    revokeProviderObjectUrls(providerId);
  }
});
</script>

<template>
  <div class="demo-app">
    <aside class="demo-sidebar">
      <div class="demo-sidebar__brand">
        <div class="demo-sidebar__logo">A</div>

        <div class="demo-sidebar__copy">
          <strong>Agentdown Demo</strong>
          <span>真实 SSE 适配器演示</span>
        </div>
      </div>

      <button
        type="button"
        class="demo-sidebar__reset"
        @click="clearActiveConversation"
      >
        新建聊天
      </button>

      <section class="demo-sidebar__section">
        <h2>适配器</h2>

        <div class="demo-sidebar__providers">
          <button
            v-for="provider in providers"
            :key="provider.id"
            type="button"
            class="demo-sidebar__provider"
            :class="{ 'demo-sidebar__provider--active': provider.id === activeProvider.id }"
            @click="switchProvider(provider.id)"
          >
            <div class="demo-sidebar__provider-top">
              <div class="demo-sidebar__provider-copy">
                <strong>{{ provider.label }}</strong>
                <span>{{ provider.subtitle }}</span>
              </div>

              <span
                class="demo-sidebar__provider-status"
                :data-tone="resolveProviderStatusTone(provider)"
              />
            </div>

            <small>{{ resolveProviderPreview(provider) }}</small>
          </button>
        </div>
      </section>

      <section class="demo-sidebar__section">
        <h2>回放 Records</h2>

        <div class="demo-sidebar__replays">
          <button
            v-for="preset in activeReplayPresets"
            :key="preset.id"
            type="button"
            class="demo-sidebar__replay"
            :disabled="replayDisabled"
            @click="loadReplayPreset(preset)"
          >
            <div class="demo-sidebar__replay-copy">
              <strong>{{ preset.label }}</strong>
              <span>{{ preset.description }}</span>
            </div>

            <small>
              {{ resolveDemoReplayPresetRecordsCount(preset) }} 条 records
              <span v-if="replayingPresetId === preset.id"> · 回放中</span>
            </small>
          </button>
        </div>
      </section>

      <section class="demo-sidebar__section demo-sidebar__section--grow">
        <h2>快捷提示</h2>

        <div class="demo-sidebar__prompts">
          <button
            v-for="suggestion in activeProvider.suggestions"
            :key="suggestion"
            type="button"
            class="demo-sidebar__prompt"
            @click="submitSuggestion(suggestion).catch(() => {})"
          >
            {{ suggestion }}
          </button>
        </div>
      </section>
    </aside>

    <main class="demo-stage">
      <AgentChatWorkspace
        v-model="activePrompt"
        v-model:uploads="activeUploads"
        v-model:panelOpen="panelOpen"
        :runtime="activeRuntime"
        :surface="activeSurface"
        :busy="activeProvider.session.busy.value"
        :awaiting-human-input="activeProvider.session.awaitingHumanInput.value"
        :transport-error="activeProvider.session.transportError.value"
        :placeholder="composerPlaceholder"
        :empty-title="emptyTitle"
        :suggestions="activeProvider.suggestions"
        :panel-title="panelState?.title ?? ''"
        :panel-width="380"
        :upload-file="uploadFileByProvider[currentProviderId]"
        :upload-context="{ providerId: currentProviderId }"
        @send="sendActiveMessage($event).catch(() => {})"
        @suggestion-click="submitSuggestion($event).catch(() => {})"
        @upload-resolved="handleUploadResolved"
      >
        <template #header>
          <div class="demo-header">
            <div class="demo-header__copy">
              <strong>{{ activeProvider.label }}</strong>
              <span>{{ activeProvider.subtitle }}</span>
            </div>

            <button
              type="button"
              class="demo-header__reset"
              @click="clearActiveConversation"
            >
              新建聊天
            </button>
          </div>
        </template>

        <template #empty>
          <div class="demo-empty">
            <div class="demo-empty__copy">
              <h2>{{ emptyTitle }}</h2>
              <p>{{ resolveProviderPreview(activeProvider) }}</p>
            </div>

            <div class="demo-empty__suggestions">
              <button
                v-for="suggestion in activeProvider.suggestions"
                :key="suggestion"
                type="button"
                class="demo-empty__suggestion"
                @click="submitSuggestion(suggestion).catch(() => {})"
              >
                {{ suggestion }}
              </button>
            </div>
          </div>
        </template>

        <template #notice="{ transportError, awaitingHumanInput }">
          <div
            v-if="transportError.trim().length > 0"
            class="demo-notice demo-notice--error"
          >
            {{ transportError }}
          </div>

          <div
            v-else-if="awaitingHumanInput"
            class="demo-notice demo-notice--waiting"
          >
            请先处理当前人工确认
          </div>
        </template>

        <template #panel>
          <div
            v-if="panelState"
            class="demo-panel"
          >
            <div class="demo-panel__hero">
              <span class="demo-panel__badge">{{ panelState.badge }}</span>
              <p>{{ panelState.summary }}</p>
            </div>

            <div class="demo-panel__sections">
              <div
                v-for="section in panelState.sections"
                :key="section.label"
                class="demo-panel__section"
              >
                <span>{{ section.label }}</span>
                <strong>{{ section.value }}</strong>
              </div>
            </div>
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
  width: 100%;
  height: 100vh;
  display: grid;
  grid-template-columns: 290px minmax(0, 1fr);
  background:
    radial-gradient(circle at top, rgba(244, 244, 245, 0.9), transparent 42%),
    linear-gradient(180deg, #fbfbfc 0%, #f7f7f8 100%);
  color: #111827;
  font-family:
    ui-sans-serif,
    -apple-system,
    BlinkMacSystemFont,
    'SF Pro Text',
    'PingFang SC',
    'Helvetica Neue',
    sans-serif;
  overflow: hidden;
}

.demo-sidebar {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem 0.85rem 0.9rem;
  border-right: 1px solid rgba(15, 23, 42, 0.06);
  background: rgba(247, 247, 248, 0.9);
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.demo-sidebar > * {
  flex-shrink: 0;
}

.demo-sidebar__brand {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.demo-sidebar__logo {
  display: flex;
  width: 2.15rem;
  height: 2.15rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #111827;
  color: #ffffff;
  font-size: 0.86rem;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.demo-sidebar__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.08rem;
}

.demo-sidebar__copy strong {
  color: #111827;
  font-size: 0.96rem;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.demo-sidebar__copy span {
  color: #6b7280;
  font-size: 0.78rem;
}

.demo-sidebar__reset {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 999px;
  padding: 0.62rem 0.9rem;
  background: rgba(255, 255, 255, 0.86);
  color: #111827;
  font: inherit;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
}

.demo-sidebar__reset:hover {
  background: #ffffff;
}

.demo-sidebar__section {
  display: flex;
  min-height: 0;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 0.72rem;
}

.demo-sidebar__section--grow {
  flex: 0 0 auto;
}

.demo-sidebar__section h2 {
  margin: 0;
  color: #6b7280;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.demo-sidebar__providers,
.demo-sidebar__prompts,
.demo-sidebar__replays {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 0.55rem;
}

.demo-sidebar__provider,
.demo-sidebar__prompt,
.demo-sidebar__replay {
  display: flex;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  gap: 0.35rem;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 18px;
  padding: 0.78rem 0.88rem;
  background: rgba(255, 255, 255, 0.86);
  color: #111827;
  font: inherit;
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}

.demo-sidebar__provider:hover,
.demo-sidebar__prompt:hover,
.demo-sidebar__replay:hover {
  border-color: rgba(15, 23, 42, 0.14);
  background: #ffffff;
  transform: translateY(-1px);
}

.demo-sidebar__replay:disabled {
  opacity: 0.58;
  cursor: not-allowed;
  transform: none;
}

.demo-sidebar__provider--active {
  border-color: rgba(15, 23, 42, 0.18);
  background: #ffffff;
}

.demo-sidebar__provider-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
}

.demo-sidebar__provider-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.08rem;
}

.demo-sidebar__provider-copy strong {
  color: #111827;
  font-size: 0.88rem;
  font-weight: 700;
}

.demo-sidebar__provider-copy span {
  color: #9ca3af;
  font-size: 0.72rem;
}

.demo-sidebar__provider small,
.demo-sidebar__prompt,
.demo-sidebar__replay span,
.demo-sidebar__replay small {
  color: #6b7280;
  font-size: 0.79rem;
  line-height: 1.45;
}

.demo-sidebar__provider small {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.demo-sidebar__replay-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.12rem;
}

.demo-sidebar__replay-copy strong {
  color: #111827;
  font-size: 0.86rem;
  font-weight: 700;
}

.demo-sidebar__provider-status {
  width: 0.54rem;
  height: 0.54rem;
  flex-shrink: 0;
  border-radius: 999px;
  background: #d1d5db;
}

.demo-sidebar__provider-status[data-tone='busy'] {
  background: #111827;
}

.demo-sidebar__provider-status[data-tone='waiting'] {
  background: #f59e0b;
}

.demo-sidebar__provider-status[data-tone='error'] {
  background: #ef4444;
}

.demo-stage {
  min-width: 0;
  min-height: 0;
}

.demo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.demo-header__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.08rem;
}

.demo-header__copy strong {
  color: #111827;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.demo-header__copy span {
  color: #6b7280;
  font-size: 0.82rem;
}

.demo-header__reset {
  display: none;
}

.demo-empty {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
  padding: 2rem 0 3rem;
  box-sizing: border-box;
}

.demo-empty__copy {
  display: flex;
  max-width: 720px;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  text-align: center;
}

.demo-empty__copy h2,
.demo-empty__copy p {
  margin: 0;
}

.demo-empty__copy h2 {
  color: #111827;
  font-size: clamp(2rem, 4vw, 2.9rem);
  font-weight: 700;
  letter-spacing: -0.05em;
}

.demo-empty__copy p {
  color: #6b7280;
  font-size: 0.94rem;
  line-height: 1.6;
}

.demo-empty__suggestions {
  display: grid;
  width: min(100%, 760px);
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
}

.demo-empty__suggestion {
  display: flex;
  min-height: 4.35rem;
  align-items: center;
  justify-content: flex-start;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 20px;
  padding: 0.95rem 1rem;
  background: rgba(255, 255, 255, 0.9);
  color: #1f2937;
  font: inherit;
  font-size: 0.92rem;
  line-height: 1.55;
  text-align: left;
  cursor: pointer;
  transition: border-color 160ms ease, transform 160ms ease, background 160ms ease;
}

.demo-empty__suggestion:hover {
  border-color: rgba(15, 23, 42, 0.16);
  background: #ffffff;
  transform: translateY(-1px);
}

.demo-panel {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  box-sizing: border-box;
}

.demo-panel__hero {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: 20px;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.9);
}

.demo-panel__hero p {
  margin: 0;
  color: #4b5563;
  font-size: 0.88rem;
  line-height: 1.6;
}

.demo-panel__badge {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0.36rem 0.68rem;
  background: #ecfdf3;
  color: #15803d;
  font-size: 0.75rem;
  font-weight: 700;
}

.demo-panel__sections {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.demo-panel__section {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
  padding-bottom: 0.75rem;
}

.demo-panel__section:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.demo-panel__section span {
  color: #9ca3af;
  font-size: 0.74rem;
  letter-spacing: 0.02em;
}

.demo-panel__section strong {
  color: #111827;
  font-size: 0.92rem;
  line-height: 1.55;
}

.demo-notice {
  width: min(100%, 720px);
  margin: 0 auto 1rem;
  border-radius: 16px;
  padding: 0.8rem 0.95rem;
  font-size: 0.9rem;
  line-height: 1.55;
}

.demo-notice--error {
  background: #fef2f2;
  color: #b91c1c;
}

.demo-notice--waiting {
  background: #f5f7fb;
  color: #475569;
}

@media (max-width: 720px) {
  .demo-app {
    grid-template-columns: 1fr;
  }

  .demo-sidebar {
    display: none;
  }

  .demo-empty__suggestions {
    grid-template-columns: 1fr;
  }

  .demo-empty__copy h2 {
    font-size: 1.85rem;
  }
}
</style>
