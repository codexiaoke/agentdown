<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import {
  type FrameworkChatInputValue,
  type FrameworkChatTransportContext,
  RunSurface,
  type MarkdownAttachmentKind,
  useAgnoChatSession,
  useAutoGenChatSession,
  useCrewAIChatSession,
  useLangChainChatSession,
  useSpringAiChatSession,
  type UseAgnoChatSessionResult
} from '../index';
import DemoThinkingBubble from './components/DemoThinkingBubble.vue';

type DemoFrameworkId = 'agno' | 'springai' | 'langchain' | 'autogen' | 'crewai';
type ProviderStatusTone = 'idle' | 'busy' | 'waiting' | 'error';

interface DemoChatSessionLike extends Pick<
  UseAgnoChatSessionResult<string>,
  | 'awaitingHumanInput'
  | 'busy'
  | 'lastInput'
  | 'regenerate'
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
  session: DemoChatSessionLike;
}

interface DemoPendingUpload {
  id: string;
  fileId: string;
  name: string;
  size: number;
  sizeText: string;
  mimeType: string;
  attachmentKind: MarkdownAttachmentKind;
  href: string;
  localObjectUrl: string;
  previewSrc?: string;
}

interface DemoUploadResolverContext {
  providerId: DemoFrameworkId;
  localObjectUrl: string;
}

interface DemoUploadResolverResult {
  fileId: string;
  href?: string;
  previewSrc?: string;
}

type DemoUploadResolver = (
  file: File,
  context: DemoUploadResolverContext
) => Promise<DemoUploadResolverResult> | DemoUploadResolverResult;

const FASTAPI_BASE_URL = resolveConfiguredBaseUrl('http://127.0.0.1:8000');
const SPRING_BASE_URL = resolveConfiguredBaseUrl('http://127.0.0.1:8080');
const DEFAULT_EDITED_CITY = '上海';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveConfiguredBaseUrl(fallback: string): string {
  const configured = import.meta.env.VITE_AGENTDOWN_API_BASE;

  return trimTrailingSlash(
    configured && configured.length > 0
      ? configured
      : fallback
  );
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

    return typeof block.attachmentId === 'string' && block.attachmentId.length > 0
      ? [block.attachmentId]
      : [];
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

const agnoPrompt = ref('');
const springAiPrompt = ref('');
const langChainPrompt = ref('');
const autoGenPrompt = ref('');
const crewAiPrompt = ref('');
const agnoPendingUploads = ref<DemoPendingUpload[]>([]);
const springAiPendingUploads = ref<DemoPendingUpload[]>([]);
const langChainPendingUploads = ref<DemoPendingUpload[]>([]);
const autoGenPendingUploads = ref<DemoPendingUpload[]>([]);
const crewAiPendingUploads = ref<DemoPendingUpload[]>([]);

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
  surface: createThinkingPlaceholder('Agno 正在思考')
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
const promptByProvider: Record<DemoFrameworkId, Ref<string>> = {
  agno: agnoPrompt,
  springai: springAiPrompt,
  langchain: langChainPrompt,
  autogen: autoGenPrompt,
  crewai: crewAiPrompt
};
const pendingUploadsByProvider: Record<DemoFrameworkId, Ref<DemoPendingUpload[]>> = {
  agno: agnoPendingUploads,
  springai: springAiPendingUploads,
  langchain: langChainPendingUploads,
  autogen: autoGenPendingUploads,
  crewai: crewAiPendingUploads
};
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
    session: crewAiSession
  }
};

const providerOrder: DemoFrameworkId[] = [
  'agno',
  'springai',
  'langchain',
  'autogen',
  'crewai'
];

const providers = computed(() => {
  return providerOrder.map((providerId) => providerStateMap[providerId]);
});

const activeProvider = computed(() => {
  return providerStateMap[currentProviderId.value];
});

