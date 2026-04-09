# Agentdown

Language: [中文](./README.md) | **English**

Agentdown is a UI runtime for agent product frontends, built on Vue 3.  
It takes SSE / JSON / framework event streams from your backend and turns raw agent output into chat messages, tool cards, approvals, handoffs, artifacts, and continuously updating Markdown UI.

Documentation: [https://codexiaoke.github.io/agentdown/](https://codexiaoke.github.io/agentdown/)

## What It Is

```text
raw packet / SSE -> protocol -> bridge -> assembler -> runtime -> Agent UI
```

## What Agentdown Actually Does

In plain terms:

> Agentdown turns the event stream produced by your agent backend into a real frontend chat UI.

It is much closer to a rendering/runtime layer for agent products than to a model SDK or backend orchestration framework.

- Input: Agno, LangChain, AutoGen, CrewAI, or your own SSE / JSON event stream
- Output: chat messages, tool call cards, approval blocks, handoff blocks, artifacts, long-form Markdown, and custom AGUI components
- Layer: agent product frontend

It does not try to be:

- an LLM SDK
- a backend agent orchestration framework
- your database, memory layer, or job queue

It is mainly responsible for:

- rendering streaming Markdown without flashing broken partial structures
- turning tool calls and Human-In-The-Loop events into real UI
- keeping long text and heavy blocks performant in the browser
- letting official framework events plug into the frontend directly

## Fastest Way To Integrate Official Frameworks

If your backend already uses Agno, LangChain, AutoGen, or CrewAI, the recommended entry point is not to hand-build the protocol chain first. Start with:

- `useAgnoChatSession()`
- `useLangChainChatSession()`
- `useAutoGenChatSession()`
- `useCrewAIChatSession()`

These helpers are designed for real chat pages and usually let you wire all of this in just a few lines:

- streaming text
- tool call cards
- conversation, turn, and message semantic ids
- message actions such as regenerate and copy
- Human-In-The-Loop flows such as approval, handoff, interrupt, and resume

If your goal is “connect a real agent backend and get the chat UI working fast”, start here first.

Minimal example:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import {
  RunSurface,
  useAgnoChatSession
} from 'agentdown';

const prompt = ref('Check Beijing weather and explain the tool call process.');

// `mode: "hitl"` keeps Human-In-The-Loop events in the same chat flow.
const session = useAgnoChatSession<string>({
  source: 'http://127.0.0.1:8000/api/stream/agno',
  input: prompt,
  conversationId: 'session:weather-demo',
  title: 'Agno Assistant',
  mode: 'hitl'
});
</script>

<template>
  <form @submit.prevent="session.send()">
    <textarea v-model="prompt" rows="2" />
    <button :disabled="session.busy">
      {{ session.busy ? 'Requesting...' : 'Send' }}
    </button>
  </form>

  <RunSurface
    :runtime="session.runtime"
    v-bind="session.surface"
  />
</template>
```

Agentdown is built for:

- chat-style agent products
- tool cards, artifacts, approvals, and custom AGUI widgets
- streaming markdown output
- long documents mixed with heavy interactive components
- real framework integrations such as Agno, LangChain, AutoGen, and CrewAI

## What Problems It Solves

- Your backend does not need to adopt an Agentdown-only event schema.
- Tool calls do not need to stay trapped inside plain text.
- Half-finished tables, code fences, and other unstable markdown do not have to flash as broken UI.
- Long text and heavy components do not need to be mounted all at once.
- Official framework events can be consumed directly on the frontend.

## Current Capabilities

| Area | What you get |
| --- | --- |
| Narrative layer | `MarkdownRenderer`, `parseMarkdown()`, `markdown-it`, and `@chenglou/pretext` |
| Runtime chain | `Protocol + Bridge + Assembler + Runtime + RunSurface` |
| Official adapters | Agno, LangChain, AutoGen, CrewAI |
| Custom protocol | `defineProtocol()`, `defineEventProtocol()`, `defineHelperProtocol()` |
| Custom UI | `builtinComponents`, `renderers`, `messageShells`, `:::vue-component` |
| Performance | text slabization, viewport virtualization, group windowing, lazy mount |
| Replay and debugging | transcript export/import, history replay, event recording, renderer telemetry |

## Built-in Block Types

| Type | Purpose |
| --- | --- |
| `text` | headings, paragraphs, and common inline rich text through pretext |
| `html` | tables, lists, blockquotes, images, and complex HTML fallback |
| `code` | fenced code blocks |
| `mermaid` | Mermaid diagrams |
| `math` | KaTeX math blocks |
| `thought` | collapsible thought blocks |
| `agui` | Vue components injected with `:::vue-component` |
| `artifact` | agent outputs |
| `approval` | approval blocks |
| `timeline` | timeline blocks |

## Official Adapter Status

If you want to connect a real chat page quickly, this is the first section to look at.

| Framework | Entry points | Streaming text | Tool cards | Built-in operation approval | Notes |
| --- | --- | --- | --- | --- | --- |
| Agno | `useAgnoChatSession()` / `createAgnoAdapter()` | Yes | Yes | Yes | chat pages should start with `useAgnoChatSession()` |
| LangChain | `useLangChainChatSession()` / `createLangChainAdapter()` | Yes | Yes | Yes | consumes `astream_events()`-style packets directly |
| AutoGen | `useAutoGenChatSession()` / `createAutoGenAdapter()` | Yes | Yes | Yes | consumes official `run_stream()` packets directly |
| CrewAI | `useCrewAIChatSession()` / `createCrewAIAdapter()` | Yes | Yes | Not by default | consumes official SSE chunks with `parseCrewAISseMessage()` and focuses on streaming output plus tool rendering |

## Install

```bash
npm install agentdown katex
```

```ts
import 'agentdown/style.css';
import 'katex/dist/katex.min.css';
```

## Quick Start

### 1. Start with markdown

```vue
<script setup lang="ts">
// Import the renderer entry and required styles.
import { MarkdownRenderer } from 'agentdown';
import 'agentdown/style.css';
import 'katex/dist/katex.min.css';

// Start with a fixed markdown string to verify the narrative layer first.
const source = `
# Agentdown

This is regular markdown.

:::thought
Collapsible thought content works here.
:::
`;
</script>

<template>
  <MarkdownRenderer :source="source" />
</template>
```

### 2. Connect any SSE / JSON backend

```ts
import {
  // `RunSurface` renders runtime blocks as a chat-like UI.
  RunSurface,
  // `cmd` creates runtime commands.
  cmd,
  // The markdown assembler stabilizes streaming markdown content.
  createMarkdownAssembler,
  // A simple event-field dispatcher for custom backends.
  defineEventProtocol,
  // Consume SSE directly inside a Vue component.
  useSseBridge
} from 'agentdown';

type Packet =
  | { event: 'RunContent'; text: string }
  | { event: 'RunCompleted' }
  | { event: 'ToolCall'; id: string; name: string }
  | { event: 'ToolCompleted'; id: string; name: string; content: Record<string, unknown> };

// Map backend packets into runtime commands.
const protocol = defineEventProtocol<Packet>({
  // Append assistant text into a single streaming block.
  RunContent: (event) => [
    cmd.content.open({
      streamId: 'stream:assistant',
      slot: 'main'
    }),
    cmd.content.append('stream:assistant', event.text)
  ],
  // Close the current stream when the answer is done.
  RunCompleted: () => cmd.content.close('stream:assistant'),
  // Insert a tool block when the tool starts.
  ToolCall: (event, context) =>
    cmd.tool.start({
      id: event.id,
      title: event.name,
      renderer: 'tool',
      at: context.now()
    }),
  // Update the same tool block with the final result.
  ToolCompleted: (event, context) =>
    cmd.tool.finish({
      id: event.id,
      title: event.name,
      result: event.content,
      at: context.now()
    })
});

// This returns the runtime plus connection controls.
const { runtime, connect } = useSseBridge<Packet>({
  source: '/api/agent/sse',
  protocol,
  assemblers: {
    markdown: createMarkdownAssembler()
  },
  transport: {
    mode: 'json'
  }
});

// Once connected, packets will keep flowing into the runtime.
await connect();
```

```vue
<RunSurface :runtime="runtime" />
```

If your backend sends full content snapshots instead of token appends, use `cmd.content.replace()` directly.

### 3. Preferred path for official frameworks

For Agno, LangChain, AutoGen, and CrewAI, chat pages should start with the built-in `use*ChatSession()` helpers.  
This is the current recommended Agno path:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import {
  RunSurface,
  // Keep the tool-name mapping in one place.
  defineAgnoToolComponents,
  // Preferred page-level helper for real chat screens.
  useAgnoChatSession
} from 'agentdown';
import WeatherToolCard from './WeatherToolCard.vue';

const prompt = ref('Check Beijing weather and explain the tool call process.');

// `useAgnoChatSession()` automatically wires adapter, transport,
// chat ids, optimistic user message insertion, and regenerate.
const session = useAgnoChatSession<string>({
  source: 'http://127.0.0.1:8000/api/stream/agno',
  input: prompt,
  conversationId: 'session:weather-demo',
  title: 'Agno Assistant',
  mode: 'hitl',
  tools: defineAgnoToolComponents({
    lookup_weather: {
      match: 'lookup_weather',
      component: WeatherToolCard
    }
  })
});
</script>

<template>
  <form @submit.prevent="session.send()">
    <textarea
      v-model="prompt"
      rows="2"
      placeholder="Check Beijing weather"
    />

    <button :disabled="session.busy">
      {{ session.busy ? 'Requesting...' : 'Send' }}
    </button>

    <p v-if="session.sessionId">
      Backend sessionId: {{ session.sessionId }}
    </p>
  </form>

  <RunSurface
    :runtime="session.runtime"
    v-bind="session.surface"
  />
</template>
```

For the other official frameworks, replace the helper with:

- `useLangChainChatSession()`
- `useAutoGenChatSession()`
- `useCrewAIChatSession()`

If you need lower-level control, then move down to:

- `createAgnoAdapter()`
- `createAgnoProtocol()`
- `defineAgnoPreset()`

You can also attach side effects for non-UI events:

```ts
import { defineAgnoEventActions, useAgnoChatSession } from 'agentdown';

const session = useAgnoChatSession<string>({
  source: 'http://127.0.0.1:8000/api/stream/agno',
  conversationId: 'session:weather-demo',
  eventActions: defineAgnoEventActions({
    SessionCreated: {
      run({ event }) {
        console.log('raw agno event:', event);
      }
    }
  })
});
```

If you prefer the lower-level preset route:

```ts
import {
  type AgnoEvent,
  createSseTransport,
  defineAgnoPreset,
  defineAgnoToolComponents
} from 'agentdown';
import WeatherToolCard from './WeatherToolCard.vue';

const agnoTools = defineAgnoToolComponents({
  lookup_weather: {
    match: 'lookup_weather',
    component: WeatherToolCard
  }
});

const preset = defineAgnoPreset<string>({
  protocolOptions: {
    defaultRunTitle: 'Agno Assistant',
    toolRenderer: agnoTools.toolRenderer
  },
  surface: {
    renderers: agnoTools.renderers
  }
});

const { runtime, bridge, surface } = preset.createSession({
  bridge: {
    transport: createSseTransport<AgnoEvent, string>({
      mode: 'json',
      init() {
        return {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          // In a real app this usually comes from user input.
          body: JSON.stringify({
            message: 'Check Beijing weather'
          })
        };
      }
    })
  }
});
```

## Performance

Agentdown ships with a built-in performance chain for streaming and long-form content:

- common rich text stays on the `@chenglou/pretext` path
- unstable markdown stays in draft longer instead of flashing broken structures
- `MarkdownRenderer` supports `textSlabChars`, `virtualize`, and `virtualizeMargin`
- `RunSurface` supports `groupWindow`, `groupWindowStep`, `lazyMount`, `lazyMountMargin`, and `textSlabChars`

Recommended defaults:

```vue
<MarkdownRenderer
  :source="source"
  :performance="{
    textSlabChars: 1200,
    virtualize: true,
    virtualizeMargin: '1400px 0px'
  }"
/>

<RunSurface
  :runtime="runtime"
  :performance="{
    groupWindow: 80,
    groupWindowStep: 40,
    lazyMount: true,
    lazyMountMargin: '720px 0px',
    textSlabChars: 1600
  }"
/>
```

The demo app also includes a performance lab page that exports benchmark JSON for before/after comparisons.

## Real FastAPI Backend Included

The repository also includes a real FastAPI backend for adapter integration tests:

- `/api/stream/agno`
- `/api/stream/langchain`
- `/api/stream/autogen`
- `/api/stream/crewai`

Setup:

```bash
cp backend/.env.example backend/.env
python3 backend/run.py
```

See [backend/README.md](./backend/README.md) for details.

## Docs Map

- [Getting Started](https://codexiaoke.github.io/agentdown/guide/getting-started)
- [Core Concepts](https://codexiaoke.github.io/agentdown/guide/core-concepts)
- [Framework Adapters](https://codexiaoke.github.io/agentdown/guide/framework-adapters)
- [Custom Framework Mapping](https://codexiaoke.github.io/agentdown/guide/custom-framework)
- [RunSurface](https://codexiaoke.github.io/agentdown/guide/run-surface)
- [Streaming Markdown](https://codexiaoke.github.io/agentdown/guide/streaming-markdown)
- [Performance](https://codexiaoke.github.io/agentdown/guide/performance)
- [FastAPI Backend](https://codexiaoke.github.io/agentdown/guide/backend-fastapi)
- [Runtime API](https://codexiaoke.github.io/agentdown/api/runtime)
- [RunSurface API](https://codexiaoke.github.io/agentdown/api/run-surface)
- [MarkdownRenderer API](https://codexiaoke.github.io/agentdown/api/markdown-renderer)
- [Adapters API](https://codexiaoke.github.io/agentdown/api/adapters)

## License

MIT
