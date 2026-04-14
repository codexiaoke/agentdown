import type { MarkdownArtifactKind, MarkdownAttachmentKind } from '../core/types';

export type FileCardTone = 'blue' | 'neutral' | 'amber' | 'rose' | 'emerald';

export interface FileCardPresentation {
  title: string;
  metaText: string;
  iconTone: FileCardTone;
  iconLabel: string;
  iconLabelSize: 'sm' | 'md';
}

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

function resolveShortExtension(label?: string, title?: string): string {
  const extension = extractExtension(label, title);

  if (!extension) {
    return 'FILE';
  }

  return extension.slice(0, 4).toUpperCase();
}

function resolveFileCardVisual(
  typeLabel: string,
  kind: MarkdownAttachmentKind | MarkdownArtifactKind,
  label?: string,
  title?: string
) {
  const extension = extractExtension(label, title);

  if (extension === 'xls' || extension === 'xlsx' || extension === 'csv' || extension === 'tsv') {
    return {
      iconTone: 'emerald' as const,
      iconLabel: 'X',
      iconLabelSize: 'md' as const
    };
  }

  if (extension === 'doc' || extension === 'docx') {
    return {
      iconTone: 'blue' as const,
      iconLabel: 'W',
      iconLabelSize: 'md' as const
    };
  }

  if (extension === 'ppt' || extension === 'pptx' || extension === 'key') {
    return {
      iconTone: 'amber' as const,
      iconLabel: 'P',
      iconLabelSize: 'md' as const
    };
  }

  if (extension === 'pdf') {
    return {
      iconTone: 'rose' as const,
      iconLabel: 'PDF',
      iconLabelSize: 'sm' as const
    };
  }

  if (extension === 'zip' || extension === 'rar' || extension === '7z' || extension === 'gz' || extension === 'tar') {
    return {
      iconTone: 'amber' as const,
      iconLabel: 'ZIP',
      iconLabelSize: 'sm' as const
    };
  }

  if (typeLabel === 'Markdown') {
    return {
      iconTone: 'blue' as const,
      iconLabel: 'MD',
      iconLabelSize: 'sm' as const
    };
  }

  if (typeLabel === 'JSON') {
    return {
      iconTone: 'amber' as const,
      iconLabel: 'JSON',
      iconLabelSize: 'sm' as const
    };
  }

  if (typeLabel === '图片' || kind === 'image') {
    return {
      iconTone: 'blue' as const,
      iconLabel: extension === 'svg' ? 'SVG' : 'IMG',
      iconLabelSize: 'sm' as const
    };
  }

  if (typeLabel === '音频' || kind === 'audio') {
    return {
      iconTone: 'rose' as const,
      iconLabel: 'AUD',
      iconLabelSize: 'sm' as const
    };
  }

  if (typeLabel === '视频' || kind === 'video') {
    return {
      iconTone: 'rose' as const,
      iconLabel: 'VID',
      iconLabelSize: 'sm' as const
    };
  }

  if (typeLabel === '输入' || kind === 'input') {
    return {
      iconTone: 'neutral' as const,
      iconLabel: 'TXT',
      iconLabelSize: 'sm' as const
    };
  }

  if (typeLabel === 'Diff' || kind === 'diff') {
    return {
      iconTone: 'neutral' as const,
      iconLabel: 'DIFF',
      iconLabelSize: 'sm' as const
    };
  }

  if (typeLabel === '表格' || kind === 'table') {
    return {
      iconTone: 'emerald' as const,
      iconLabel: 'TAB',
      iconLabelSize: 'sm' as const
    };
  }

  return {
    iconTone: 'neutral' as const,
    iconLabel: resolveShortExtension(label, title),
    iconLabelSize: extension && extension.length <= 2 ? 'md' as const : 'sm' as const
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
  const visual = resolveFileCardVisual(typeLabel, input.attachmentKind, input.label, input.title);
  const metaText = typeof input.sizeText === 'string' && input.sizeText.trim().length > 0
    ? input.sizeText.trim()
    : typeLabel;

  return {
    title,
    metaText,
    iconTone: visual.iconTone,
    iconLabel: visual.iconLabel,
    iconLabelSize: visual.iconLabelSize
  };
}

export function resolveArtifactFileCardPresentation(input: {
  artifactKind: MarkdownArtifactKind;
  label?: string;
  title?: string;
}): FileCardPresentation {
  const title = normalizeTitle(input.label, input.title);
  const typeLabel = resolveFileTypeLabel(input.artifactKind, undefined, input.label, input.title);
  const visual = resolveFileCardVisual(typeLabel, input.artifactKind, input.label, input.title);

  return {
    title,
    metaText: typeLabel,
    iconTone: visual.iconTone,
    iconLabel: visual.iconLabel,
    iconLabelSize: visual.iconLabelSize
  };
}
