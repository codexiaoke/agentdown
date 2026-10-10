# Agentdown core contract prototype

Pure TypeScript, no runtime dependencies, no UI framework or DOM rendering. Package names are local workspace names until publishing is decided.

```ts
import { createAgentSession, projectAgentView } from '@agentdown/core';

const session = createAgentSession({ conversationId: 'research-1', adapter });
const unsubscribe = session.subscribe(() => {
  console.log(projectAgentView(session.getSnapshot()));
});
const handle = session.dispatch({ type: 'send', input: { text: 'Research this project' } });
const delivery = await handle.delivery;
// A delivered request is not a completed execution or resolved approval.
unsubscribe();
session.dispose();
```

## Stage 0 support

- Passive creation/subscription, immutable revision-stable snapshots, cached shared view projections.
- Turns and multiple executions/runs, text messages, steps, tools, independent interactions and versioned artifacts.
- Send, approval/input responses, regenerate, cancel request, local disconnect, explicit resume and operation retry.
- Separate request delivery, backend acceptance, execution status and connection status. Approval responses use `{ approved: boolean }`; backend events confirm resolution.
- Frozen operation payloads and stable operation identity across retries. Response operations freeze `interactionRevision`; stale revisions cannot be retried and adapters can pass the condition to the backend. Uncertain retries require backend operation idempotency. Query-only recovery and automatic retry are not implemented.
- Per-stream committed cursors and event-identity dedupe persist in schema-version-1 archives. Event IDs must be stable within their logical stream; transports must deliver each stream in order. No gap buffering or arbitrary dedupe eviction is implemented.
- Strict archive validation, passive live restore and replay. Adapter identity/version must match exactly. Replay rejects all writes; restoring a live archive requires an explicit resume action.
- Async connection epochs and AbortSignal lifecycle guards. Dispose settles queued delivery as failed and issued/unconfirmed delivery as uncertain; dispose never sends backend cancellation.

Surface actions, shared Agent state updates, rich content parts, general JSON Schema form validation, historical import converters, operation queries, native protocol adapters and UI rendering are future stages. Requests and actual authorization remain the backend's responsibility. Backend receipt confirmation is trusted only when the adapter can establish it. Core does not promise exactly-once execution without backend idempotency.

Snapshot archives contain business content and unresolved operation payloads. The host controls persistence and credential-free request configuration; archives contain no adapter request headers or credentials.
