import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  createAgentActions,
  createAgentSession,
  projectAgentView,
  type AgentActions,
  type AgentSession,
  type AgentSessionOptions,
  type AgentViewSnapshot,
  type SessionSnapshot,
} from '@agentdown/core';

const SessionContext = createContext<AgentSession | null>(null);

export interface AgentProviderProps {
  readonly session: AgentSession;
  readonly children?: ReactNode;
}

/** Provides a borrowed session. The application remains its owner. */
export function AgentProvider({ session, children }: AgentProviderProps) {
  return createElement(SessionContext.Provider, { value: session }, children);
}

export interface AgentSessionBinding {
  readonly session: AgentSession;
  readonly snapshot: AgentViewSnapshot;
  readonly actions: AgentActions;
}

interface SessionLease {
  readonly session: AgentSession;
  readonly owned: boolean;
  generation: number;
}

function isSession(input: AgentSession | AgentSessionOptions): input is AgentSession {
  return 'getSnapshot' in input;
}

/**
 * Options create an owned, passive session. An existing session is borrowed.
 * conversationId, adapter identity and mode select an owned instance; remaining
 * options initialize that instance and are not reapplied on ordinary renders.
 */
export function useAgentSession(input?: AgentSession | AgentSessionOptions): AgentSessionBinding {
  const provided = useContext(SessionContext);
  const resolved = input ?? provided;
  if (!resolved) throw new Error('useAgentSession requires a session, options, or AgentProvider.');

  const borrowed = isSession(resolved) ? resolved : null;
  const options = isSession(resolved) ? null : resolved;
  const lease = useMemo<SessionLease>(() => ({
    session: borrowed ?? createAgentSession(options!),
    owned: borrowed === null,
    generation: 0,
  }), [borrowed, options?.conversationId, options?.adapter, options?.mode]);

  useEffect(() => {
    if (!lease.owned) return;
    lease.generation += 1;
    return () => {
      const releaseGeneration = ++lease.generation;
      // StrictMode runs cleanup/setup against the same instance. A renewed
      // lease invalidates this release before its terminal disposal occurs.
      queueMicrotask(() => {
        if (lease.generation === releaseGeneration) lease.session.dispose();
      });
    };
  }, [lease]);

  const session = lease.session;
  const subscribe = useCallback((listener: () => void) => session.subscribe(listener), [session]);
  const getSnapshot = useCallback(() => projectAgentView(session.getSnapshot()), [session]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const actions = useMemo(() => createAgentActions(session), [session]);
  return { session, snapshot, actions };
}

/** Selects domain state without subscribing a component to unrelated changes. */
export function useAgentSelector<Selected>(
  selector: (snapshot: SessionSnapshot) => Selected,
  input?: AgentSession,
  isEqual: (left: Selected, right: Selected) => boolean = Object.is,
): Selected {
  const provided = useContext(SessionContext);
  const session = input ?? provided;
  if (!session) throw new Error('useAgentSelector requires a session or AgentProvider.');

  const subscribe = useCallback((listener: () => void) => session.subscribe(listener), [session]);
  const getSelection = useMemo(() => {
    let previousSnapshot: SessionSnapshot | undefined;
    let previousSelection: Selected;
    let initialized = false;
    return () => {
      const snapshot = session.getSnapshot();
      if (initialized && previousSnapshot === snapshot) return previousSelection;
      const selection = selector(snapshot);
      if (!initialized || !isEqual(previousSelection!, selection)) previousSelection = selection;
      initialized = true;
      previousSnapshot = snapshot;
      return previousSelection!;
    };
  }, [session, selector, isEqual]);
  return useSyncExternalStore(subscribe, getSelection, getSelection);
}
