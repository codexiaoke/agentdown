# React bindings prototype

`useAgentSession(options)` creates a passive owned session. Explicit actions start
requests; mounting, subscribing and SSR never do. The owner releases client
resources after final unmount, including under React StrictMode.

```tsx
const { session, snapshot, actions } = useAgentSession({ conversationId, adapter });
// snapshot is the current readonly AgentViewSnapshot.
const operation = actions.send({ text: 'Start the task' });
const delivery = await operation.delivery;
```

`useAgentSession(session)` borrows an application-owned session. `AgentProvider`
lets descendants call `useAgentSession()` or `useAgentSelector(selector)`; neither
the provider nor borrowed consumers dispose the session. The application owner
must eventually call `session.dispose()`.

`useAgentSelector(selector, session?, isEqual?)` selects core domain state. Owned
instances change when `conversationId`, adapter identity or mode changes. Other
options initialize an instance once. Keep adapter definitions stable across
ordinary renders. For SSR, create stateful instances separately for each request.

This is a private workspace prototype, not a published installation instruction.
