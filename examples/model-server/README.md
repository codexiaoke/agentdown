# Real model backend

This server implements the same Agentdown operation/event contract as the reference backend, but each assistant response and tool decision comes from the configured DeepSeek model. It does not fall back to demo responses.

```bash
export DEEPSEEK_API_KEY='your-provider-key'
# Optional: DEEPSEEK_BASE_URL, DEEPSEEK_MODEL (default: deepseek-flash)
# DEEPSEEK_MAX_TOKENS (default: 1500), DEEPSEEK_TIMEOUT_MS (default: 90000)
npm ci --prefix examples/model-server --omit=dev --ignore-scripts
node examples/model-server/server.mjs
```

The default address is `http://127.0.0.1:8011`. Keep the provider key on the server. A browser uses a separate Agentdown access token, never the provider key.

For a public bind, configure `AGENTDOWN_ACCESS_TOKEN` and set `HOST=0.0.0.0`. All `/api/*` requests require `Authorization: Bearer <Agentdown access token>`. `/health` returns only the protocol, capabilities and whether authentication is enabled. The server refuses a public bind without authentication.

`AGENTDOWN_CORS_ORIGINS` accepts comma-separated exact origins, for example `https://codexiaoke.github.io`. It does not accept `*`. A same-origin deployment can serve a previously built UI through `AGENTDOWN_STATIC_DIR=dist-next/prototype`; asset files cannot traverse outside that directory. A reverse proxy terminating HTTPS should add its public HTTPS origin to the allowed list.

## What executes

- Direct questions stream model text and finish without synthetic approval cards.
- The model can request `save_report({ title, content })`. Each call creates a separate human approval. Approved reports are written to `AGENTDOWN_DATA_DIR` (default `.agentdown-data`) with generated filenames and restrictive permissions. The UI receives the actual report text as an artifact. No public publishing tool exists.
- Rejected calls return a denial to the model, which continues with the approved and denied tool results. A repeated delivery of the same operation cannot call the model or save the report again.
- Disconnecting an event observer leaves the model task running. Explicit cancellation aborts the model request and expires pending approvals. An already committed report remains on disk.
- A failed model stream marks the execution failed. Regeneration starts another execution of the same original turn; it does not replay side effects automatically.

Execution state, operation receipts and replay events remain in memory until the process exits. Report files persist, but this server does not restore running tasks or conversation history after a restart. It accepts text input only and caps the model loop at eight rounds, tool batches at eight calls, active tasks at four and conversation context at approximately 256 KB of serialized messages. This is an initial real backend, not a durable job queue or multi-user account service.

## HTTP contract

| Route | Behavior |
| --- | --- |
| `POST /api/operations` | Accept an operation; JSON receipt by default, or same-POST SSE with `Accept: text/event-stream`. |
| `GET /api/operations/:operationId` | Query whether an uncertain operation was accepted. |
| `GET /api/executions/:executionId/events?cursor=N` | Replay events strictly after the committed cursor, then observe live events. |
| `GET /health` | Non-sensitive readiness and protocol metadata. |

Business identity freezes conversation, execution, turn, interaction revision and action. Delivery attempt IDs and cursors can change. A reused operation ID with changed business input returns HTTP 409. The optional `X-Agentdown-Drop-Ack: true` test header accepts the operation before dropping the first acknowledgement; recovery can query and retry without repeating model or tool work.

For embedding, `createModelServer({ provider, dataDir, accessToken, corsOrigins, staticDir, ... })` returns a standard Node HTTP server. `provider.stream({ messages, tools, signal })` yields text deltas and completed tool calls. The injected provider makes integration tests independent of a paid model.

```bash
node --test examples/model-server/*.test.mjs
```

The server uses Node built-ins and the included provider. Its HTTP client uses the `undici` runtime dependency to preserve the environment proxy and CA trust; it needs no backend framework or model SDK.

## Deploy with the UI

From the repository root, build the UI in real mode and then build the image:

```bash
npm ci
npm run build:live
docker build -f examples/model-server/Dockerfile -t agentdown-live .
```

Configure `DEEPSEEK_API_KEY` and a separate `AGENTDOWN_ACCESS_TOKEN` in your hosting platform's secret settings. Start the container with port 8011 behind HTTPS and a persistent volume at `/data`. The image serves Vue at `/` and React at `/react.html`, with the API at `/api`. Enter the backend access token in the UI connection settings. For a reverse proxy, set `AGENTDOWN_CORS_ORIGINS` to the public site origin.

To connect the GitHub Pages preview instead, allow `https://codexiaoke.github.io` in `AGENTDOWN_CORS_ORIGINS`, then enter the public backend URL ending in `/api` and its access token on the preview. GitHub Pages alone cannot execute this backend or hold the provider key.

In a managed environment whose proxy uses a custom CA, supply the public CA through the optional BuildKit secret `--secret id=proxy_ca,src=/path/to/proxy-ca.pem`. Mount that CA read-only at runtime and set `NODE_EXTRA_CA_CERTS` to its mounted path. The image does not contain credentials or the build-time CA.
