# Agentdown · agentdown-next

Language: [中文](./README.md) | **English**

Agentdown is being rewritten as an agent interaction runtime for multiple frontend frameworks. It covers the frontend flow from starting a task, streaming execution, tools and human decisions to artifacts, reconnection and historical replay. Vue and React share one pure TypeScript Session; the backend remains responsible for model calls, task execution and business authorization.

This repository currently contains the **agentdown-next rewrite prototype**. Stage 0 implements the core contract, both framework bindings and a model-free reference backend. An optional real DeepSeek backend is also available. This preview allows breaking changes, is incompatible with the old API and is not yet a complete production library. The new `@agentdown/*` workspace packages are all `private` and have not been published to npm.

## Online preview

[Open the workspace](https://codexiaoke.github.io/agentdown/next/) · [React example](https://codexiaoke.github.io/agentdown/next/react.html)

The online preview defaults to a browser-only, no-model fixture backend. Tasks and event logs stay in the current browser and support approvals, refresh recovery, replay and lost-acknowledgement simulation. This static URL does not have a deployed live model service; real model use requires your own public backend. Local development defaults to the Node HTTP reference backend.

## Deploy a real demo

[Deploy to Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fcodexiaoke%2Fagentdown%2Ftree%2Frewrite%2Fagentdown-next)

Deployment configuration is ready, but no public real backend URL has been provided yet. It uses Render Free, Node 24 and the rewrite branch, with automatic deployment disabled. Enter `DEEPSEEK_API_KEY` in the platform's secure environment settings; do not send it in chat or put it in the frontend. The platform generates a separate `AGENTDOWN_ACCESS_TOKEN`.

After deployment, open the assigned domain and enter that domain plus `/api` and the access token in the UI settings. One service serves Vue, React and the API. Free instances may sleep and take time to wake; sleep or restart loses in-memory history, and temporary report files are not long-term storage. See the [real demo guide](./examples/model-server/DEMO.md) for the steps in Chinese.

## Run the local no-model demo

Use Node.js `^20.19.0 || >=22.12.0`. From the repository root:

```sh
npm ci
npm run dev
```

`npm run dev:next` is equivalent to `npm run dev`. Both start the Vite prototype and Node reference backend. No model credentials are required.

- Default Vue workspace: [http://localhost:5174/](http://localhost:5174/), with a link to React.
- Vue entry: [http://localhost:5174/vue.html](http://localhost:5174/vue.html)
- React entry: [http://localhost:5174/react.html](http://localhost:5174/react.html)
- Reference backend: `http://localhost:8010`, accessed through the frontend's `/api` proxy.

## Run the real demo locally

Configure `DEEPSEEK_API_KEY` in the server environment, then run:

```sh
npm run demo:live
```

This runs `build:live`, then starts one Node service serving Vue, React and the API. The default entry is `http://127.0.0.1:8011/`, with React at `/react.html` and the API at `/api`. Startup verifies the live build marker and rejects no-model fixture builds. Hosting environments with an existing live build use `npm run start:demo`.

For development with hot reload, `npm run dev:live` remains available. It sets `VITE_AGENT_MODE=live`, disables the browser fixture, and starts the model backend at `127.0.0.1:8011` by default alongside the Vite workspace on `5174`, connected through the `/api` proxy. `AGENTDOWN_MODEL_PORT` changes that backend port. Optional model settings are `DEEPSEEK_MODEL` and `DEEPSEEK_BASE_URL`; keep the provider key on the server.

Try asking for a Vue versus React selection report to be saved on the server. The real save flow is: **streamed model text → model requests `save_report` → human approval → server writes the file → tool result returns to the model → model continues answering**. Approved reports appear as artifacts with their actual content. A denial returns to the model so it can continue. Ordinary questions can finish directly without fixture approval cards.

Example task buttons only fill the input. Click Send to call the model.

Execution logs, operation receipts and recovery events remain in server process memory. A server restart cannot resume an old execution; saved report files remain. Disconnecting stops frontend observation while the task continues. Cancellation aborts the model request and expires pending approvals; files already committed are not removed.

## Connect the online page to a real backend

In either framework's backend settings, enter an HTTPS API URL including `/api`, such as `https://your-agent.example/api`, and a separate backend access token. The token stays in the current tab's `sessionStorage` and is excluded from Session archives. **Never enter `DEEPSEEK_API_KEY` here.** Saving settings only changes the connection; sending a task starts the request. Local loopback development addresses may use HTTP.

A public backend needs HTTPS, `AGENTDOWN_ACCESS_TOKEN` and exact `AGENTDOWN_CORS_ORIGINS`. For the current GitHub Pages frontend, allow the origin `https://codexiaoke.github.io`. See the [real model backend guide](./examples/model-server/README.md) for Docker deployment, data directories and access controls.

## Try the complete no-model flow

Both pages consume the same Session contract. The default no-model fixture follows the flow below; in real mode, model output determines tools and approvals:

1. Send a task and watch streamed text, execution steps and tool status.
2. Approve or reject each of two independent approvals. Request delivery and backend confirmation are shown separately; one decision does not resolve the other.
3. Once both decisions are confirmed, execution continues and produces a demonstration report artifact.
4. Disconnect while approvals are pending, then explicitly resume. Disconnecting does not cancel the backend task, and replayed events do not append duplicate text.
5. Save and reload to restore the browser archive, then resume execution. Loading an archive does not automatically send a task or connect to the backend.
6. Open read-only replay. Replay does not connect to the backend or submit operations.
7. After disconnecting, simulate a lost acknowledgement, respond to an approval, then retry using the original operation identity. An accepted decision can recover confirmation without executing twice.

Cancellation is a separate backend operation and is confirmed only by a backend terminal event. Request delivery, backend acceptance, task completion and connection status are modeled separately.

## Current implementation

| Path | Implemented scope |
| --- | --- |
| [`packages/core`](./packages/core/README.md) | TypeScript Session with no UI framework or DOM dependencies; stable snapshots, domain events, operation identity, recovery cursors, archives and replay |
| [`packages/vue`](./packages/vue/README.md) | Vue Session bindings, Provider, selectors and owned / borrowed lifecycle |
| [`packages/react`](./packages/react/README.md) | React Session bindings, Provider, selectors and StrictMode lifecycle |
| [`packages/reference`](./packages/reference/README.md) | Reference HTTP / SSE adapter, including recovery after a lost acknowledgement |
| [`examples/prototype`](./examples/prototype) | Vue and React example interfaces for the complete flow |
| [`examples/reference-server`](./examples/reference-server/README.md) | Model-free Node reference backend with stable event identities, operation idempotency, result queries and cursor replay |
| [`examples/model-server`](./examples/model-server/README.md) | Real DeepSeek streaming, report saving after approval, continued execution from tool results, authentication and deployment examples |

The UI is a workflow prototype and currently renders safe plain text. A reusable `AgentWorkspace`, shared Catalog, production themes and localization, a Markdown content model, A2UI and production protocol adapters remain planned work.

The reference backend uses a fixed workflow to demonstrate tools and approvals. It **does not call a real model or perform real save or publish actions**. Conversations, events and operation records exist only in the current process's memory. After a server restart, browser archives cannot recover lost server state. Production applications need their own models, tools, authorization, persistence and task services.

## Validate the prototype

```sh
npm run test:next                  # Core, Vue / React bindings and HTTP integration tests
npm run test:reference             # Node reference backend contract tests
npm run test:model                 # Model protocol and real backend contract tests with injected test models
npm run test:next:e2e              # Browser workflow tests for both frameworks
npm run build:next                 # New workspace type checks and prototype build
npm run test:next:package-consumer # Standalone tarball installation, types and dependency checks
```

Browser tests start the prototype services automatically. If no usable Chromium is installed, first run `npx playwright install chromium`. The build output is `dist-next/prototype`. You can also run `npm run typecheck:next` separately. Default `test`, `typecheck` and `build` still target the legacy implementation; use the dedicated commands above for the new code.

## Rewrite plan and legacy implementation

The [rewrite progress page](./docs/rewrite/README.md) links the stage checklist, [public API design](./docs/rewrite/design.md), [core semantics](./docs/rewrite/core.md), [framework UI contract](./docs/rewrite/ui.md) and [project research](./docs/rewrite/research.md). These design documents describe the target contract; prototype code and the checklist define the implemented scope.

The old `src/`, FastAPI `backend/`, examples and documentation remain during the transition and will be cleaned up as their capabilities are replaced. `npm run dev:legacy` still runs the old Vue example; legacy capabilities do not imply support in the new packages. The [online documentation](https://codexiaoke.github.io/agentdown/) currently mainly describes the old API.

## License

[MIT](./LICENSE)
