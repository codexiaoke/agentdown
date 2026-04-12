import type { MarkdownArtifactKind, MarkdownAttachmentKind } from '../core/types';

export type FileCardPreviewMode = 'image' | 'iframe' | 'text' | null;

export interface FileCardPreviewTarget {
  mode: FileCardPreviewMode;
  src?: string;
  externalHref?: string;
  subtitle?: string;
}

const TEXT_PREVIEW_EXTENSIONS = new Set([
  'txt',
  'text',
  'md',
  'markdown',
  'mdx',
  'json',
  'yaml',
  'yml',
  'csv',
  'log',
  'xml',
  'html',
  'htm',
  'js',
  'ts',
  'tsx',
  'jsx',
  'vue',
  'py',
  'java',
  'kt',
  'go',
  'rs',
  'sh',
  'css',
  'scss',
  'less'
]);

function resolveExtension(label?: string, title?: string): string {
  const source = (label?.trim() || title?.trim() || '').toLowerCase();
  const dotIndex = source.lastIndexOf('.');

  if (dotIndex <= 0 || dotIndex >= source.length - 1) {
    return '';
  }

  return source.slice(dotIndex + 1);
}

function isTextPreviewMimeType(mimeType?: string): boolean {
  if (!mimeType) {
    return false;
  }

  return mimeType.startsWith('text/')
    || mimeType === 'application/json'
    || mimeType === 'application/ld+json'
    || mimeType === 'application/xml'
    || mimeType === 'application/javascript'
    || mimeType === 'application/x-yaml';
}

function isPdfMimeType(mimeType?: string): boolean {
  return mimeType === 'application/pdf';
}

function resolveFileSubtitle(kind: MarkdownAttachmentKind | MarkdownArtifactKind, mimeType?: string, extension?: string): string {
  if (kind === 'image' || mimeType?.startsWith('image/')) {
    return '图片预览';
  }

  if (isPdfMimeType(mimeType) || extension === 'pdf') {
    return 'PDF 预览';
  }

  if (mimeType === 'application/json' || extension === 'json') {
    return 'JSON 预览';
  }

  if (mimeType?.includes('markdown') || extension === 'md' || extension === 'markdown' || extension === 'mdx') {
    return 'Markdown 预览';
  }

  if (isTextPreviewMimeType(mimeType) || (extension && TEXT_PREVIEW_EXTENSIONS.has(extension))) {
    return '文本预览';
  }

  return '文件预览';
}

export function resolveFileCardPreviewTarget(input: {
  kind: MarkdownAttachmentKind | MarkdownArtifactKind;
  href?: string;
  previewSrc?: string;
  mimeType?: string;
  label?: string;
  title?: string;
}): FileCardPreviewTarget {
  const extension = resolveExtension(input.label, input.title);
  const externalHref = input.href || '';
  const imageSrc = input.previewSrc || input.href || '';
  const subtitle = resolveFileSubtitle(input.kind, input.mimeType, extension);

  if ((input.kind === 'image' || input.mimeType?.startsWith('image/')) && imageSrc) {
    return {
      mode: 'image',
      src: imageSrc,
      ...(externalHref ? { externalHref } : {}),
      subtitle
    };
  }

  if (externalHref && (isPdfMimeType(input.mimeType) || extension === 'pdf')) {
    return {
      mode: 'iframe',
      src: externalHref,
      externalHref,
      subtitle
    };
  }

  if (
    externalHref
    && (isTextPreviewMimeType(input.mimeType) || (extension && TEXT_PREVIEW_EXTENSIONS.has(extension)))
  ) {
    return {
      mode: 'text',
      src: externalHref,
      externalHref,
      subtitle
    };
  }

  return {
    mode: null,
    ...(externalHref ? { externalHref } : {}),
    subtitle
  };
}

export async function loadFileCardPreviewText(src: string): Promise<string> {
  const response = await fetch(src);

  if (!response.ok) {
    throw new Error(`预览请求失败（${response.status}）`);
  }

  return response.text();
}
