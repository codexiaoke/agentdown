import type { RuntimeCommand } from './types';

export function compactObject<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, current]) => current !== undefined)) as T;
}

export function cloneValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

export function toArray<T>(value: T | T[] | null | void): T[] {
  if (value === null || value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

export function createIdFactory() {
  let sequence = 0;

  return function makeId(prefix = 'id'): string {
    sequence += 1;
    return `${prefix}:${sequence}`;
  };
}

export function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value;
}

export function isIterable<T>(value: unknown): value is Iterable<T> {
  return typeof value === 'object' && value !== null && Symbol.iterator in value;
}

export async function* toAsyncIterable<T>(value: AsyncIterable<T> | Iterable<T>): AsyncIterable<T> {
  if (isAsyncIterable<T>(value)) {
    yield* value;
    return;
  }

  for (const item of value) {
    yield item;
  }
}

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

export function trimLog<T>(items: T[], maxEntries?: number): T[] {
  if (!maxEntries || items.length <= maxEntries) {
    return items;
  }

  return items.slice(items.length - maxEntries);
}
