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

    const executed = actions.handleEvent({
      event: 'CreateSession',
      sessionId: 'session:1'
    });
    actions.hooks.onPacket?.({
      event: 'Done',
      status: 'ok'
    });

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(executed).toHaveLength(1);
    expect(executed[0]?.key).toBe('session');
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

    const executed = actions.handleEvent({
      event: 'RunStarted',
      session_id: 'session:demo'
    });

    expect(assignSessionId).toHaveBeenCalledWith('session:demo');
    expect(executed[0]?.matchedByPredicate).toBe(true);
  });

  it('can inspect matched side effects without executing them', () => {
    const spy = vi.fn();
    const actions = eventToAction<DemoEvent>(
      {
        session: {
          on: 'CreateSession',
          run: spy
        }
      },
      {
        resolveEventName: (event) => event.event
      }
    );

    const inspected = actions.inspectEvent({
      event: 'CreateSession',
      sessionId: 'session:2'
    });

    expect(inspected).toHaveLength(1);
    expect(inspected[0]?.key).toBe('session');
    expect(spy).not.toHaveBeenCalled();
  });
});
