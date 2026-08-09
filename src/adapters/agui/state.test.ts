import { EventType } from '@ag-ui/core';
import { describe, expect, it, vi } from 'vitest';
import { createAgUiStateStore } from './state';

describe('createAgUiStateStore', () => {
  it('tracks shared state, messages and activity patches', () => {
    const store = createAgUiStateStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.apply({ type: EventType.STATE_SNAPSHOT, snapshot: { count: 1 } });
    store.apply({ type: EventType.STATE_DELTA, delta: [{ op: 'replace', path: '/count', value: 2 }] });
    store.apply({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [{ id: 'm1', role: 'user', content: 'hello' }]
    });
    store.apply({
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: 'a1',
      activityType: 'progress',
      content: { percent: 10 },
      replace: true
    });
    store.apply({
      type: EventType.ACTIVITY_DELTA,
      messageId: 'a1',
      activityType: 'progress',
      patch: [{ op: 'replace', path: '/percent', value: 80 }]
    });

    expect(store.snapshot.state).toEqual({ count: 2 });
    expect(store.snapshot.messages[0]).toMatchObject({ id: 'm1', role: 'user' });
    expect(store.snapshot.activities.a1?.content).toEqual({ percent: 80 });
    expect(listener).toHaveBeenCalledTimes(5);
  });
});
