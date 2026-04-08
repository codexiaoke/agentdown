# Agentdown

Language: [中文](./README.md) | **English**

Agentdown is a streaming-first Agent Markdown UI Runtime for Vue 3.  
It combines markdown rendering, protocol mapping, stream assembly, runtime state, and interactive surface components so agent output can become a real UI instead of a plain text blob.

Documentation: [https://codexiaoke.github.io/agentdown/](https://codexiaoke.github.io/agentdown/)

## What It Is

```text
raw packet / SSE -> protocol -> bridge -> assembler -> runtime -> Agent UI
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

| Framework | Entry points | Streaming text | Tool cards | Built-in operation approval | Notes |
| --- | --- | --- | --- | --- | --- |
| Agno | `createAgnoProtocol()` / `defineAgnoPreset()` | Yes | Yes | Yes | consumes official Agno SSE events |
| LangChain | `createLangChainProtocol()` / `defineLangChainPreset()` | Yes | Yes | Yes | consumes `astream_events()`-style packets |
| AutoGen | `createAutoGenProtocol()` / `defineAutoGenPreset()` | Yes | Yes | Yes | consumes official `run_stream()` packets |
| CrewAI | `createCrewAIProtocol()` / `defineCrewAIPreset()` | Yes | Yes | Not by default | consumes official SSE chunks with `parseCrewAISseMessage()` and currently focuses on streaming output plus tool rendering |

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

```ts
import {
  type AgnoEvent,
  // SSE transport for official Agno events.
  createSseTransport,
  // Preset bundles protocol, assemblers, and surface defaults.
  defineAgnoPreset,
  // Keep the tool-name mapping in one place.
  defineAgnoToolComponents
} from 'agentdown';
import WeatherToolCard from './WeatherToolCard.vue';

// Render weather-related tools as a dedicated weather card.
const agnoTools = defineAgnoToolComponents({
  'tool.weather': {
    match: ['weather', '天气'],
    mode: 'includes',
    component: WeatherToolCard
  }
});

// Build a reusable Agno preset for this page or feature.
const preset = defineAgnoPreset<string>({
  protocolOptions: {
    defaultRunTitle: 'Agno Assistant',
    toolRenderer: agnoTools.toolRenderer
  },
  surface: {
    renderers: agnoTools.renderers
  }
});

// Create runtime, bridge, and surface options together.
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
- [Framework Adapters](https://codexiaoke.github.io/agentdown/guide/framework-adapters)
- [Agno Deep Dive](https://codexiaoke.github.io/agentdown/guide/agno-adapter)
- [Markdown Rendering](https://codexiaoke.github.io/agentdown/guide/markdown-rendering)
- [Performance](https://codexiaoke.github.io/agentdown/guide/performance)
- [Runtime Overview](https://codexiaoke.github.io/agentdown/runtime/overview)
- [Protocol Mapping](https://codexiaoke.github.io/agentdown/runtime/protocol)
- [RunSurface API](https://codexiaoke.github.io/agentdown/api/run-surface)

## License

MIT
