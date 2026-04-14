<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  createAgentChatComposerSendPayload,
  createAgentChatPendingAttachment,
  inferAgentChatAttachmentKind,
  revokeAgentChatPendingAttachment,
  type AgentChatComposerSendPayload,
  type AgentChatPendingAttachment,
  type AgentChatUploadResolver
} from './agentChat';

interface Props {
  modelValue?: string;
  uploads?: AgentChatPendingAttachment[];
  busy?: boolean;
  awaitingHumanInput?: boolean;
  disabled?: boolean;
  placeholder?: string;
  disclaimer?: string | false;
  accept?: string;
  multiple?: boolean;
  uploadFile?: AgentChatUploadResolver | undefined;
  uploadContext?: unknown | undefined;
  maxHeight?: number;
  submitOnEnter?: boolean;
  showUploadButton?: boolean;
  showSendButton?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  uploads: () => [],
  busy: false,
  awaitingHumanInput: false,
  disabled: false,
  placeholder: '',
  disclaimer: 'AI 可能会出错，请核实重要信息。',
  accept: '',
  multiple: true,
  maxHeight: 220,
  submitOnEnter: true,
  showUploadButton: true,
  showSendButton: true
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:uploads': [value: AgentChatPendingAttachment[]];
  send: [payload: AgentChatComposerSendPayload];
  'upload-resolved': [attachment: AgentChatPendingAttachment];
  'upload-remove': [attachment: AgentChatPendingAttachment];
  'upload-error': [error: unknown];
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const resolvingUploads = ref(false);

const resolvedDisabled = computed(() => {
  if (props.disabled) {
    return true;
  }

  if (props.busy) {
    return true;
  }

  if (props.awaitingHumanInput) {
    return true;
  }

  return resolvingUploads.value;
});

const canSend = computed(() => {
  if (resolvedDisabled.value) {
    return false;
  }

  if (props.modelValue.trim().length > 0) {
    return true;
  }

  return props.uploads.length > 0;
});

const resolvedPlaceholder = computed(() => {
  if (props.placeholder.trim().length > 0) {
    return props.placeholder;
  }

  if (props.awaitingHumanInput) {
    return '请先处理对话中的人工确认';
  }

  if (resolvingUploads.value) {
    return '正在准备文件...';
  }

  if (props.busy) {
    return '正在生成回复...';
  }

  return '给智能体发送消息';
});

const sendTitle = computed(() => {
  if (props.awaitingHumanInput) {
    return '等待人工确认';
  }

  if (resolvingUploads.value) {
    return '正在处理文件';
  }

  if (props.busy) {
    return '发送中';
  }

  return '发送';
});

function focusInput() {
  textareaRef.value?.focus();
}

function resizeInput() {
  const element = textareaRef.value;

  if (!element) {
    return;
  }

  element.style.height = '0px';
  const nextHeight = Math.min(element.scrollHeight, props.maxHeight);
  element.style.height = `${Math.max(nextHeight, 24)}px`;

  if (element.scrollHeight > props.maxHeight) {
    element.style.overflowY = 'auto';
    return;
  }

  element.style.overflowY = 'hidden';
}

function openFilePicker() {
  if (resolvedDisabled.value) {
    return;
  }

  fileInputRef.value?.click();
}

async function resolveUpload(file: File): Promise<AgentChatPendingAttachment> {
  const localObjectUrl = URL.createObjectURL(file);
  const attachmentKind = inferAgentChatAttachmentKind(file);

  try {
    const result = props.uploadFile
      ? await props.uploadFile(file, {
          attachmentKind,
          localObjectUrl,
          context: props.uploadContext
        })
      : undefined;

    return createAgentChatPendingAttachment({
      file,
      localObjectUrl,
      ...(result ? { result } : {})
    });
  } catch (error) {
    URL.revokeObjectURL(localObjectUrl);
    throw error;
  }
}

async function handleFileSelection(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const files = input?.files ? Array.from(input.files) : [];

  if (files.length === 0) {
    return;
  }

  resolvingUploads.value = true;

  try {
    const nextUploads = await Promise.all(files.map((file) => resolveUpload(file)));

    emit('update:uploads', [...props.uploads, ...nextUploads]);

    for (const upload of nextUploads) {
      emit('upload-resolved', upload);
    }
  } catch (error) {
    emit('upload-error', error);
  } finally {
    resolvingUploads.value = false;

    if (input) {
      input.value = '';
    }

    await nextTick();
    resizeInput();
    focusInput();
  }
}

function removeUpload(uploadId: string) {
  const target = props.uploads.find((upload) => upload.id === uploadId);

  if (!target) {
    return;
  }

  revokeAgentChatPendingAttachment(target);
  emit('upload-remove', target);
  emit('update:uploads', props.uploads.filter((upload) => upload.id !== uploadId));
}

function submit() {
  if (!canSend.value) {
    return;
  }

  emit('send', createAgentChatComposerSendPayload(props.modelValue, props.uploads));
}

function handleTextareaKeydown(event: KeyboardEvent) {
  if (!props.submitOnEnter) {
    return;
  }

  if (event.key !== 'Enter') {
    return;
  }

  if (event.shiftKey) {
    return;
  }

  event.preventDefault();
  submit();
}

watch(
  () => props.modelValue,
  () => {
    nextTick(resizeInput);
  },
  {
    flush: 'post'
  }
);

watch(
  textareaRef,
  (value) => {
    if (!value) {
      return;
    }

    nextTick(resizeInput);
  },
  {
    flush: 'post'
  }
);
</script>

<template>
  <form
    class="agentdown-chat-composer"
    @submit.prevent="submit"
  >
    <input
      ref="fileInputRef"
      type="file"
      hidden
      :accept="accept"
      :multiple="multiple"
      @change="handleFileSelection"
    >

