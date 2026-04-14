import type { RuntimeCommand } from './types';

/**
 * 移除对象上值为 `undefined` 的字段。
 */
export function compactObject<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, current]) => current !== undefined)) as T;
}

/**
 * 克隆一个可序列化值，优先使用 `structuredClone`。
 */
export function cloneValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Vue reactive proxy 等值无法直接 structuredClone，这里回退到 JSON clone。
    }
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 把单值、数组或空值统一转成数组。
 */
export function toArray<T>(value: T | T[] | null | void): T[] {
  if (value === null || value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

/**
 * 创建一个带前缀的简单递增 ID 工厂。
 */
export function createIdFactory() {
  let sequence = 0;

  /**
   * 生成下一个递增 ID。
   */
  return function makeId(prefix = 'id'): string {
    sequence += 1;
    return `${prefix}:${sequence}`;
  };
}

/**
 * 判断一个值是否实现了 `AsyncIterable`。
 */
export function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value;
}

/**
 * 判断一个值是否实现了 `Iterable`。
 */
export function isIterable<T>(value: unknown): value is Iterable<T> {
  return typeof value === 'object' && value !== null && Symbol.iterator in value;
}

/**
 * 把同步或异步 iterable 统一包装成 async iterable。
 */
export async function* toAsyncIterable<T>(value: AsyncIterable<T> | Iterable<T>): AsyncIterable<T> {
  if (isAsyncIterable<T>(value)) {
    yield* value;
    return;
  }

  for (const item of value) {
    yield item;
  }
}

/**
 * 合并连续、同 streamId 的 `stream.delta` 命令。
 */
export function coalesceStreamDeltas(commands: RuntimeCommand[]): RuntimeCommand[] {
  const coalesced: RuntimeCommand[] = [];

  for (const command of commands) {
    const previous = coalesced[coalesced.length - 1];

    if (
      previous?.type === 'stream.delta' &&
      command.type === 'stream.delta' &&
      previous.streamId === command.streamId
    ) {
      coalesced[coalesced.length - 1] = {
        ...previous,
        text: `${previous.text}${command.text}`
      };
      continue;
    }

    coalesced.push(command);
  }

  return coalesced;
}

/**
 * 把日志数组裁剪到指定最大长度。
 */
export function trimLog<T>(items: T[], maxEntries?: number): T[] {
  if (!maxEntries || items.length <= maxEntries) {
    return items;
  }

  return items.slice(items.length - maxEntries);
}
