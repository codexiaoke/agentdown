import type { MarkdownArtifactKind, MarkdownAttachmentKind } from '../core/types';

export type FileCardTone = 'blue' | 'neutral' | 'amber' | 'rose' | 'emerald';

export interface FileCardPresentation {
  title: string;
  metaText: string;
  iconTone: FileCardTone;
  iconPath: string;
}

const MARKDOWN_ICON_PATH = 'M8 3.8h6.9l4.3 4.3v11.1a1.8 1.8 0 0 1-1.8 1.8H8A1.8 1.8 0 0 1 6.2 19.2V5.6A1.8 1.8 0 0 1 8 3.8Zm6.1.4v3a1 1 0 0 0 1 1h3M8.8 11.1h6.4M8.8 14.2h6.4M8.8 17.3h4.2';
const FILE_ICON_PATH = 'M8 3.8h6.9l4.3 4.3v11.1a1.8 1.8 0 0 1-1.8 1.8H8A1.8 1.8 0 0 1 6.2 19.2V5.6A1.8 1.8 0 0 1 8 3.8Zm6.1.4v3a1 1 0 0 0 1 1h3M10.1 13.3h5.8M10.1 16.4h4.1';
const JSON_ICON_PATH = 'M9.2 8.1c-1 .45-1.55 1.42-1.55 2.95s.55 2.5 1.55 2.95M14.8 8.1c1 .45 1.55 1.42 1.55 2.95s-.55 2.5-1.55 2.95M11.75 7.2l-.8 9.6';
const IMAGE_ICON_PATH = 'M5.8 7.1A1.3 1.3 0 1 1 8.4 7.1 1.3 1.3 0 0 1 5.8 7.1ZM5 5.1h14a1.9 1.9 0 0 1 1.9 1.9v10a1.9 1.9 0 0 1-1.9 1.9H5A1.9 1.9 0 0 1 3.1 17V7A1.9 1.9 0 0 1 5 5.1Zm0 11.8h14l-4.15-4.35a1.3 1.3 0 0 0-1.9-.02l-1.65 1.74-2.2-2.28a1.3 1.3 0 0 0-1.86 0L5 14.55v2.35Z';
const AUDIO_ICON_PATH = 'M5.2 14.7V9.3M8.4 16.6V7.4M11.6 18.2V5.8M14.8 16.6V7.4M18 14.7V9.3';
const VIDEO_ICON_PATH = 'M5.6 6.1h8.8A1.7 1.7 0 0 1 16.1 7.8v1.7l3.2-1.95c.57-.35 1.3.06 1.3.73v7.34c0 .67-.73 1.08-1.3.73l-3.2-1.95v1.7a1.7 1.7 0 0 1-1.7 1.7H5.6A1.7 1.7 0 0 1 3.9 16.2V7.8a1.7 1.7 0 0 1 1.7-1.7Z';
const INPUT_ICON_PATH = 'M5.5 7.2h9.6M5.5 11.2h5.4M5.5 15.2h8.2M17.2 17.1l2.8-2.8-2.8-2.8';
const DIFF_ICON_PATH = 'M7.1 6.2v11.6M4.2 9.1l2.9-2.9L10 9.1M16.9 17.8V6.2m2.9 8.7-2.9 2.9-2.9-2.9';
const TABLE_ICON_PATH = 'M5.1 6.1h13.8v11.8H5.1zm0 3.9h13.8M9.7 6.1v11.8M14.3 6.1v11.8';

function normalizeTitle(label?: string, title?: string): string {
  if (typeof label === 'string' && label.trim().length > 0) {
    return label.trim();
  }

  if (typeof title === 'string' && title.trim().length > 0) {
    return title.trim();
  }

  return '未命名文件';
}

function extractExtension(label?: string, title?: string): string | null {
  const name = normalizeTitle(label, title);
  const index = name.lastIndexOf('.');

  if (index <= 0 || index === name.length - 1) {
    return null;
  }

  return name.slice(index + 1).toLowerCase();
}