    <div class="agentdown-chat-composer__shell">
      <button
        v-if="showUploadButton"
        type="button"
        class="agentdown-chat-composer__icon-button"
        :disabled="resolvedDisabled"
        title="添加文件"
        @click="openFilePicker"
      >
        <slot name="upload-trigger-icon">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.85"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </slot>
      </button>

      <div
        class="agentdown-chat-composer__body"
        @click="focusInput"
      >
        <div
          v-if="uploads.length > 0"
          class="agentdown-chat-composer__uploads"
        >
          <template
            v-for="upload in uploads"
            :key="upload.id"
          >
            <slot
              name="attachment"
              :attachment="upload"
              :remove="() => removeUpload(upload.id)"
            >
              <div class="agentdown-chat-composer__upload">
                <div class="agentdown-chat-composer__upload-copy">
                  <strong :title="upload.name">{{ upload.name }}</strong>
                  <span>{{ upload.sizeText }}</span>
                </div>

                <button
                  type="button"
                  class="agentdown-chat-composer__upload-remove"
                  title="移除文件"
                  @click.stop="removeUpload(upload.id)"
                >
                  ×
                </button>
              </div>
            </slot>
          </template>
        </div>

        <textarea
          ref="textareaRef"
          :value="modelValue"
          class="agentdown-chat-composer__input"
          rows="1"
          :disabled="resolvedDisabled"
          :placeholder="resolvedPlaceholder"
          @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value); resizeInput()"
          @keydown="handleTextareaKeydown"
        />
      </div>

      <button
        v-if="showSendButton"
        type="submit"
        class="agentdown-chat-composer__icon-button agentdown-chat-composer__icon-button--send"
        :disabled="!canSend"
        :title="sendTitle"
      >
        <slot name="send-icon">
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
        </slot>
      </button>
    </div>

    <slot
      v-if="disclaimer !== false || $slots.disclaimer"
      name="disclaimer"
    >
      <p
        v-if="disclaimer !== false"
        class="agentdown-chat-composer__disclaimer"
      >
        {{ disclaimer }}
      </p>
    </slot>
  </form>
</template>

<style scoped>
.agentdown-chat-composer {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  width: 100%;
  min-width: 0;
}

.agentdown-chat-composer__shell {
  display: flex;
  align-items: flex-end;
  gap: 0.6rem;
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 28px;
  padding: 0.55rem 0.7rem 0.55rem 0.55rem;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.05);
  box-sizing: border-box;
}

.agentdown-chat-composer__icon-button {
  display: inline-flex;
  width: 2.5rem;
  height: 2.5rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #5b6474;
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease, transform 160ms ease;
}

.agentdown-chat-composer__icon-button:hover:enabled {
  background: #f3f4f6;
  color: #111827;
}

.agentdown-chat-composer__icon-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.agentdown-chat-composer__icon-button--send {
  background: #111827;
  color: #ffffff;
}

.agentdown-chat-composer__icon-button--send:hover:enabled {
  background: #1f2937;
  color: #ffffff;
  transform: translateY(-1px);
}

.agentdown-chat-composer__icon-button svg {
  width: 1.05rem;
  height: 1.05rem;
}

.agentdown-chat-composer__body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.08rem 0;
}

.agentdown-chat-composer__uploads {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.agentdown-chat-composer__upload {
  display: inline-flex;
  max-width: min(100%, 240px);
  min-width: 0;
  align-items: center;
  gap: 0.55rem;
  border-radius: 16px;
  padding: 0.42rem 0.65rem 0.42rem 0.75rem;
  background: #f7f7f8;
}

.agentdown-chat-composer__upload-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.08rem;
}

.agentdown-chat-composer__upload-copy strong,
.agentdown-chat-composer__upload-copy span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agentdown-chat-composer__upload-copy strong {
  color: #111827;
  font-size: 0.82rem;
  font-weight: 600;
}

.agentdown-chat-composer__upload-copy span {
  color: #6b7280;
  font-size: 0.73rem;
}

.agentdown-chat-composer__upload-remove {
  display: inline-flex;
  width: 1.3rem;
  height: 1.3rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
}

.agentdown-chat-composer__upload-remove:hover {
  background: rgba(17, 24, 39, 0.06);
  color: #111827;
}

.agentdown-chat-composer__input {
  width: 100%;
  min-width: 0;
  resize: none;
  border: none;
  background: transparent;
  color: #111827;
  font: inherit;
  line-height: 1.65;
  outline: none;
  box-sizing: border-box;
}

.agentdown-chat-composer__input::placeholder {
  color: #9ca3af;
}

.agentdown-chat-composer__disclaimer {
  margin: 0;
  padding: 0 0.35rem;
  color: #9ca3af;
  font-size: 0.72rem;
  line-height: 1.45;
  text-align: center;
}
</style>
