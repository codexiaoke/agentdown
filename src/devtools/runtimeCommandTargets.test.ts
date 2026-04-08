import { describe, expect, it } from 'vitest';
import type { RuntimeCommand, RuntimeSnapshot } from '../runtime/types';
import {
  resolveRuntimeCommandTargetBlockIds,
  resolveRuntimeSnapshotDiffTargetBlockIds
} from './runtimeCommandTargets';

const snapshot: RuntimeSnapshot = {
  nodes: [
    {
      id: 'node:tool-1',
      type: 'tool',
      title: '查询天气',
      status: 'done',
      data: {}
    }
  ],
  blocks: [
    {
      id: 'block:text-1',
      slot: 'main',
      type: 'text',
      renderer: 'text',
      state: 'stable',
      data: {},
      content: 'hello'
    },
    {
      id: 'block:tool-1',
      slot: 'main',
      type: 'tool',
      renderer: 'tool.weather',
      state: 'stable',
      nodeId: 'node:tool-1',
      data: {}
    }
  ],
  intents: [],
  history: []
};

describe('runtime command target helpers', () => {
  it('resolves direct block ids from block commands', () => {
    const command: RuntimeCommand = {
      type: 'block.patch',
      id: 'block:text-1',
      patch: {
        content: 'updated'
      }
    };

    expect(resolveRuntimeCommandTargetBlockIds(command, snapshot)).toEqual(['block:text-1']);
  });

  it('resolves linked blocks from node commands', () => {
    const command: RuntimeCommand = {
      type: 'node.patch',
      id: 'node:tool-1',
      patch: {
        status: 'running'
      }
    };

    expect(resolveRuntimeCommandTargetBlockIds(command, snapshot)).toEqual(['block:tool-1']);
  });

  it('falls back to external block ids for stream commands', () => {
    const command: RuntimeCommand = {
      type: 'stream.delta',
      streamId: 'stream:1',
      text: 'A'
    };

    expect(resolveRuntimeCommandTargetBlockIds(command, snapshot, {
      fallbackBlockIds: ['block:text-1']
    })).toEqual(['block:text-1']);
  });

  it('extracts added and updated block ids from runtime snapshot diffs', () => {
    expect(resolveRuntimeSnapshotDiffTargetBlockIds({
      summary: {
        addedNodeCount: 0,
        updatedNodeCount: 0,
        removedNodeCount: 0,
        addedBlockCount: 1,
        updatedBlockCount: 1,
        removedBlockCount: 1,
        addedIntentCount: 0,
        removedIntentCount: 0,
        historyDelta: 1
      },
      nodes: {
        added: [],
        updated: [],
        removed: []
      },
      blocks: {
        added: [
          {
            id: 'block:new',
            type: 'text',
            renderer: 'text',
            state: 'stable',
            slot: 'main',
            messageId: null,
            groupId: null,
            contentPreview: 'new'
          }
        ],
        updated: [
          {
            id: 'block:text-1',
            previous: {
              id: 'block:text-1',
              type: 'text',
              renderer: 'text',
              state: 'draft',
              slot: 'main',
              messageId: null,
              groupId: null,
              contentPreview: 'old'
            },
            current: {
              id: 'block:text-1',
              type: 'text',
              renderer: 'text',
              state: 'stable',
              slot: 'main',
              messageId: null,
              groupId: null,
              contentPreview: 'new'
            }
          }
        ],
        removed: [
          {
            id: 'block:removed',
            type: 'text',
            renderer: 'text',
            state: 'stable',
            slot: 'main',
            messageId: null,
            groupId: null,
            contentPreview: 'removed'
          }
        ]
      },
      intents: {
        added: [],
        removed: []
      }
    })).toEqual(['block:new', 'block:text-1']);
  });
});
