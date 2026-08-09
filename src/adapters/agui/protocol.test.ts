import { EventType, type AGUIEvent } from '@ag-ui/core';
import { describe, expect, it } from 'vitest';
import { A2UI_BASIC_CATALOG_ID } from '../../a2ui';
import { createAgUiAdapter } from './adapter';
import { createAgUiProtocol } from './protocol';

describe('createAgUiProtocol', () => {
  it('maps lifecycle, text, tool and A2UI custom events into the runtime', () => {
    const protocol = createAgUiProtocol({ recordEvents: true });
    const adapter = createAgUiAdapter({ protocol });
    const session = adapter.createSession();
    const events: AGUIEvent[] = [
      { type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'run-1' },
      { type: EventType.STATE_SNAPSHOT, snapshot: { status: 'planning' } },
      { type: EventType.TEXT_MESSAGE_START, messageId: 'assistant-1', role: 'assistant' },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'assistant-1', delta: '正在生成计划。' },
      { type: EventType.TEXT_MESSAGE_END, messageId: 'assistant-1' },
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'tool-1',
        toolCallName: 'search_trips',
        parentMessageId: 'assistant-1'
      },
      { type: EventType.TOOL_CALL_ARGS, toolCallId: 'tool-1', delta: '{"city":"杭州"}' },
      { type: EventType.TOOL_CALL_END, toolCallId: 'tool-1' },
      {
        type: EventType.TOOL_CALL_RESULT,
        messageId: 'tool-result-1',
        toolCallId: 'tool-1',
        content: '{"days":2}'
      },
      {
        type: EventType.CUSTOM,
        name: 'a2ui',
        value: {
          version: 'v0.9',
          createSurface: {
            surfaceId: 'trip-planner',
            catalogId: A2UI_BASIC_CATALOG_ID,
            sendDataModel: true
          }
        }
      },
      {
        type: EventType.CUSTOM,
        name: 'a2ui',
        value: {
          version: 'v0.9',
          updateComponents: {
            surfaceId: 'trip-planner',
            components: [
              { id: 'root', component: 'Text', text: { path: '/title' }, variant: 'h2' }
            ]
          }
        }
      },
      {
        type: EventType.CUSTOM,
        name: 'a2ui',
        value: {
          version: 'v0.9',
          updateDataModel: {
            surfaceId: 'trip-planner',
            path: '/',
            value: { title: '杭州周末计划' }
          }
        }
      },
      {
        type: EventType.RUN_FINISHED,
        threadId: 'thread-1',
        runId: 'run-1',
        outcome: { type: 'success' }
      }
    ];

    session.push(events);
    session.flush('test');

    expect(session.runtime.node('run-1')?.status).toBe('done');
    expect(session.runtime.node('tool-1')?.status).toBe('done');
    expect(session.runtime.blocks().some((block) => block.content?.includes('正在生成计划'))).toBe(true);
    const surfaceBlock = session.runtime.block('block:a2ui:trip-planner');
    expect(surfaceBlock?.renderer).toBe('a2ui.surface');
    expect(surfaceBlock?.state).toBe('settled');
    expect((surfaceBlock?.data.messages as unknown[]).length).toBe(3);
    expect(protocol.store.snapshot.state).toEqual({ status: 'planning' });
    expect(session.runtime.history().some((entry) => (
      entry.kind === 'command' && entry.command.type === 'event.record'
    ))).toBe(true);

    session.close();
  });
});
