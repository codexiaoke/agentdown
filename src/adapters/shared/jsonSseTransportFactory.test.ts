import { describe, expect, it, vi } from 'vitest';
import { createFrameworkJsonSseTransport } from './jsonSseTransportFactory';
import type { AgentdownEventRecoveryMetadata } from '../../recovery/backendConversation';
import type { RuntimeData } from '../../runtime/types';

interface RecoveryContext {
  sessionId: string;
  clientRequestId: string;
  afterCursor: number;
}

function sseResponse(frames: string): Response {
  return new Response(frames, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream'
    }
  });
}

describe('createFrameworkJsonSseTransport recovery', () => {
  it('adds recovery identity to the request and drops repeated SSE event ids', async () => {
    const applied = new Set<string>();
    const observed: AgentdownEventRecoveryMetadata[] = [];
    const fetcher = vi.fn(async (_source: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        message: 'hello',
        session_id: 'session:test',
        client_request_id: 'request:test',
        after_cursor: 4
      });
      return sseResponse([
        'id: session:test:5',
        'event: response.delta',
        'data: {"event":"response.delta","data":{"content":"A"}}',
        '',
        'id: session:test:5',
        'event: response.delta',
        'data: {"event":"response.delta","data":{"content":"A"}}',
        '',
        ''
      ].join('\n'));
    });
    const transport = createFrameworkJsonSseTransport<
      Record<string, unknown>,
      string,
      RuntimeData,
      RecoveryContext
    >({
      options: {
        fetch: fetcher as typeof fetch,
        message: 'hello',
        resolveContext: () => ({
          sessionId: 'session:test',
          clientRequestId: 'request:test',
          afterCursor: 4
        }),
        recovery: {
          isDuplicate(metadata) {
            return applied.has(metadata.eventId);
          },
          onEvent(metadata) {
            applied.add(metadata.eventId);
            observed.push(metadata);
          }
        }
      }
    });

    const packets = [];
    for await (const packet of transport.connect('/api/stream/springai', {
      signal: new AbortController().signal
    })) {
      packets.push(packet);
    }

    expect(packets).toHaveLength(1);
    expect(packets[0]).toMatchObject({
      agentdown_recovery: {
        eventId: 'session:test:5',
        cursor: 5
      }
    });
    expect(observed).toEqual([{ eventId: 'session:test:5', cursor: 5 }]);
  });
});
