import { EventType, type AGUIEvent } from '@ag-ui/core';
import { describe, expect, it } from 'vitest';
import { A2UI_BASIC_CATALOG_ID } from '../../a2ui';
import { createAgUiA2UiAdapter } from './adapter';
import { createAgUiA2UiProtocol } from './protocol';

const createSurface = {
  version: 'v0.9.1',
  createSurface: {
    surfaceId: 'planner',
    catalogId: A2UI_BASIC_CATALOG_ID,
    sendDataModel: true
  }
};

describe('AG-UI+A2UI protocol extension', () => {
  it('retains surface history across runs and keeps the block updateable', () => {
    const a2uiProtocol = createAgUiA2UiProtocol();
    const adapter = createAgUiA2UiAdapter({ a2uiProtocol });
    const session = adapter.createSession();

    session.push([
      { type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'run-1' },
      { type: EventType.TEXT_MESSAGE_START, messageId: 'assistant-1', role: 'assistant' },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'assistant-1', delta: '计划如下。' },
      { type: EventType.TEXT_MESSAGE_END, messageId: 'assistant-1' },
      { type: EventType.CUSTOM, name: 'a2ui', value: createSurface },
      {
        type: EventType.CUSTOM,
        name: 'a2ui',
        value: {
          version: 'v0.9.1',
          updateDataModel: { surfaceId: 'planner', path: '/', value: { city: '杭州' } }
        }
      },
      { type: EventType.RUN_FINISHED, threadId: 'thread-1', runId: 'run-1' }
    ] as AGUIEvent[]);
    session.flush('run-1');

    a2uiProtocol.reset?.();
    session.push([
      { type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'run-2' },
      {
        type: EventType.CUSTOM,
        name: 'a2ui',
        value: {
          version: 'v0.9.1',
          updateDataModel: { surfaceId: 'planner', path: '/city', value: '苏州' }
        }
      },
      { type: EventType.RUN_FINISHED, threadId: 'thread-1', runId: 'run-2' }
    ] as AGUIEvent[]);
    session.flush('run-2');

    const block = session.runtime.block('block:a2ui:thread-1:planner');
    expect(block).toMatchObject({
      renderer: 'a2ui.surface',
      state: 'stable',
      conversationId: 'thread-1',
      turnId: 'run-2',
      messageId: 'assistant-1'
    });
    expect((block?.data.messages as unknown[])).toHaveLength(3);
    expect(a2uiProtocol.getSurfaceMessages('thread-1', 'planner')).toHaveLength(3);

    session.close();
  });

  it('uses the main AG-UI message resolver for A2UI blocks', () => {
    const adapter = createAgUiA2UiAdapter({
      protocolOptions: {
        messageId: () => 'message:assistant:semantic'
      }
    });
    const session = adapter.createSession();

    session.push([
      { type: EventType.RUN_STARTED, threadId: 'thread-semantic', runId: 'run-semantic' },
      { type: EventType.TEXT_MESSAGE_START, messageId: 'message:assistant:raw', role: 'assistant' },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'message:assistant:raw', delta: '计划如下。' },
      { type: EventType.TEXT_MESSAGE_END, messageId: 'message:assistant:raw' },
      { type: EventType.CUSTOM, name: 'a2ui', value: createSurface },
      { type: EventType.RUN_FINISHED, threadId: 'thread-semantic', runId: 'run-semantic' }
    ] as AGUIEvent[]);
    session.flush('semantic-message');

    const textBlock = session.runtime.blocks().find((block) => block.type === 'text');
    expect(textBlock?.messageId).toBe('message:assistant:semantic');
    expect(session.runtime.block('block:a2ui:thread-semantic:planner')?.messageId)
      .toBe('message:assistant:semantic');

    session.close();
  });

  it('ignores RAW events unless their source is explicitly allowed', () => {
    const defaultAdapter = createAgUiA2UiAdapter();
    const defaultSession = defaultAdapter.createSession();
    defaultSession.push([
      { type: EventType.RUN_STARTED, threadId: 'thread-raw', runId: 'run-raw' },
      { type: EventType.RAW, source: 'a2ui', event: createSurface }
    ] as AGUIEvent[]);
    defaultSession.flush('raw-disabled');
    expect(defaultSession.runtime.blocks().some((block) => block.type === 'a2ui')).toBe(false);
    defaultSession.close();

    const allowedAdapter = createAgUiA2UiAdapter({
      a2uiProtocolOptions: { rawEventSources: new Set(['a2ui']) }
    });
    const allowedSession = allowedAdapter.createSession();
    allowedSession.push([
      { type: EventType.RUN_STARTED, threadId: 'thread-raw', runId: 'run-raw' },
      { type: EventType.RAW, source: 'a2ui', event: createSurface }
    ] as AGUIEvent[]);
    allowedSession.flush('raw-enabled');
    expect(allowedSession.runtime.block('block:a2ui:thread-raw:planner')).toBeDefined();
    allowedSession.close();
  });

  it('rejects malformed messages on a matched extension event', () => {
    const protocol = createAgUiA2UiProtocol();
    expect(() => protocol.map({
      packet: { type: EventType.CUSTOM, name: 'a2ui', value: { arbitrary: true } },
      context: {
        now: () => 1,
        makeId: (prefix = 'id') => `${prefix}:1`
      }
    })).toThrow('Invalid A2UI message');
  });
});