function resolveFileTypeLabel(
  kind: MarkdownAttachmentKind | MarkdownArtifactKind,
  mimeType?: string,
  label?: string,
  title?: string
): string {
  if (typeof mimeType === 'string' && mimeType.length > 0) {
    if (mimeType.includes('markdown')) {
      return 'Markdown';
    }

    if (mimeType === 'application/json') {
      return 'JSON';
    }

    if (mimeType.startsWith('image/')) {
      return '图片';
    }

    if (mimeType.startsWith('audio/')) {
      return '音频';
    }

    if (mimeType.startsWith('video/')) {
      return '视频';
    }

    if (mimeType === 'application/pdf') {
      return 'PDF';
    }
  }

  const extension = extractExtension(label, title);

  if (extension === 'md' || extension === 'markdown' || extension === 'mdx') {
    return 'Markdown';
  }

  if (extension === 'json') {
    return 'JSON';
  }

  if (extension === 'pdf') {
    return 'PDF';
  }

  if (kind === 'image') {
    return '图片';
  }

  if (kind === 'audio') {
    return '音频';
  }

  if (kind === 'video') {
    return '视频';
  }

  if (kind === 'input') {
    return '输入';
  }

  if (kind === 'diff') {
    return 'Diff';
  }

  if (kind === 'table') {
    return '表格';
  }

  return '文件';
}

function resolveFileCardVisual(typeLabel: string, kind: MarkdownAttachmentKind | MarkdownArtifactKind) {
  if (typeLabel === 'Markdown') {
    return {
      iconTone: 'blue' as const,
      iconPath: MARKDOWN_ICON_PATH
    };
  }

  if (typeLabel === 'JSON') {
    return {
      iconTone: 'amber' as const,
      iconPath: JSON_ICON_PATH
    };
  }

  if (typeLabel === '图片' || kind === 'image') {
    return {
      iconTone: 'emerald' as const,
      iconPath: IMAGE_ICON_PATH
    };
  }

  if (typeLabel === '音频' || kind === 'audio') {
    return {
      iconTone: 'rose' as const,
      iconPath: AUDIO_ICON_PATH
    };
  }

  if (typeLabel === '视频' || kind === 'video') {
    return {
      iconTone: 'rose' as const,
      iconPath: VIDEO_ICON_PATH
    };
  }

  if (typeLabel === '输入' || kind === 'input') {
    return {
      iconTone: 'neutral' as const,
      iconPath: INPUT_ICON_PATH
    };
  }

  if (typeLabel === 'Diff' || kind === 'diff') {
    return {
      iconTone: 'neutral' as const,
      iconPath: DIFF_ICON_PATH
    };
  }

  if (typeLabel === '表格' || kind === 'table') {
    return {
      iconTone: 'emerald' as const,
      iconPath: TABLE_ICON_PATH
    };
  }

  return {
    iconTone: 'neutral' as const,
    iconPath: FILE_ICON_PATH
  };
}

export function resolveAttachmentFileCardPresentation(input: {
  attachmentKind: MarkdownAttachmentKind;
  label?: string;
  title?: string;
  mimeType?: string;
  sizeText?: string;
}): FileCardPresentation {
  const title = normalizeTitle(input.label, input.title);
  const typeLabel = resolveFileTypeLabel(input.attachmentKind, input.mimeType, input.label, input.title);
  const visual = resolveFileCardVisual(typeLabel, input.attachmentKind);
  const metaParts = [typeLabel];

  if (typeof input.sizeText === 'string' && input.sizeText.trim().length > 0) {
    metaParts.push(input.sizeText.trim());
  }

  return {
    title,
    metaText: metaParts.join(' · '),
    iconTone: visual.iconTone,
    iconPath: visual.iconPath
  };
}

export function resolveArtifactFileCardPresentation(input: {
  artifactKind: MarkdownArtifactKind;
  label?: string;
  title?: string;
}): FileCardPresentation {
  const title = normalizeTitle(input.label, input.title);
  const typeLabel = resolveFileTypeLabel(input.artifactKind, undefined, input.label, input.title);
  const visual = resolveFileCardVisual(typeLabel, input.artifactKind);

  return {
    title,
    metaText: typeLabel,
    iconTone: visual.iconTone,
    iconPath: visual.iconPath
  };
}
