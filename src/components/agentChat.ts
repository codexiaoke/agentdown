import type { FrameworkChatInputValue } from '../adapters/shared/chatFactory';
import type { MarkdownAttachmentKind } from '../core/types';
import type { SurfaceBlock } from '../runtime/types';

/**
 * 聊天输入区里暂存中的附件模型。
 */
export interface AgentChatPendingAttachment {
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

/**
 * 上传回调可读取的上下文。
 */
export interface AgentChatUploadResolverContext {
  attachmentKind: MarkdownAttachmentKind;
  localObjectUrl: string;
  context?: unknown;
}

/**
 * 上传回调需要返回的最小结果。
 */
export interface AgentChatUploadResolverResult {
  fileId: string;
  href?: string;
  previewSrc?: string;
}

/**
 * 上传回调签名。
 */
export type AgentChatUploadResolver = (
  file: File,
  context: AgentChatUploadResolverContext
) => Promise<AgentChatUploadResolverResult> | AgentChatUploadResolverResult;

/**
 * 输入区点击发送后对外抛出的结构化载荷。
 */
export interface AgentChatComposerSendPayload {
  text: string;
  attachments: AgentChatPendingAttachment[];
  requestText: string;
  input: FrameworkChatInputValue;
}

interface AgentChatFileLike {
  name: string;
  size: number;
  type: string;
}

interface CreateAgentChatPendingAttachmentInput {
  file: AgentChatFileLike;
  localObjectUrl: string;
  result?: AgentChatUploadResolverResult;
}

export interface AgentChatConversationAppendOptions {
  slot?: string;
  ignoredTypes?: ReadonlyArray<string>;
}

export function createAgentChatUploadId(): string {
  return `upload:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

export function createAgentChatLocalFileId(file: Pick<AgentChatFileLike, 'name' | 'size'>): string {
  const seed = `${Date.now()}:${Math.random().toString(36).slice(2, 8)}:${file.name}:${file.size}`;
  return `local-file:${seed}`;
}

export function formatAgentChatFileSize(size: number): string {
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

export function inferAgentChatAttachmentKind(file: Pick<AgentChatFileLike, 'name' | 'type'>): MarkdownAttachmentKind {
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

export function buildAgentChatRequestText(
  text: string,
  attachments: ReadonlyArray<Pick<AgentChatPendingAttachment, 'name'>>
): string {
  const trimmedText = text.trim();

  if (attachments.length === 0) {
    return trimmedText;
  }

  const fileSummary = attachments.map((attachment) => attachment.name).join('、');

  if (trimmedText.length > 0) {
    return `${trimmedText}\n\n已上传文件：${fileSummary}`;
  }

  return `请先查看我上传的文件：${fileSummary}`;
}

export function buildAgentChatInputValue(
  text: string,
  attachments: ReadonlyArray<AgentChatPendingAttachment>
): FrameworkChatInputValue {
  const trimmedText = text.trim();

  if (attachments.length === 0) {
    return trimmedText;
  }

  const requestText = buildAgentChatRequestText(trimmedText, attachments);

  return {
    ...(trimmedText.length > 0 ? { text: trimmedText } : {}),
    requestText,
    blocks: attachments.map((attachment) => ({
      kind: 'attachment' as const,
      title: attachment.name,
      attachmentKind: attachment.attachmentKind,
      attachmentId: attachment.fileId,
      label: attachment.name,
      href: attachment.href,
      mimeType: attachment.mimeType,
      sizeText: attachment.sizeText,
      ...(attachment.previewSrc ? { previewSrc: attachment.previewSrc } : {})
    }))
  };
}

export function createAgentChatComposerSendPayload(
  text: string,
  attachments: ReadonlyArray<AgentChatPendingAttachment>
): AgentChatComposerSendPayload {
  const input = buildAgentChatInputValue(text, attachments);
  const requestText = typeof input === 'string'
    ? input
    : (input.requestText ?? input.text ?? '');

  return {
    text: text.trim(),
    attachments: [...attachments],
    requestText,
    input
  };
}

export function createAgentChatPendingAttachment(
  input: CreateAgentChatPendingAttachmentInput
): AgentChatPendingAttachment {
  const attachmentKind = inferAgentChatAttachmentKind(input.file);
  const result = input.result ?? {
    fileId: createAgentChatLocalFileId(input.file)
  };

  if (typeof result.fileId !== 'string' || result.fileId.length === 0) {
    throw new Error('上传回调必须返回非空的 fileId。');
  }

  let href = result.href;

  if (!href) {
    href = input.localObjectUrl;
  }

  let previewSrc = result.previewSrc;

  if (!previewSrc && attachmentKind === 'image') {
    previewSrc = input.localObjectUrl;
  }

  return {
    id: createAgentChatUploadId(),
    fileId: result.fileId,
    name: input.file.name,
    size: input.file.size,
    sizeText: formatAgentChatFileSize(input.file.size),
    mimeType: input.file.type,
    attachmentKind,
    href,
    localObjectUrl: input.localObjectUrl,
    ...(previewSrc ? { previewSrc } : {})
  };
}

export function revokeAgentChatPendingAttachment(attachment: Pick<AgentChatPendingAttachment, 'localObjectUrl'>): void {
  if (attachment.localObjectUrl.length === 0) {
    return;
  }

  URL.revokeObjectURL(attachment.localObjectUrl);
}

export function revokeAgentChatPendingAttachments(
  attachments: ReadonlyArray<Pick<AgentChatPendingAttachment, 'localObjectUrl'>>
): void {
  for (const attachment of attachments) {
    revokeAgentChatPendingAttachment(attachment);
  }
}

export function hasAgentChatAppendedConversationContent(
  blocks: ReadonlyArray<SurfaceBlock>,
  baselineBlockIds: ReadonlyArray<string> | ReadonlySet<string>,
  options: AgentChatConversationAppendOptions = {}
): boolean {
  const baselineIds = baselineBlockIds instanceof Set
    ? baselineBlockIds
    : new Set(baselineBlockIds);
  const slot = options.slot ?? 'main';
  const ignoredTypes = new Set(options.ignoredTypes ?? ['approval', 'tool']);

  return blocks.some((block) => {
    if (block.slot !== slot) {
      return false;
    }

    if (baselineIds.has(block.id)) {
      return false;
    }

    if (ignoredTypes.has(block.type)) {
      return false;
    }

    if (block.data.role === 'user') {
      return false;
    }

    return true;
  });
}
