import { EventType } from '@ag-ui/core';
import { describe, expect, it, vi } from 'vitest';
import { createAgUiSseTransport } from './transport';

describe('createAgUiSseTransport', () => {
  it('posts a schema-valid RunAgentInput and parses AG-UI SSE events', async () => {
    const fetcher = vi.fn(async (_source: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(init?.method).toBe('POST');
      expect(body).toMatchObject({
        threadId: 'thread-1',
        runId: 'run-1',
        state: { locale: 'zh-CN' },
        messages: [{ role: 'user', content: '做一个周末计划' }],
        tools: [],
        context: []
      });
      expect(body).not.toHaveProperty('session_id');
      expect(body).not.toHaveProperty('client_request_id');
      expect(body).not.toHaveProperty('after_cursor');
      expect(new Headers(init?.headers).get('Accept')).toContain('application/vnd.ag-ui.event-stream');

      return new Response([
        'id: 1',
        `data: ${JSON.stringify({ type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'run-1' })}`,
        '',
        'id: 2',
        `data: ${JSON.stringify({ type: EventType.RUN_FINISHED, threadId: 'thread-1', runId: 'run-1' })}`,
        '',
        ''
      ].join('\n'), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      });
    });
    const transport = createAgUiSseTransport<string>({
      fetch: fetcher,
      message: '做一个周末计划',
      state: { locale: 'zh-CN' },
      resolveContext: () => ({
        requestText: '做一个周末计划',
        submission: null,
        sessionId: 'thread-1',
        clientRequestId: 'run-1',
        afterCursor: 0,
        replayOnly: false
      })
    });
    const events = [];

    for await (const event of transport.connect('/api/stream/agui', {
      signal: new AbortController().signal
    })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.RUN_FINISHED
    ]);
  });
});
