import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

const AGUI_DIRECTIVE = /^:::\s*vue-component\s+([A-Za-z][\w-]*)(?:\s+(.*))?$/;

function parseValue(value: string): unknown {
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  if (value === 'null') {
    return null;
  }

  if (!Number.isNaN(Number(value)) && value.trim() !== '') {
    return Number(value);
  }

  return value;
}

function parseKeyValuePairs(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const matcher = /([A-Za-z_][\w-]*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;

  for (const match of raw.matchAll(matcher)) {
    const [, key, dquoted, squoted, bare] = match;
    const value = dquoted ?? squoted ?? bare ?? '';
    result[key] = parseValue(value);
  }

  return result;
}

function parseProps(raw?: string): Record<string, unknown> {
  if (!raw) {
    return {};
  }

  const trimmed = raw.trim();

  if (!trimmed) {
    return {};
  }

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
    } catch {
      return {
        raw: trimmed
      };
    }
  }

  return parseKeyValuePairs(trimmed);
}

export function aguiPlugin(md: MarkdownIt): void {
  md.block.ruler.before(
    'fence',
    'agui_component',
    (state, startLine, endLine, silent) => {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      const line = state.src.slice(start, max);
      const match = line.match(AGUI_DIRECTIVE);

      if (!match) {
        return false;
      }

      if (silent) {
        return true;
      }

      const token = state.push('agui_component', 'div', 0) as Token;
      token.block = true;
      token.meta = {
        name: match[1],
        props: parseProps(match[2])
      };
      token.map = [startLine, startLine + 1];
      state.line = startLine + 1;
      return true;
    }
  );
}
