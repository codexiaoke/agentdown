import { describe, expect, it } from 'vitest';
import type { RuntimeSnapshot } from '../runtime/types';
import {
  hasRuntimeSnapshotDiffChanges,
  resolveRuntimeSnapshotDiff
} from './runtimeSnapshotDiff';

/**
 * 创建测试里复用的最小 runtime snapshot。
 */
function createSnapshot(patch: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot {
  return {
    nodes: [],
    blocks: [],
    intents: [],
    history: [],
    ...patch
  };
}

describe('runtimeSnapshotDiff', () => {
  it('detects added and updated blocks', () => {
    const previous = createSnapshot({
      blocks: [
        {
          id: 'block:1',
          slot: 'main',
          type: 'text',
          renderer: 'text',
          state: 'draft',
          data: {},
          content: 'hello'
        }
      ],
      history: [
        {
          id: 'history:1',
          kind: 'command',
          at: 10,
          command: {
            type: 'block.upsert',
            block: {
              id: 'block:1',
              slot: 'main',
              type: 'text',
              renderer: 'text',
              state: 'draft',
              data: {},
              content: 'hello'
            }
          }
        }
      ]
    });
    const next = createSnapshot({
      blocks: [
        {
          id: 'block:1',
          slot: 'main',
          type: 'text',
          renderer: 'text',
          state: 'stable',
          data: {},
          content: 'hello world'
        },
        {
          id: 'block:2',
          slot: 'main',
          type: 'tool',
          renderer: 'tool.weather',
          state: 'stable',
          data: {}
        }
      ],
      history: [
        ...previous.history,
        {
          id: 'history:2',
          kind: 'command',
          at: 12,
          command: {
            type: 'block.patch',
            id: 'block:1',
            patch: {
              state: 'stable',
              content: 'hello world'
            }
          }
        }
      ]
    });

    const diff = resolveRuntimeSnapshotDiff(previous, next);

    expect(diff.summary.addedBlockCount).toBe(1);
    expect(diff.summary.updatedBlockCount).toBe(1);
    expect(diff.summary.historyDelta).toBe(1);
    expect(diff.blocks.added[0]?.id).toBe('block:2');
    expect(diff.blocks.updated[0]?.current.state).toBe('stable');
  });

  it('detects removed nodes and intents', () => {
    const previous = createSnapshot({
      nodes: [
        {
          id: 'node:1',
          type: 'run',
          status: 'running',
          title: 'Weather',
          data: {}
        }
      ],
      intents: [
        {
          id: 'intent:1',
          type: 'approval.requested',
          payload: {},
          at: 20
        }
      ]
    });
    const next = createSnapshot();

    const diff = resolveRuntimeSnapshotDiff(previous, next);

    expect(diff.summary.removedNodeCount).toBe(1);
    expect(diff.summary.removedIntentCount).toBe(1);
    expect(diff.nodes.removed[0]?.id).toBe('node:1');
    expect(diff.intents.removed[0]?.id).toBe('intent:1');
  });

  it('reports when a diff is empty', () => {
    const snapshot = createSnapshot({
      blocks: [
        {
          id: 'block:1',
          slot: 'main',
          type: 'text',
          renderer: 'text',
          state: 'stable',
          data: {},
          content: 'done'
        }
      ]
    });

    const diff = resolveRuntimeSnapshotDiff(snapshot, snapshot);

    expect(hasRuntimeSnapshotDiffChanges(diff)).toBe(false);
  });
});
