# Agentdown · agentdown-next

Language: [中文](./README.md) | **English**

Agentdown is being rewritten as an agent interaction runtime for multiple frontend frameworks. It covers the frontend flow from starting a task, streaming execution, tools and human decisions to artifacts, reconnection and historical replay. Vue and React share one pure TypeScript Session; the backend remains responsible for model calls, task execution and business authorization.

This repository currently contains the **agentdown-next rewrite prototype**. Stage 0 implements the core contract, both framework bindings and a model-free reference backend, with a complete flow available locally. This preview allows breaking changes, is incompatible with the old API and is not yet a complete production library. The new `@agentdown/*` workspace packages are all `private` and have not been published to npm.

## Online preview

[Open the workspace](https://codexiaoke.github.io/agentdown/next/) · [React example](https://codexiaoke.github.io/agentdown/next/react.html)

The online preview uses a browser-only, no-model fixture backend. Tasks and event logs stay in the current browser and support approvals, refresh recovery, replay and lost-acknowledgement simulation. It demonstrates the interaction workflow without calling a model or performing actual save/publish operations. Local development continues to use the Node HTTP reference backend by default.

## Run locally

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

## Try the complete flow

Both pages consume the same Session contract and reference backend protocol. In either page:

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

The UI is a workflow prototype and currently renders safe plain text. A reusable `AgentWorkspace`, shared Catalog, production themes and localization, a Markdown content model, A2UI and production protocol adapters remain planned work.

The reference backend uses a fixed workflow to demonstrate tools and approvals. It **does not call a real model or perform real save or publish actions**. Conversations, events and operation records exist only in the current process's memory. After a server restart, browser archives cannot recover lost server state. Production applications need their own models, tools, authorization, persistence and task services.

## Validate the prototype

```sh
npm run test:next                  # Core, Vue / React bindings and HTTP integration tests
npm run test:reference             # Node reference backend contract tests
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
