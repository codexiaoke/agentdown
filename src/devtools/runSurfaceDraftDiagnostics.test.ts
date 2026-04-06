import { describe, expect, it } from 'vitest';
import type { RuntimeSnapshot, SurfaceBlock } from '../runtime/types';
import {
  resolveRunSurfaceDraftDiagnostic,
  resolveRunSurfaceDraftDiagnostics,
  resolveRunSurfaceDraftReason
} from './runSurfaceDraftDiagnostics';

/**
 * 创建测试里复用的最小 draft block。
 */
function createDraftBlock(
  patch: Partial<SurfaceBlock> = {}
): SurfaceBlock {
  return {
    id: 'block:draft',
    slot: 'main',
    type: 'text',
    renderer: 'markdown.draft',
    state: 'draft',
    data: {},
    createdAt: 100,
    updatedAt: 120,
    ...patch
  };
}

describe('runSurfaceDraftDiagnostics', () => {
  it('explains unfinished html blocks with a specific reason', () => {
    expect(resolveRunSurfaceDraftReason({
      streamingDraftMode: 'preview',
      streamingDraftKind: 'html',
      streamingDraftStability: 'close-stable'
    }).title).toBe('等待 HTML 结构闭合');
  });

  it('normalizes one draft block into a visible diagnostic item', () => {
    const diagnostic = resolveRunSurfaceDraftDiagnostic(
      createDraftBlock({
        content: '<div>\n  still streaming',
        data: {
          streamingDraftMode: 'preview',
          streamingDraftKind: 'html',
          streamingDraftStability: 'close-stable',
          streamingDraftMultiline: true
        },
        nodeId: 'node:run',
        messageId: 'message:assistant:1'
      }),
      new Map([
        ['node:run', {
          id: 'node:run',
          type: 'run',
          title: 'HTML Run',
          status: 'streaming',
          data: {}
        }]
      ])
    );

    expect(diagnostic).toMatchObject({
      draftMode: 'preview',
      draftKind: 'html',
      draftStability: 'close-stable',
      multiline: true,
      messageId: 'message:assistant:1',
      nodeTitle: 'HTML Run',
      nodeStatus: 'streaming'
    });
    expect(diagnostic?.domAttributes['data-draft-kind']).toBe('html');
  });

  it('aggregates summary counts for multiple draft modes', () => {
    const snapshot: RuntimeSnapshot = {
      nodes: [],
      blocks: [
        createDraftBlock({
          id: 'block:preview',
          data: {
            streamingDraftMode: 'preview',
            streamingDraftKind: 'table',
            streamingDraftStability: 'separator-stable',
            streamingDraftMultiline: true
          }
        }),
        createDraftBlock({
          id: 'block:hidden',
          data: {
            streamingDraftMode: 'hidden',
            streamingDraftKind: 'blank'
          }
        }),
        {
          id: 'block:stable',
          slot: 'main',
          type: 'text',
          renderer: 'text',
          state: 'stable',
          data: {},
          content: 'done'
        }
      ],
      intents: [],
      history: []
    };

    const result = resolveRunSurfaceDraftDiagnostics(snapshot, {
      slot: 'main'
    });

    expect(result.summary.totalBlockCount).toBe(3);
    expect(result.summary.draftBlockCount).toBe(2);
    expect(result.summary.previewModeCount).toBe(1);
    expect(result.summary.hiddenModeCount).toBe(1);
    expect(result.summary.multilineCount).toBe(1);
    expect(result.summary.kindCounts.table).toBe(1);
    expect(result.summary.kindCounts.blank).toBe(1);
  });
});