const activeSurface = computed(() => activeProvider.value.session.surface.value);
const activeRuntime = computed(() => activeProvider.value.session.runtime);
const activePendingUploads = computed(() => {
  return pendingUploadsByProvider[currentProviderId.value].value;
});
const activePrompt = computed({
  get: () => promptByProvider[currentProviderId.value].value,
  set: (value: string) => {
    promptByProvider[currentProviderId.value].value = value;
  }
});

const hasConversation = computed(() => {
  return activeProvider.value.session.runtimeState.blocks.value.length > 0;
});

const composerDisabled = computed(() => {
  return activeProvider.value.session.busy.value
    || activeProvider.value.session.awaitingHumanInput.value;
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

const sendLabel = computed(() => {
  if (activeProvider.value.session.awaitingHumanInput.value) {
    return '等待确认';
  }

  if (activeProvider.value.session.busy.value) {
    return '发送中...';
  }

  return '发送';
});

const composerInputRef = ref<HTMLTextAreaElement | null>(null);
const composerFileInputRef = ref<HTMLInputElement | null>(null);
const COMPOSER_MAX_HEIGHT = 220;

const uploadFileByProvider: Record<DemoFrameworkId, DemoUploadResolver> = {
  agno: resolveDemoUpload,
  springai: resolveDemoUpload,
  langchain: resolveDemoUpload,
  autogen: resolveDemoUpload,
  crewai: resolveDemoUpload
};

function createUploadId() {
  return `upload:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function formatFileSize(size: number): string {
  if (size >= 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${size} B`;
}

function inferAttachmentKind(file: File): MarkdownAttachmentKind {
  if (file.type.startsWith('image/')) {
    return 'image';
  }

  if (file.type.startsWith('audio/')) {
    return 'audio';
  }

  if (file.type.startsWith('video/')) {
    return 'video';
  }

  if (file.type === 'application/json' || file.name.toLowerCase().endsWith('.json')) {
    return 'json';
  }

  return 'file';
}

function buildUploadRequestText(prompt: string, uploads: DemoPendingUpload[]): string {
  const fileSummary = uploads.map((upload) => upload.name).join('、');

  if (prompt.length > 0) {
    return `${prompt}\n\n已上传文件：${fileSummary}`;
  }

  return `请先查看我上传的文件：${fileSummary}`;
}

function buildSendPayload(prompt: string, uploads: DemoPendingUpload[]): FrameworkChatInputValue {
  if (uploads.length === 0) {
    return prompt;
  }

  return {
    ...(prompt.length > 0 ? { text: prompt } : {}),
    requestText: buildUploadRequestText(prompt, uploads),
    blocks: uploads.map((upload) => ({
      kind: 'attachment' as const,
      title: upload.name,
      attachmentKind: upload.attachmentKind,
      attachmentId: upload.fileId,
      label: upload.name,
      href: upload.href,
      mimeType: upload.mimeType,
      sizeText: upload.sizeText,
      ...(upload.previewSrc ? { previewSrc: upload.previewSrc } : {})
    }))
  };
}

function revokeObjectUrl(providerId: DemoFrameworkId, objectUrl: string) {
  URL.revokeObjectURL(objectUrl);
  objectUrlsByProvider[providerId].delete(objectUrl);
}

function revokeProviderObjectUrls(providerId: DemoFrameworkId) {
  for (const objectUrl of objectUrlsByProvider[providerId]) {
    URL.revokeObjectURL(objectUrl);
  }

  objectUrlsByProvider[providerId].clear();
}

async function resolveDemoUpload(
  file: File,
  context: DemoUploadResolverContext
): Promise<DemoUploadResolverResult> {
  const stableSeed = `${Date.now()}:${Math.random().toString(36).slice(2, 8)}:${file.name}:${file.size}`;

  return {
    fileId: `demo-file:${stableSeed}`,
    href: context.localObjectUrl,
    ...(file.type.startsWith('image/')
      ? {
          previewSrc: context.localObjectUrl
        }
      : {})
  };
}

async function createPendingUpload(providerId: DemoFrameworkId, file: File): Promise<DemoPendingUpload> {
  const localObjectUrl = URL.createObjectURL(file);
  const attachmentKind = inferAttachmentKind(file);
  let resolvedUpload: DemoUploadResolverResult;

  try {
    resolvedUpload = await uploadFileByProvider[providerId](file, {
      providerId,
      localObjectUrl
    });
  } catch (error) {
    URL.revokeObjectURL(localObjectUrl);
    throw error;
  }

  if (typeof resolvedUpload.fileId !== 'string' || resolvedUpload.fileId.length === 0) {
    URL.revokeObjectURL(localObjectUrl);
    throw new Error('上传回调必须返回非空的 fileId。');
  }

  objectUrlsByProvider[providerId].add(localObjectUrl);

  return {
    id: createUploadId(),
    fileId: resolvedUpload.fileId,
    name: file.name,
    size: file.size,
    sizeText: formatFileSize(file.size),
    mimeType: file.type,
    attachmentKind,
    href: resolvedUpload.href ?? localObjectUrl,
    localObjectUrl,
    ...(resolvedUpload.previewSrc
      ? {
          previewSrc: resolvedUpload.previewSrc
        }
      : attachmentKind === 'image'
        ? {
            previewSrc: localObjectUrl
          }
        : {})
  };
}

function openFilePicker() {
  if (composerDisabled.value) {
    return;
  }

  composerFileInputRef.value?.click();
}

async function handleFileSelection(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const nextFiles = input?.files ? Array.from(input.files) : [];

  if (nextFiles.length === 0) {
    return;
  }

  const providerId = currentProviderId.value;
  const uploads = pendingUploadsByProvider[providerId];
  let createdUploads: DemoPendingUpload[];

  try {
    createdUploads = await Promise.all(
      nextFiles.map((file) => createPendingUpload(providerId, file))
    );
  } catch (error) {
    console.error('Failed to resolve uploaded files.', error);
    if (input) {
      input.value = '';
    }
    return;
  }

  uploads.value = [...uploads.value, ...createdUploads];

  if (input) {
    input.value = '';
  }

  nextTick(() => {
    resizeComposerInput();
    focusComposerInput();
  });
}

function removePendingUpload(uploadId: string) {
  const providerId = currentProviderId.value;
  const uploads = pendingUploadsByProvider[providerId];
  const target = uploads.value.find((upload) => upload.id === uploadId);

  if (!target) {
    return;
  }

  revokeObjectUrl(providerId, target.localObjectUrl);
  uploads.value = uploads.value.filter((upload) => upload.id !== uploadId);
}

function switchProvider(providerId: DemoFrameworkId) {
  currentProviderId.value = providerId;
}

function resolveProviderPreview(provider: DemoProviderState): string {
  if (provider.session.transportError.value.trim().length > 0) {
    return '连接失败';
  }

  if (provider.session.awaitingHumanInput.value) {
    return '等待人工确认';
  }

  if (provider.session.busy.value) {
    return '正在流式返回内容';
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

async function sendActiveMessage(nextText?: string): Promise<void> {
  const provider = activeProvider.value;
  const prompt = (nextText ?? provider.prompt.value).trim();
  const providerId = currentProviderId.value;
  const uploads = [...pendingUploadsByProvider[providerId].value];

  if ((prompt.length === 0 && uploads.length === 0) || composerDisabled.value) {
    return;
  }

  provider.prompt.value = '';
  pendingUploadsByProvider[providerId].value = [];
  resizeComposerInput();

  try {
    await provider.session.send(buildSendPayload(prompt, uploads));
  } catch (error) {
    provider.prompt.value = prompt;
    await nextTick();
    resizeComposerInput();
    throw error;
  }
}

async function submitSuggestion(suggestion: string): Promise<void> {
  activePrompt.value = suggestion;
  await sendActiveMessage(suggestion);
}

function clearActiveConversation() {
  const provider = activeProvider.value;
  const providerId = currentProviderId.value;

  provider.session.reset();
  provider.session.sessionId.value = '';
  provider.session.lastInput.value = '';
  provider.prompt.value = '';
  pendingUploadsByProvider[providerId].value = [];
  revokeProviderObjectUrls(providerId);
}

function focusComposerInput() {
  composerInputRef.value?.focus();
}

function resizeComposerInput() {
  const element = composerInputRef.value;

  if (!element) {
    return;
  }

  element.style.height = '0px';
  const nextHeight = Math.min(element.scrollHeight, COMPOSER_MAX_HEIGHT);
  element.style.height = `${Math.max(nextHeight, 24)}px`;
  element.style.overflowY = element.scrollHeight > COMPOSER_MAX_HEIGHT
    ? 'auto'
    : 'hidden';
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) {
    return;
  }

  event.preventDefault();
  sendActiveMessage().catch(() => {
    // 对话区会自行展示失败状态，demo 这里不额外抛错。
  });
}

watch(
  activePrompt,
  () => {
    nextTick(resizeComposerInput);
  },
  {
    flush: 'post'
  }
);

watch(
  currentProviderId,
  () => {
    nextTick(resizeComposerInput);
  },
  {
    flush: 'post'
  }
);

watch(
  composerInputRef,
  (element) => {
    if (!element) {
      return;
    }

    nextTick(resizeComposerInput);
  },
  {
    flush: 'post'
  }
);

onBeforeUnmount(() => {
  for (const providerId of providerOrder) {
    revokeProviderObjectUrls(providerId);
  }
});
</script>

<template>
  <div class="demo-app">
    <aside class="demo-app__sidebar">
      <div class="demo-app__sidebar-top">
        <div class="demo-app__brand">
          <div class="demo-app__brand-mark">
            <span />
          </div>

          <div>
            <p>Agentdown Demo</p>
            <h1>Chat</h1>
          </div>
        </div>

        <button
          type="button"
          class="demo-app__new-chat"
          @click="clearActiveConversation"
        >
          新建聊天
        </button>
      </div>

      <p class="demo-app__sidebar-label">适配器</p>

      <div class="demo-app__thread-list">
        <button
          v-for="provider in providers"
          :key="provider.id"
          type="button"
          class="demo-thread"
          :class="{ 'demo-thread--active': provider.id === activeProvider.id }"
          @click="switchProvider(provider.id)"
        >
          <span class="demo-thread__copy">
            <span class="demo-thread__title-row">
              <strong>{{ provider.label }}</strong>
              <em>{{ provider.subtitle }}</em>
            </span>
            <small>{{ resolveProviderPreview(provider) }}</small>
          </span>

          <span
            class="demo-thread__status"
            :data-tone="resolveProviderStatusTone(provider)"
          />
        </button>
      </div>
    </aside>

    <main class="demo-stage">
      <section class="demo-stage__body">
        <div
          v-if="activeProvider.session.transportError.value"
          class="demo-stage__notice demo-stage__notice--error"
        >
          {{ activeProvider.session.transportError.value }}
        </div>

        <div
          v-else-if="activeProvider.session.awaitingHumanInput.value"
          class="demo-stage__notice demo-stage__notice--waiting"
        >
          等待人工确认
        </div>

        <div class="demo-stage__conversation">
          <div
            v-if="!hasConversation"
            class="demo-empty"
          >
            <div class="demo-empty__hero">
              <h3>今天想让 {{ activeProvider.label }} 做什么？</h3>
            </div>

            <div class="demo-empty__grid">
              <button
                v-for="suggestion in activeProvider.suggestions"
                :key="suggestion"
                type="button"
                class="demo-suggestion"
                @click="submitSuggestion(suggestion).catch(() => {})"
              >
                <span>{{ suggestion }}</span>
              </button>
            </div>
          </div>

          <div
            v-else
            class="demo-surface"
          >
            <RunSurface
              :runtime="activeRuntime"
              v-bind="activeSurface"
            />
          </div>
        </div>
      </section>

      <form
        class="demo-composer"
        @submit.prevent="sendActiveMessage().catch(() => {})"
      >
        <input
          ref="composerFileInputRef"
          type="file"
          hidden
          multiple
          @change="handleFileSelection"
        >

        <div class="demo-composer__bar">
          <button
            type="button"
            class="demo-composer__plus"
            :disabled="composerDisabled"
            title="添加文件"
            @click="openFilePicker"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.9"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>

          <div
            class="demo-composer__main"
            @click="focusComposerInput"
          >
            <div
              v-if="activePendingUploads.length > 0"
              class="demo-composer__uploads"
            >
              <div
                v-for="upload in activePendingUploads"
                :key="upload.id"
                class="demo-composer__upload"
              >
                <div class="demo-composer__upload-copy">
                  <strong :title="upload.name">{{ upload.name }}</strong>
                  <span>{{ upload.sizeText }}</span>
                </div>

                <button
                  type="button"
                  class="demo-composer__upload-remove"
                  title="移除文件"
                  @click.stop="removePendingUpload(upload.id)"
                >
                  ×
                </button>
              </div>
            </div>

            <textarea
              ref="composerInputRef"
              v-model="activePrompt"
              class="demo-composer__input"
              rows="1"
              :disabled="composerDisabled"
              :placeholder="composerPlaceholder"
              @input="resizeComposerInput"
              @keydown="handleComposerKeydown"
            />
          </div>

          <button
            type="submit"
            class="demo-composer__send"
            :disabled="composerDisabled || (activePrompt.trim().length === 0 && activePendingUploads.length === 0)"
            :title="sendLabel"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 17V7" />
              <path d="M8 11l4-4 4 4" />
            </svg>
          </button>
        </div>
      </form>
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
  --demo-font-sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Helvetica Neue', sans-serif;
  --demo-font-mono: ui-monospace, 'SFMono-Regular', 'JetBrains Mono', monospace;
  width: 100%;
  height: 100vh;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  background: #ffffff;
  color: #1f1f1f;
  font-family: var(--demo-font-sans);
  overflow: hidden;
}

.demo-app__sidebar {
  display: flex;
  height: 100vh;
  min-height: 0;
  flex-direction: column;
  gap: 0.72rem;
  padding: 0.8rem 0.75rem 0.75rem;
  border-right: 1px solid #ececf1;
  background: #f7f7f8;
  box-sizing: border-box;
  overflow: hidden;
}

.demo-app__sidebar-top {
  display: flex;
  flex-direction: column;
  gap: 0.72rem;
}

.demo-app__brand {
  display: flex;
  align-items: center;
  gap: 0.72rem;
  padding: 0.2rem 0.35rem 0.35rem;
}

.demo-app__brand-mark {
  display: inline-flex;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #111111;
}

.demo-app__brand-mark span {
  width: 0.42rem;
  height: 0.42rem;
  border-radius: 999px;
  background: #ffffff;
  animation: none;
}

.demo-app__brand p,
.demo-app__brand h1 {
  margin: 0;
}

.demo-app__brand p {
  color: #8b8b93;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.demo-app__brand h1 {
  margin-top: 0.12rem;
  font-size: 0.92rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.demo-app__new-chat {
  width: 100%;
  border: 1px solid #e5e5ea;
  border-radius: 0.95rem;
  padding: 0.8rem 0.9rem;
  background: #ffffff;
  color: #202123;
  font: inherit;
  font-size: 0.84rem;
  font-weight: 560;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    border-color 160ms ease;
}

.demo-app__new-chat:hover {
  border-color: #d8d8de;
  background: #fbfbfc;
}

.demo-app__sidebar-label {
  margin: 0;
  padding: 0 0.35rem;
  color: #8e8e96;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.demo-app__thread-list {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  gap: 0.22rem;
  overflow-y: auto;
}

.demo-thread {
  display: flex;
  width: 100%;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.78rem 0.78rem 0.82rem;
  border: none;
  border-radius: 1rem;
  background: transparent;
  text-align: left;
  color: inherit;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    box-shadow 160ms ease;
  box-sizing: border-box;
}

.demo-thread:hover {
  background: #efeff2;
}

.demo-thread--active {
  background: #ffffff;
  box-shadow: inset 0 0 0 1px #e6e6eb;
}

.demo-thread--active .demo-thread__copy strong {
  color: #171717;
}

.demo-thread--active .demo-thread__copy small {
  color: #6f6f77;
}

.demo-thread__copy {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.38rem;
}

.demo-thread__title-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.45rem;
}

.demo-thread__copy strong {
  font-size: 0.88rem;
  font-weight: 570;
  letter-spacing: -0.02em;
}

.demo-thread__title-row,
.demo-thread__copy small {
  overflow: hidden;
}

.demo-thread__title-row em {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 0.14rem 0.4rem;
  background: #f3f4f6;
  color: #888891;
  font-size: 0.62rem;
  font-style: normal;
  font-weight: 560;
  letter-spacing: 0.01em;
  box-shadow: inset 0 0 0 1px #e8e8ed;
}

.demo-thread__copy small {
  color: #8f8f98;
  font-size: 0.76rem;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demo-thread__status {
  width: 0.36rem;
  height: 0.36rem;
  flex-shrink: 0;
  margin-top: 0.38rem;
  border-radius: 999px;
  background: #c7c7cf;
}

.demo-thread__status[data-tone='busy'] {
  background: #10a37f;
  box-shadow: 0 0 0 0 rgba(16, 163, 127, 0.18);
  animation: demo-status-pulse 1.8s ease-in-out infinite;
}

.demo-thread__status[data-tone='waiting'] {
  background: #c28a17;
}

.demo-thread__status[data-tone='error'] {
  background: #d26a6a;
}

.demo-stage {
  display: flex;
  min-width: 0;
  height: 100vh;
  min-height: 0;
  flex-direction: column;
  padding: 0;
  background: #ffffff;
  overflow: hidden;
}

.demo-stage__body,
.demo-composer {
  margin: 0 auto;
  width: min(100%, 880px);
}

.demo-stage__body {
  flex: 1 1 auto;
  display: flex;
  min-height: 0;
  flex-direction: column;
  border: none;
  border-radius: 0;
  background: #ffffff;
  box-shadow: none;
  overflow: hidden;
  width: min(100%, 880px);
  box-sizing: border-box;
}

.demo-stage__notice {
  margin: 0.9rem 0 0;
  border-radius: 0.9rem;
  padding: 0.8rem 0.92rem;
  font-size: 0.82rem;
  line-height: 1.6;
}

.demo-stage__notice--error {
  background: #fff6f6;
  color: #b35f5f;
  box-shadow: inset 0 0 0 1px rgba(229, 162, 162, 0.28);
}

.demo-stage__notice--waiting {
  background: #faf6eb;
  color: #9a6d21;
  box-shadow: inset 0 0 0 1px rgba(224, 193, 122, 0.3);
}

.demo-stage__conversation {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 1.35rem 0 1.8rem;
}

.demo-empty {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  padding: 10vh 0 3rem;
  text-align: center;
}

.demo-empty__hero {
  max-width: 26rem;
  margin-bottom: 20px;
}

.demo-empty__hero h3 {
  margin: 0;
  font-size: clamp(1.75rem, 2.4vw, 2.45rem);
  font-weight: 580;
  letter-spacing: -0.05em;
  line-height: 1.04;
}

.demo-empty__grid {
  display: grid;
  width: min(100%, 44rem);
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.62rem;
}

.demo-suggestion {
  display: flex;
  min-height: 0;
  align-items: center;
  border: 1px solid #ebebef;
  border-radius: 1.15rem;
  padding: 0.5rem 0.7rem;
  background: #ffffff;
  text-align: left;
  color: #2e2e33;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    transform 160ms ease;
}

.demo-suggestion:hover {
  border-color: #d9d9df;
  background: #f9f9fa;
  transform: translateY(-1px);
}

.demo-suggestion span:last-child {
  font-size: 0.84rem;
  line-height: 1.52;
  color: #4b5563;
}

.demo-surface {
  min-height: 100%;
  padding: 0.35rem 0 1rem;
}

.demo-composer {
  margin-top: auto;
  margin-bottom: 1rem;
  padding: 0 0 0.1rem;
  background: transparent;
  box-shadow: none;
  flex-shrink: 0;
  box-sizing: border-box;
}

.demo-composer__bar {
  display: flex;
  min-height: 3.5rem;
  align-items: flex-end;
  gap: 0.55rem;
  padding: 0.72rem 0.78rem 0.72rem 0.74rem;
  border: 1px solid #e5e7eb;
  border-radius: 1.65rem;
  background: #ffffff;
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    0 10px 28px rgba(15, 23, 42, 0.06);
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
  box-sizing: border-box;
}

.demo-composer__bar:focus-within {
  border-color: #d8dbe2;
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.05),
    0 14px 30px rgba(15, 23, 42, 0.08);
}

.demo-composer__plus,
.demo-composer__send {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  padding: 0;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    transform 160ms ease,
    box-shadow 160ms ease,
    opacity 160ms ease;
}

.demo-composer__plus {
  background: #f3f4f6;
  color: #6b7280;
}

.demo-composer__plus:hover:not(:disabled) {
  background: #eceef2;
  color: #26272b;
}

.demo-composer__plus svg,
.demo-composer__send svg {
  width: 1rem;
  height: 1rem;
}

.demo-composer__plus:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.demo-composer__main {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: center;
  gap: 0.48rem;
  cursor: text;
}

.demo-composer__uploads {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.demo-composer__upload {
  display: inline-flex;
  min-width: 0;
  max-width: min(100%, 16rem);
  align-items: center;
  gap: 0.45rem;
  padding: 0.38rem 0.42rem 0.38rem 0.62rem;
  border: 1px solid #e7e9ee;
  border-radius: 0.95rem;
  background: #f8f9fb;
}

.demo-composer__upload-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.08rem;
}

.demo-composer__upload-copy strong,
.demo-composer__upload-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demo-composer__upload-copy strong {
  color: #27272a;
  font-size: 0.75rem;
  font-weight: 560;
}

.demo-composer__upload-copy span {
  color: #8b909a;
  font-size: 0.68rem;
}

.demo-composer__upload-remove {
  display: inline-flex;
  width: 1.35rem;
  height: 1.35rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  padding: 0;
  background: transparent;
  color: #7b818c;
  font: inherit;
  font-size: 0.94rem;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

.demo-composer__upload-remove:hover {
  background: #eceff3;
  color: #24262b;
}

.demo-composer__input {
  width: 100%;
  min-width: 0;
  min-height: 1.6rem;
  max-height: 220px;
  resize: none;
  border: none;
  margin: 0;
  padding: 0.43rem 0 0.35rem;
  background: transparent;
  color: #1f1f1f;
  font: inherit;
  font-size: 0.96rem;
  line-height: 1.6;
  outline: none;
  overflow-y: hidden;
  box-sizing: border-box;
}

.demo-composer__input::placeholder {
  color: #9a9aa3;
}

.demo-composer__input:disabled {
  cursor: not-allowed;
}

.demo-composer__send {
  background: #111111;
  color: #ffffff;
  box-shadow: 0 8px 18px rgba(17, 17, 17, 0.18);
}

.demo-composer__send:hover:not(:disabled) {
  background: #000000;
  transform: translateY(-1px);
}

.demo-composer__send:disabled {
  background: #ebedf0;
  color: #a0a4ab;
  cursor: not-allowed;
  box-shadow: none;
}

.demo-surface :deep(.agentdown-run-surface) {
  --agentdown-tool-surface-bg: #f7f7f8;
  --agentdown-tool-surface-border-color: #ececf1;
  --agentdown-tool-title-color: #3f3f46;
  --agentdown-tool-shimmer-color: rgba(255, 255, 255, 0.75);
  --agentdown-tool-status-pending-bg: #ffffff;
  --agentdown-tool-status-pending-color: #6b7280;
  --agentdown-tool-status-danger-bg: #fff4f4;
  --agentdown-tool-status-danger-color: #ba6868;
}

.demo-surface :deep(.agentdown-run-surface-list) {
  gap: 1.7rem;
}

.demo-surface :deep(.agentdown-run-surface-group-stack) {
  gap: 0.56rem;
}

.demo-surface :deep(.agentdown-run-surface-group[data-role='assistant']) {
  justify-content: flex-start;
}

.demo-surface :deep(.agentdown-run-surface-group[data-role='user']) {
  justify-content: flex-end;
}

.demo-surface :deep(.agentdown-run-surface-assistant-shell[data-variant='plain']),
.demo-surface :deep(.agentdown-run-surface-assistant-shell[data-variant='draft']) {
  max-width: min(100%, 768px);
}

.demo-surface :deep(.agentdown-run-surface-user-bubble[data-variant='bubble']) {
  border-radius: 1.2rem;
  padding: 0.76rem 0.96rem;
  background: #f4f4f4;
  box-shadow: none;
}

.demo-surface :deep(.agentdown-run-surface-message-actions) {
  margin-top: 0.28rem;
}

.demo-surface :deep(.agentdown-run-surface-message-action) {
  border: none;
  background: transparent;
  color: #7d7d86;
  box-shadow: none;
}

.demo-surface :deep(.agentdown-run-surface-message-action:hover:not(:disabled)) {
  background: #f4f4f5;
}

.demo-surface :deep(.agentdown-tool-renderer) {
  background: #f7f7f8;
  box-shadow: inset 0 0 0 1px #ececf1;
}

.demo-surface :deep(.agentdown-tool-renderer__icon-shell) {
  background: #ffffff;
  box-shadow: inset 0 0 0 1px #e5e7eb;
}

.demo-surface :deep(.agentdown-tool-renderer[data-running='true']::before) {
  opacity: 0.45;
}

.demo-surface :deep(.agentdown-approval-block),
.demo-surface :deep(.agentdown-handoff-block) {
  background: #fafafa;
  box-shadow: inset 0 0 0 1px #ececf1;
}

.demo-surface :deep(.agentdown-approval-action),
.demo-surface :deep(.agentdown-handoff-actions__button),
.demo-surface :deep(.agentdown-handoff-form__submit) {
  box-shadow: none;
}

.demo-surface :deep(.agentdown-approval-action:not([data-tone='primary']):not([data-tone='danger']):not([data-tone='warning']):hover:not(:disabled)),
.demo-surface :deep(.agentdown-handoff-actions__button:not([data-tone='primary']):hover:not(:disabled)),
.demo-surface :deep(.agentdown-handoff-form__submit:not([data-tone='primary']):hover:not(:disabled)) {
  background: #f3f4f6;
}

.demo-surface :deep(.agentdown-run-surface-markdown pre),
.demo-surface :deep(.agentdown-run-surface-markdown table) {
  width: fit-content;
  max-width: 100%;
}

.demo-surface :deep(.agentdown-run-surface-markdown pre) {
  border-radius: 0.9rem;
}

@keyframes demo-status-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(16, 163, 127, 0.22);
  }

  70% {
    box-shadow: 0 0 0 8px rgba(16, 163, 127, 0);
  }

  100% {
    box-shadow: 0 0 0 0 rgba(16, 163, 127, 0);
  }
}

@media (max-width: 1180px) {
  .demo-app {
    grid-template-columns: 1fr;
  }

  .demo-app__sidebar {
    height: auto;
    max-height: 36vh;
    border-right: none;
    border-bottom: 1px solid #ececf1;
  }

  .demo-app__thread-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .demo-stage {
    padding: 0;
  }

  .demo-stage__body,
  .demo-composer {
    width: 100%;
  }
}

@media (max-width: 680px) {
  .demo-app__thread-list {
    grid-template-columns: 1fr;
  }

  .demo-empty__grid {
    grid-template-columns: 1fr;
    width: 100%;
  }

  .demo-stage__conversation {
    padding-inline: 1rem;
  }

  .demo-composer {
    margin-inline: 1rem;
    margin-bottom: 1rem;
  }
}
</style>
