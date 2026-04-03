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

/** 解析 key=value 形式的指令 props。 */
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

/** 兼容 JSON 和 key=value 两种指令 props 写法。 */
export function parseDirectiveProps(raw?: string): Record<string, unknown> {
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
