import { describe, expect, it, vi } from 'vitest';
import { eventToAction } from './eventActions';

interface DemoEvent {
  event?: string;
  sessionId?: string;
  session_id?: string;
  status?: string;
}

describe('eventToAction', () => {
  it('runs matched actions by event name', () => {
    const createSession = vi.fn();
    const complete = vi.fn();
    const actions = eventToAction<DemoEvent>(
      {
        session: {
          on: 'CreateSession',
          run: ({ event }) => {
            createSession(event);
          }
        },
        completed: {
          on: ['RunCompleted', 'Done'],
          run: ({ event }) => {
            complete(event);
          }
        }
      },
      {
        resolveEventName: (event) => event.event
      }
    );

    actions.handleEvent({
      event: 'CreateSession',
      sessionId: 'session:1'
    });
    actions.hooks.onPacket?.({
      event: 'Done',
      status: 'ok'
    });

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('supports custom predicate matching for non-UI business events', () => {
    const assignSessionId = vi.fn();
    const actions = eventToAction<DemoEvent>(
      {
        session: {
          match: ({ event }) => {
            return typeof event.session_id === 'string';
          },
          run: ({ event }) => {
            assignSessionId(event.session_id);
          }
        }
      },
      {
        resolveEventName: (event) => event.event
      }
    );

    actions.handleEvent({
      event: 'RunStarted',
      session_id: 'session:demo'
    });

    expect(assignSessionId).toHaveBeenCalledWith('session:demo');
  });
});
