interface StreamingMarkdownLine {
  content: string;
  start: number;
  end: number;
  hasNewline: boolean;
}

interface StreamingMarkdownParseResult {
  end: number;
  nextIndex: number;
}

export type StreamingMarkdownDraftMode = 'text' | 'preview' | 'hidden';

const AGUI_DIRECTIVE_RE = /^\s*:::\s*vue-component\s+[A-Za-z][\w-]*(?:\s+.*)?$/;
const AGENT_DIRECTIVE_RE = /^\s*:::\s*(approval|artifact|timeline)(?:\s+.*)?$/;
const THOUGHT_OPEN_RE = /^\s*:::\s*thought\s*$/;
const THOUGHT_CLOSE_RE = /^\s*:::\s*$/;
const HEADING_RE = /^\s{0,3}#{1,6}(?:\s|$)/;
const HR_RE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const TABLE_DIVIDER_RE = /^\s*\|?(?:\s*:?-+:?\s*\|)+(?:\s*:?-+:?\s*)\|?\s*$/;

function splitStreamingMarkdownLines(source: string): StreamingMarkdownLine[] {
  const lines: StreamingMarkdownLine[] = [];
  let start = 0;

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '\n') {
      continue;
    }

    lines.push({
      content: source.slice(start, index),
      start,
      end: index + 1,
      hasNewline: true
    });
    start = index + 1;
  }

  if (start < source.length) {
    lines.push({
      content: source.slice(start),
      start,
      end: source.length,
      hasNewline: false
    });
  }

  return lines;
}

function isBlankLine(line: StreamingMarkdownLine): boolean {
  return line.content.trim().length === 0;
}

function matchFence(line: string): { marker: '`' | '~'; length: number } | null {
  const match = line.match(/^\s{0,3}(`{3,}|~{3,})[^\n]*$/);

  if (!match) {
    return null;
  }

  const fence = match[1];

  if (!fence) {
    return null;
  }

  const marker = fence[0];

  if (marker !== '`' && marker !== '~') {
    return null;
  }

  return {
    marker,
    length: fence.length
  };
}

function isFenceClose(line: string, marker: '`' | '~', length: number): boolean {
  const match = line.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);

  if (!match) {
    return false;
  }

  const fence = match[1];

  if (!fence) {
    return false;
  }

  return fence[0] === marker && fence.length >= length;
}

function isMathBlockDelimiter(line: string): boolean {
  return line.trim() === '$$';
}

function isSingleLineMathBlock(line: StreamingMarkdownLine): boolean {
  const trimmed = line.content.trim();
  return line.hasNewline && trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed !== '$$';
}

function isSingleLineDirective(line: StreamingMarkdownLine): boolean {
  return line.hasNewline && (AGUI_DIRECTIVE_RE.test(line.content) || AGENT_DIRECTIVE_RE.test(line.content));
}

function isHeadingOrRule(line: StreamingMarkdownLine): boolean {
  return line.hasNewline && (HEADING_RE.test(line.content) || HR_RE.test(line.content));
}

function isTableHeader(line: string): boolean {
  return line.includes('|') && line.trim().length > 0;
}

function isTableDivider(line: string): boolean {
  return TABLE_DIVIDER_RE.test(line);
}

function isTableRow(line: string): boolean {
  return line.trim().length > 0 && line.includes('|');
}

function isTableDividerFragment(line: string): boolean {
  return /^[\s|:-]+$/.test(line) && line.trim().length > 0;
}

function isHardBlockStart(line: StreamingMarkdownLine): boolean {
  return (
    !!matchFence(line.content)
    || THOUGHT_OPEN_RE.test(line.content)
    || isMathBlockDelimiter(line.content)
    || AGUI_DIRECTIVE_RE.test(line.content)
    || AGENT_DIRECTIVE_RE.test(line.content)
    || HEADING_RE.test(line.content)
    || HR_RE.test(line.content)
  );
}

function consumeBlankLines(lines: StreamingMarkdownLine[], index: number): StreamingMarkdownParseResult | null {
  const firstLine = lines[index];

  if (!firstLine || !isBlankLine(firstLine) || !firstLine.hasNewline) {
    return null;
  }

  let nextIndex = index;
  let end = firstLine.end;

  while (nextIndex < lines.length) {
    const line = lines[nextIndex];

    if (!line || !isBlankLine(line) || !line.hasNewline) {
      break;
    }

    end = line.end;
    nextIndex += 1;
  }

  return {
    end,
    nextIndex
  };
}

function consumeFenceBlock(lines: StreamingMarkdownLine[], index: number): StreamingMarkdownParseResult | null {
  const openingLine = lines[index];
  const openingFence = openingLine ? matchFence(openingLine.content) : null;

  if (!openingFence || !openingLine?.hasNewline) {
    return null;
  }

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];

    if (!line) {
      break;
    }

    if (isFenceClose(line.content, openingFence.marker, openingFence.length)) {
      if (!line.hasNewline) {
        return null;
      }

      return {
        end: line.end,
        nextIndex: cursor + 1
      };
    }
  }

  return null;
}

function consumeThoughtBlock(lines: StreamingMarkdownLine[], index: number): StreamingMarkdownParseResult | null {
  const openingLine = lines[index];

  if (!openingLine || !THOUGHT_OPEN_RE.test(openingLine.content) || !openingLine.hasNewline) {
    return null;
  }

  let depth = 1;

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];

    if (!line) {
      break;
    }

    if (THOUGHT_OPEN_RE.test(line.content)) {
      depth += 1;
      continue;
    }

    if (!THOUGHT_CLOSE_RE.test(line.content)) {
      continue;
    }

    depth -= 1;

    if (depth === 0) {
      if (!line.hasNewline) {
        return null;
      }

      return {
        end: line.end,
        nextIndex: cursor + 1
      };
    }
  }

  return null;
}

