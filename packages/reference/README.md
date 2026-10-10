# Reference HTTP adapter

Private workspace adapter for the Node reference and real model backends. It uses fetch and SSE with no Vue or React dependency.

```ts
import { createAgentSession } from '@agentdown/core';
import { createReferenceAdapter } from '@agentdown/reference';

const adapter = createReferenceAdapter({ endpoint: '/api' });
const session = createAgentSession({ conversationId: 'demo', adapter });
await session.dispatch({ type: 'send', input: { text: 'Prepare a report' } }).delivery;
```

Creation and subscription are passive. A business operation hands its POST response stream to the Session; resume uses a GET with the committed cursor. An uncertain retry queries the original operation identity before sending again. Backend idempotency protects the same frozen intent when a query finds no accepted operation. HTTP 5xx responses remain uncertain because acceptance may have happened before the failure.

For an authenticated real backend, supply a distinct adapter identity and request headers:

```ts
const adapter = createReferenceAdapter({
  endpoint: 'https://your-agent.example/api',
  id: 'agentdown-model-http',
  version: '1',
  headers: () => ({ Authorization: `Bearer ${getBackendAccessToken()}` }),
});
```

Headers apply to operation submission, reconciliation and event recovery. They remain outside Session archives. Use an application access token here; keep the model API key on the server. A headers object is also accepted when credentials do not rotate. See the [real backend](../../examples/model-server/README.md) for deployment and retention limits.

`loseNextAcknowledgement()` arms one reference-server fault for the next business submission. This package implements the prototype wire contract; AG-UI and other protocol adapters are later work. See [the backend contract](../../examples/reference-server/README.md) for retention and endpoint details.
