import { prepare, prepareWithSegments, type PreparedText, type PreparedTextWithSegments } from '@chenglou/pretext';

/**
 * pretext prepare 使用的共享缓存上限。
 */
const PRETEXT_CACHE_LIMIT = 2400;

/**
 * `prepare()` 结果缓存。
 */
const preparedTextCache = new Map<string, PreparedText>();

/**
 * `prepareWithSegments()` 结果缓存。
 */
const preparedTextWithSegmentsCache = new Map<string, PreparedTextWithSegments>();

/**
 * 读取或创建 `prepare()` 的共享缓存结果。
 */
export function getCachedPreparedText(
  text: string,
  font: string,
  whiteSpace: 'normal' | 'pre-wrap' = 'normal'
): PreparedText {
  const key = createPretextCacheKey(text, font, whiteSpace);
  const cached = preparedTextCache.get(key);

  if (cached) {
    touchLruEntry(preparedTextCache, key, cached);
    return cached;
  }

  const prepared = prepare(text, font, {
    whiteSpace
  });

  rememberLruEntry(preparedTextCache, key, prepared, PRETEXT_CACHE_LIMIT);
  return prepared;
}

/**
 * 读取或创建 `prepareWithSegments()` 的共享缓存结果。
 */
export function getCachedPreparedTextWithSegments(
  text: string,
  font: string,
  whiteSpace: 'normal' | 'pre-wrap' = 'normal'
): PreparedTextWithSegments {
  const key = createPretextCacheKey(text, font, whiteSpace);
  const cached = preparedTextWithSegmentsCache.get(key);

  if (cached) {
    touchLruEntry(preparedTextWithSegmentsCache, key, cached);
    return cached;
  }

  const prepared = prepareWithSegments(text, font, {
    whiteSpace
  });

  rememberLruEntry(preparedTextWithSegmentsCache, key, prepared, PRETEXT_CACHE_LIMIT);
  return prepared;
}

/**
 * 生成 pretext prepare 共享缓存 key。
 */
function createPretextCacheKey(
  text: string,
  font: string,
  whiteSpace: 'normal' | 'pre-wrap'
): string {
  return `${whiteSpace}\u0000${font}\u0000${text}`;
}

/**
 * 触碰一次 LRU 项，把它移到 map 尾部。
 */
function touchLruEntry<T>(map: Map<string, T>, key: string, value: T): void {
  map.delete(key);
  map.set(key, value);
}

/**
 * 写入新的 LRU 项，并在超过上限时淘汰最旧的数据。
 */
function rememberLruEntry<T>(map: Map<string, T>, key: string, value: T, limit: number): void {
  map.set(key, value);

  while (map.size > limit) {
    const oldestKey = map.keys().next().value as string | undefined;

    if (!oldestKey) {
      break;
    }

    map.delete(oldestKey);
  }
}
