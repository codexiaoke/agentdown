import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

const AGUI_DIRECTIVE = /^:::\s*vue-component\s+([A-Za-z][\w-]*)(?:\s+(.*))?$/;

/** 把字符串字面量尽量还原成更合理的 JS 基础类型。 */
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

/** 解析 key=value 形式的 AGUI props。 */
function parseKeyValuePairs(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const matcher = /([A-Za-z_][\w-]*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;

  for (const match of raw.matchAll(matcher)) {
    const [, key, dquoted, squoted, bare] = match;

    if (!key) {
      continue;
    }

    const value = dquoted ?? squoted ?? bare ?? '';
    result[key] = parseValue(value);
  }

  return result;
}

/** 兼容 JSON 和 key=value 两种 AGUI props 写法。 */
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

/** 注册 :::vue-component 指令，把它转成专用 token。 */
export function aguiPlugin(md: MarkdownIt): void {
  md.block.ruler.before(
    'fence',
    'agui_component',
    /** 识别单行 AGUI 指令，并写入组件名与 props。 */
    (state, startLine, _endLine, silent) => {
      const lineStart = state.bMarks[startLine];
      const shift = state.tShift[startLine];
      const max = state.eMarks[startLine];

      if (lineStart === undefined || shift === undefined || max === undefined) {
        return false;
      }

      const start = lineStart + shift;
      const line = state.src.slice(start, max);
      const match = line.match(AGUI_DIRECTIVE);

      if (!match) {
        return false;
      }

      if (silent) {
        return true;
      }

      // 自定义指令在解析阶段就转成独立 token，渲染层只关心组件名和 props。
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
