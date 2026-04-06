import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RUN_SURFACE_MESSAGE_ACTIONS,
  extractRunSurfaceMessageText,
  hasRunSurfaceActiveMessageNodes,
  isRunSurfaceActiveMessageNode,
  isRunSurfaceMessageStable,
  resolveRunSurfaceMessageActionItems
} from './messageActions';

describe('surface messageActions helpers', () => {
  it('resolves the default assistant action list', () => {
    expect(resolveRunSurfaceMessageActionItems({
      enabled: true
    }).map((action) => action.key)).toEqual(DEFAULT_RUN_SURFACE_MESSAGE_ACTIONS);
  });

  it('detects draft-like blocks correctly', () => {
    expect(isRunSurfaceMessageStable([
      {
        id: 'block:1',
        slot: 'main',
        type: 'text',
        renderer: 'text',
        state: 'stable',
        data: {}
      }
    ])).toBe(true);

    expect(isRunSurfaceMessageStable([
      {
        id: 'block:1',
        slot: 'main',
        type: 'text',
        renderer: 'markdown.draft',
        state: 'draft',
        data: {}
      }
    ])).toBe(false);
  });

  it('detects running nodes so message actions do not flash during tool execution', () => {
    expect(isRunSurfaceActiveMessageNode({
      id: 'run:1',
      type: 'run',
      status: 'running',
      data: {}
    })).toBe(true);

    expect(hasRunSurfaceActiveMessageNodes(
      [
        {
          id: 'block:1',
          slot: 'main',
          type: 'text',
          renderer: 'text',
          state: 'stable',
          nodeId: 'run:1',
          data: {}
        }
      ],
      {
        nodes: [
          {
            id: 'run:1',
            type: 'run',
            status: 'running',
            data: {}
          }
        ],
        blocks: [],
        intents: [],
        history: []
      }
    )).toBe(true);
  });

  it('extracts readable text from transcript text and html fragments', () => {
    expect(extractRunSurfaceMessageText({
      id: 'message:1',
      slot: 'main',
      role: 'assistant',
      blockIds: [],
      blockKinds: [],
      blocks: [],
      text: '<ul><li><strong>天气：</strong> 晴</li></ul>'
    }, [])).toBe('天气： 晴');
  });
});
