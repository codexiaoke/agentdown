import {
  Fragment,
  computed,
  defineComponent,
  getCurrentScope,
  h,
  inject,
  onScopeDispose,
  provide,
  shallowRef,
  watch,
  type ComputedRef,
  type InjectionKey,
  type PropType,
} from 'vue';
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

const SessionContext: InjectionKey<ComputedRef<AgentSession>> = Symbol('Agentdown session');

/** Provides a borrowed session and remounts consumers when its identity changes. */
export const AgentProvider = defineComponent({
  name: 'AgentProvider',
  props: {
    session: { type: Object as PropType<AgentSession>, required: true },
  },
  setup(props, { slots }) {
    provide(SessionContext, computed(() => props.session));
    const identity = shallowRef(0);
    watch(() => props.session, () => { identity.value += 1; }, { flush: 'sync' });
    return () => h(Fragment, { key: identity.value }, slots.default?.());
  },
});

export interface AgentSessionBinding {
  readonly session: AgentSession;
  readonly snapshot: ComputedRef<AgentViewSnapshot>;
  readonly actions: AgentActions;
}

function requireScope() {
  if (!getCurrentScope()) throw new Error('Agentdown composables require an active Vue effect scope.');
}

function resolveSession(input?: AgentSession): AgentSession {
  const session = input ?? inject(SessionContext, undefined)?.value;
  if (!session) throw new Error('Agentdown composables require a session or AgentProvider.');
  return session;
}

function subscribeToSession(session: AgentSession) {
  const snapshot = shallowRef(session.getSnapshot());
  const unsubscribe = session.subscribe(() => { snapshot.value = session.getSnapshot(); });
  onScopeDispose(unsubscribe);
  return snapshot;
}

/**
 * Options initialize one owned session for this scope; an existing session is
 * borrowed. For another conversation, remount the owner with a different key.
 */
export function useAgentSession(input?: AgentSession | AgentSessionOptions): AgentSessionBinding {
  requireScope();
  const owned = input !== undefined && !('getSnapshot' in input);
  const session = owned ? createAgentSession(input) : resolveSession(input as AgentSession | undefined);
  const domain = subscribeToSession(session);
  if (owned) onScopeDispose(() => session.dispose());
  return {
    session,
    snapshot: computed(() => projectAgentView(domain.value)),
    actions: createAgentActions(session),
  };
}

/** A readonly selector over core domain state, with optional result equality. */
export function useAgentSelector<Selected>(
  selector: (snapshot: SessionSnapshot) => Selected,
  input?: AgentSession,
  isEqual: (left: Selected, right: Selected) => boolean = Object.is,
): ComputedRef<Selected> {
  requireScope();
  const domain = subscribeToSession(resolveSession(input));
  let previousSelection: Selected;
  let initialized = false;
  return computed(() => {
    const selection = selector(domain.value);
    if (!initialized || !isEqual(previousSelection!, selection)) previousSelection = selection;
    initialized = true;
    return previousSelection!;
  });
}
