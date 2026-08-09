/** JSON Patch 操作的最小结构；运行时仍会逐字段校验。 */
export interface AgUiJsonPatchOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  from?: string;
  value?: unknown;
}

const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

function cloneValue<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function parsePointer(path: string): string[] {
  if (path === '') {
    return [];
  }
  if (!path.startsWith('/')) {
    throw new Error(`Invalid JSON Pointer: ${path}.`);
  }

  return path.slice(1).split('/').map((segment) => {
    const decoded = segment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (FORBIDDEN_SEGMENTS.has(decoded)) {
      throw new Error(`Forbidden JSON Pointer segment: ${decoded}.`);
    }
    return decoded;
  });
}

function readAt(root: unknown, path: string): unknown {
  let current = root;
  for (const segment of parsePointer(path)) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isSafeInteger(index) || index < 0 || index >= current.length) {
        throw new Error(`JSON Patch array index is out of bounds: ${segment}.`);
      }
      current = current[index];
      continue;
    }
    if (!current || typeof current !== 'object' || !(segment in current)) {
      throw new Error(`JSON Patch path does not exist: ${path}.`);
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function resolveParent(root: unknown, path: string): {
  parent: Record<string, unknown> | unknown[];
  key: string;
} {
  const segments = parsePointer(path);
  if (segments.length === 0) {
    throw new Error('Root JSON Patch operations do not have a parent.');
  }

  const key = segments.pop()!;
  let current = root;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isSafeInteger(index) || index < 0 || index >= current.length) {
        throw new Error(`JSON Patch array index is out of bounds: ${segment}.`);
      }
      current = current[index];
    } else if (current && typeof current === 'object' && segment in current) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      throw new Error(`JSON Patch parent path does not exist: ${path}.`);
    }
  }

  if (!current || typeof current !== 'object') {
    throw new Error(`JSON Patch parent is not a container: ${path}.`);
  }

  return { parent: current as Record<string, unknown> | unknown[], key };
}

function addAt(root: unknown, path: string, value: unknown): unknown {
  if (path === '') {
    return cloneValue(value);
  }
  const { parent, key } = resolveParent(root, path);
  if (Array.isArray(parent)) {
    if (key === '-') {
      parent.push(cloneValue(value));
      return root;
    }
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index < 0 || index > parent.length) {
      throw new Error(`JSON Patch array add index is out of bounds: ${key}.`);
    }
    parent.splice(index, 0, cloneValue(value));
  } else {
    parent[key] = cloneValue(value);
  }
  return root;
}

function replaceAt(root: unknown, path: string, value: unknown): unknown {
  if (path === '') {
    return cloneValue(value);
  }
  readAt(root, path);
  const { parent, key } = resolveParent(root, path);
  if (Array.isArray(parent)) {
    parent[Number(key)] = cloneValue(value);
  } else {
    parent[key] = cloneValue(value);
  }
  return root;
}

function removeAt(root: unknown, path: string): unknown {
  if (path === '') {
    return undefined;
  }
  readAt(root, path);
  const { parent, key } = resolveParent(root, path);
  if (Array.isArray(parent)) {
    parent.splice(Number(key), 1);
  } else {
    delete parent[key];
  }
  return root;
}

function assertOperation(value: unknown): asserts value is AgUiJsonPatchOperation {
  if (!value || typeof value !== 'object') {
    throw new Error('AG-UI state delta contains an invalid JSON Patch operation.');
  }
  const operation = value as Partial<AgUiJsonPatchOperation>;
  if (
    !operation.op
    || !['add', 'remove', 'replace', 'move', 'copy', 'test'].includes(operation.op)
    || typeof operation.path !== 'string'
  ) {
    throw new Error('AG-UI state delta contains an invalid JSON Patch operation.');
  }
  parsePointer(operation.path);
  if ((operation.op === 'move' || operation.op === 'copy') && typeof operation.from !== 'string') {
    throw new Error(`JSON Patch ${operation.op} operation requires from.`);
  }
  if (operation.from) {
    parsePointer(operation.from);
  }
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** 安全地把 RFC 6902 JSON Patch 应用到克隆后的状态，不修改调用方原对象。 */
export function applyAgUiJsonPatch(state: unknown, patch: ReadonlyArray<unknown>): unknown {
  let next = cloneValue(state);

  for (const candidate of patch) {
    assertOperation(candidate);
    switch (candidate.op) {
      case 'add':
        next = addAt(next, candidate.path, candidate.value);
        break;
      case 'replace':
        next = replaceAt(next, candidate.path, candidate.value);
        break;
      case 'remove':
        next = removeAt(next, candidate.path);
        break;
      case 'copy':
        next = addAt(next, candidate.path, readAt(next, candidate.from!));
        break;
      case 'move': {
        const value = cloneValue(readAt(next, candidate.from!));
        next = removeAt(next, candidate.from!);
        next = addAt(next, candidate.path, value);
        break;
      }
      case 'test':
        if (!deepEqual(readAt(next, candidate.path), candidate.value)) {
          throw new Error(`JSON Patch test failed at ${candidate.path}.`);
        }
        break;
    }
  }

  return next;
}
