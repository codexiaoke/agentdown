import { describe, expect, it } from 'vitest';
import {
  AgentdownBackendRecoveryTracker,
  attachAgentdownRecoveryMetadata,
  parseAgentdownEventCursor,
  type AgentdownBackendConversationArchive
} from './backendConversation';

describe('backend conversation recovery', () => {
  it('parses the cursor suffix from backend SSE event ids', () => {
    expect(parseAgentdownEventCursor('session:weather:42')).toBe(42);
    expect(parseAgentdownEventCursor('42')).toBe(42);
    expect(parseAgentdownEventCursor('session:weather:nope')).toBeNull();
  });

  it('restores the backend cursor and rejects duplicate event ids', () => {
    const tracker = new AgentdownBackendRecoveryTracker();
    const archive: AgentdownBackendConversationArchive<{ event: string }> = {
      format: 'agentdown.conversation/v1',
      conversation_id: 'session:test',
      provider_id: 'springai',
      latest_cursor: 2,
      status: 'completed',
      updated_at: '2026-08-09T00:00:00Z',
      events: [
        {
          cursor: 1,
          event_id: 'session:test:1',
          request_id: 'request:1',
          event: 'session.created',
          data: { event: 'session.created' },
          created_at: '2026-08-09T00:00:00Z'
        },
        {
          cursor: 2,
          event_id: 'session:test:2',
          request_id: 'request:1',
          event: 'done',
          data: { event: 'done' },
          created_at: '2026-08-09T00:00:01Z'
        }
      ]
    };

    tracker.restore(archive);

    expect(tracker.cursor).toBe(2);
    expect(tracker.isDuplicate({ eventId: 'session:test:2', cursor: 2 })).toBe(true);
    expect(tracker.isDuplicate({ eventId: 'session:test:3', cursor: 3 })).toBe(false);
    tracker.observe({ eventId: 'session:test:3', cursor: 3 });
    expect(tracker.cursor).toBe(3);
  });

  it('attaches recovery metadata without mutating a raw packet', () => {
    const packet = { event: 'response.delta', data: { content: 'hello' } };
    const enriched = attachAgentdownRecoveryMetadata(packet, {
      eventId: 'session:test:7',
      cursor: 7
    });

    expect(enriched).not.toBe(packet);
    expect(enriched).toMatchObject({
      agentdown_recovery: {
        eventId: 'session:test:7',
        cursor: 7
      }
    });
    expect(packet).not.toHaveProperty('agentdown_recovery');
  });
});