function consumeMathBlock(lines: StreamingMarkdownLine[], index: number): StreamingMarkdownParseResult | null {
  const line = lines[index];

  if (!line) {
    return null;
  }

  if (isSingleLineMathBlock(line)) {
    return {
      end: line.end,
      nextIndex: index + 1
    };
  }

  if (!isMathBlockDelimiter(line.content) || !line.hasNewline) {
    return null;
  }

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const currentLine = lines[cursor];

    if (!currentLine) {
      break;
    }

    if (!isMathBlockDelimiter(currentLine.content)) {
      continue;
    }

    if (!currentLine.hasNewline) {
      return null;
    }

    return {
      end: currentLine.end,
      nextIndex: cursor + 1
    };
  }

  return null;
}

function consumeSingleLineBlock(lines: StreamingMarkdownLine[], index: number): StreamingMarkdownParseResult | null {
  const line = lines[index];

  if (!line) {
    return null;
  }

  if (!isSingleLineDirective(line) && !isHeadingOrRule(line)) {
    return null;
  }

  return {
    end: line.end,
    nextIndex: index + 1
  };
}

function consumeTableBlock(lines: StreamingMarkdownLine[], index: number): StreamingMarkdownParseResult | null {
  const header = lines[index];
  const divider = lines[index + 1];

  if (
    !header
    || !divider
    || !header.hasNewline
    || !divider.hasNewline
    || !isTableHeader(header.content)
    || !isTableDivider(divider.content)
  ) {
    return null;
  }

  let lastRowIndex = index + 1;
  let cursor = index + 2;

  while (cursor < lines.length) {
    const line = lines[cursor];

    if (!line || !isTableRow(line.content)) {
      break;
    }

    lastRowIndex = cursor;
    cursor += 1;
  }

  if (cursor >= lines.length) {
    return null;
  }

  const lastRow = lines[lastRowIndex];

  if (!lastRow?.hasNewline) {
    return null;
  }

  return {
    end: lastRow.end,
    nextIndex: cursor
  };
}

function consumeGenericBlock(lines: StreamingMarkdownLine[], index: number): StreamingMarkdownParseResult | null {
  if (!lines[index]) {
    return null;
  }

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];

    if (!line) {
      break;
    }

    if (isBlankLine(line)) {
      if (!line.hasNewline) {
        return null;
      }

      return {
        end: line.end,
        nextIndex: cursor + 1
      };
    }

    if (isHardBlockStart(line)) {
      const previousLine = lines[cursor - 1];

      if (!previousLine?.hasNewline) {
        return null;
      }

      return {
        end: previousLine.end,
        nextIndex: cursor
      };
    }
  }

  return null;
}

export function findStreamingMarkdownBoundary(source: string): number {
  if (source.length === 0) {
    return 0;
  }

  const lines = splitStreamingMarkdownLines(source);
  let index = 0;
  let boundary = 0;

  while (index < lines.length) {
    const result =
      consumeBlankLines(lines, index)
      ?? consumeFenceBlock(lines, index)
      ?? consumeThoughtBlock(lines, index)
      ?? consumeMathBlock(lines, index)
      ?? consumeSingleLineBlock(lines, index)
      ?? consumeTableBlock(lines, index)
      ?? consumeGenericBlock(lines, index);

    if (!result) {
      break;
    }

    boundary = result.end;
    index = result.nextIndex;
  }

  return boundary;
}

export function splitStreamingMarkdown(source: string): {
  committed: string;
  draft: string;
} {
  const boundary = findStreamingMarkdownBoundary(source);

  return {
    committed: source.slice(0, boundary),
    draft: source.slice(boundary)
  };
}

export function resolveStreamingMarkdownDraftMode(source: string): StreamingMarkdownDraftMode {
  if (source.trim().length === 0) {
    return 'hidden';
  }

  const lines = splitStreamingMarkdownLines(source);
  const firstMeaningfulLine = lines.find((line) => line.content.trim().length > 0);

  if (!firstMeaningfulLine) {
    return 'hidden';
  }

  const firstMeaningfulIndex = lines.indexOf(firstMeaningfulLine);
  const secondMeaningfulLine = lines
    .slice(firstMeaningfulIndex + 1)
    .find((line) => line.content.trim().length > 0);

  if (!!matchFence(firstMeaningfulLine.content)) {
    return secondMeaningfulLine ? 'preview' : 'hidden';
  }

  if (THOUGHT_OPEN_RE.test(firstMeaningfulLine.content)) {
    return secondMeaningfulLine ? 'preview' : 'hidden';
  }

  if (isMathBlockDelimiter(firstMeaningfulLine.content)) {
    return secondMeaningfulLine ? 'preview' : 'hidden';
  }

  if (
    AGUI_DIRECTIVE_RE.test(firstMeaningfulLine.content)
    || AGENT_DIRECTIVE_RE.test(firstMeaningfulLine.content)
  ) {
    return 'hidden';
  }

  if (
    firstMeaningfulLine.content.trim().startsWith('|')
    || (
      isTableHeader(firstMeaningfulLine.content)
      && (
        secondMeaningfulLine
        && (
          isTableDivider(secondMeaningfulLine.content)
          || isTableDividerFragment(secondMeaningfulLine.content)
        )
      )
    )
  ) {
    return secondMeaningfulLine ? 'preview' : 'hidden';
  }

  return 'text';
}
