import { EventType, type AGUIEvent } from '@ag-ui/core';
import { describe, expect, it } from 'vitest';
import { createAgUiAdapter } from './adapter';
import { createAgUiProtocol } from './protocol';

describe('createAgUiProtocol', () => {
  it('maps lifecycle, text and tool events without interpreting custom events', () => {
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
        value: { applicationDefined: true }
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
    expect(session.runtime.blocks().some((block) => block.type === 'a2ui')).toBe(false);
    expect(protocol.store.snapshot.state).toEqual({ status: 'planning' });
    expect(session.runtime.history().some((entry) => (
      entry.kind === 'command' && entry.command.type === 'event.record'
    ))).toBe(true);

    session.close();
  });

  it('maps compact tool chunks and thinking lifecycle events', () => {
    const adapter = createAgUiAdapter();
    const session = adapter.createSession();

    session.push([
      { type: EventType.RUN_STARTED, threadId: 'thread-chunk', runId: 'run-chunk' },
      { type: EventType.THINKING_START, title: '规划路线' },
      {
        type: EventType.TOOL_CALL_CHUNK,
        toolCallId: 'tool-chunk',
        toolCallName: 'draft_trip',
        parentMessageId: 'assistant-chunk',
        delta: '{"city"'
      },
      { type: EventType.TOOL_CALL_CHUNK, delta: ':"杭州"}' },
      { type: EventType.TOOL_CALL_END, toolCallId: 'tool-chunk' },
      {
        type: EventType.TOOL_CALL_RESULT,
        messageId: 'tool-result-chunk',
        toolCallId: 'tool-chunk',
        content: '{"ok":true}'
      },
      { type: EventType.THINKING_END },
      { type: EventType.RUN_FINISHED, threadId: 'thread-chunk', runId: 'run-chunk' }
    ] as AGUIEvent[]);
    session.flush('compact-events');

    expect(session.runtime.node('tool-chunk')).toMatchObject({
      status: 'done',
      title: 'draft_trip'
    });
    expect(session.runtime.block('block:tool-chunk')?.data).toMatchObject({
      arguments: '{"city":"杭州"}',
      result: '{"ok":true}'
    });
    expect(session.runtime.node('agui:thinking:run-chunk')).toMatchObject({
      type: 'reasoning',
      status: 'done',
      title: '规划路线'
    });

    session.close();
  });
});
