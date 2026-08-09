import { EventType, type AGUIEvent, type Message } from '@ag-ui/core';
import { applyAgUiJsonPatch } from './jsonPatch';

export interface AgUiActivityState {
  messageId: string;
  activityType: string;
  content: Record<string, unknown>;
}

export interface AgUiStateSnapshot {
  state: unknown;
  messages: Message[];
  activities: Readonly<Record<string, AgUiActivityState>>;
  revision: number;
}

export interface AgUiStateStore {
  readonly snapshot: AgUiStateSnapshot;
  apply: (event: AGUIEvent) => void;
  reset: () => void;
  subscribe: (listener: (snapshot: AgUiStateSnapshot) => void) => () => void;
}

function cloneValue<T>(value: T): T {
  return typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}

/** 创建独立于 Runtime block 的 AG-UI shared-state/messages/activity 状态仓。 */
export function createAgUiStateStore(): AgUiStateStore {
  let state: unknown = {};
  let messages: Message[] = [];
  let revision = 0;
  const activities = new Map<string, AgUiActivityState>();
  const listeners = new Set<(snapshot: AgUiStateSnapshot) => void>();

  function getSnapshot(): AgUiStateSnapshot {
    return {
      state: cloneValue(state),
      messages: cloneValue(messages),
      activities: Object.fromEntries(
        Array.from(activities.entries(), ([id, activity]) => [id, cloneValue(activity)])
      ),
      revision
    };
  }

  function notify() {
    revision += 1;
    const snapshot = getSnapshot();
    listeners.forEach((listener) => listener(snapshot));
  }

  return {
    get snapshot() {
      return getSnapshot();
    },
    apply(event) {
      switch (event.type) {
        case EventType.RUN_STARTED:
          if (event.input?.state !== undefined) {
            state = cloneValue(event.input.state);
          }
          if (event.input?.messages) {
            messages = cloneValue(event.input.messages);
          }
          break;
        case EventType.STATE_SNAPSHOT:
          state = cloneValue(event.snapshot);
          break;
        case EventType.STATE_DELTA:
          state = applyAgUiJsonPatch(state, event.delta);
          break;
        case EventType.MESSAGES_SNAPSHOT:
          messages = cloneValue(event.messages);
          break;
        case EventType.ACTIVITY_SNAPSHOT:
          activities.set(event.messageId, {
            messageId: event.messageId,
            activityType: event.activityType,
            content: cloneValue(event.content)
          });
          break;
        case EventType.ACTIVITY_DELTA: {
          const current = activities.get(event.messageId);
          if (current) {
            activities.set(event.messageId, {
              ...current,
              content: applyAgUiJsonPatch(current.content, event.patch) as Record<string, unknown>
            });
          }
          break;
        }
      }
      notify();
    },
    reset() {
      state = {};
      messages = [];
      activities.clear();
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
