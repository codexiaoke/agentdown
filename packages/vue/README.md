# Vue bindings prototype

`useAgentSession(options)` creates one passive owned session for the current Vue
scope. It returns `{ session, snapshot, actions }`; `snapshot` is a readonly
computed `AgentViewSnapshot`. Stopping the scope releases client resources.

```ts
const { session, snapshot, actions } = useAgentSession({ conversationId, adapter });
const operation = actions.send({ text: 'Start the task' });
const delivery = await operation.delivery;
```

Options are setup-time configuration. Remount the owner with a different key when
changing conversation identity. `useAgentSession(session)` borrows an existing
session and scope cleanup only unsubscribes. `AgentProvider` provides a borrowed
session to descendants; changing its session identity remounts its consumers.

Descendants can call `useAgentSession()` or
`useAgentSelector(selector, session?, isEqual?)`. A borrowed session remains owned
by the application, which must eventually call `session.dispose()`. Creation,
subscriptions, provider mounting and SSR never start requests. For SSR, create
stateful instances separately for each request.

This is a private workspace prototype, not a published installation instruction.
