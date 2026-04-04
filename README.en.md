# Agentdown

Language: [中文](./README.md) | **English**

Agentdown is a streaming-first Agent Markdown UI Runtime for Vue 3.  
It combines `MarkdownRenderer` for the narrative layer with `Protocol + Bridge + Assembler + Runtime` for interactive agent state, so backend packets can become a living UI instead of plain text.

Documentation: [https://codexiaoke.github.io/agentdown/](https://codexiaoke.github.io/agentdown/)

## Features

- Agent-native markdown rendering for `Vue 3 + TypeScript`
- `markdown-it + pretext` powered narrative rendering
- `defineProtocol()` to map arbitrary backend events into `RuntimeCommand[]`
- `createBridge()` to orchestrate protocol mapping, stream assembly and batched flushes
- `createMarkdownAssembler()` and `createPlainTextAssembler()` for `stream.open / delta / close`
- Built-in `createSseTransport()`, `createNdjsonTransport()`, `createWebSocketTransport()`, and `createAsyncIterableTransport()`
- Built-in Vue composables such as `useSse()`, `useSseBridge()`, `useNdjsonBridge()`, `useWebSocketBridge()`, `useAsyncIterableBridge()`, and `useRuntimeTranscript()`
- Also includes a page-level `useAgentSession()` wrapper for `runtime / bridge / transcript / replay`
- Built-in `createRuntimeTranscript()`, `parseRuntimeTranscript()`, and `createRuntimeReplayPlayer()` for replay, import, and export flows, including structured `messages / tools / artifacts / approvals`
- `createAgentRuntime()` for `node / block / intent / history`
- `RunSurface` as the formal runtime-driven chat surface
- High-level helpers such as `content.replace`, `tool.finish`, `artifact.upsert`, `approval.update`, and `node.error`
- Built-in `text / code / mermaid / thought / math / html / agui / approval / artifact / timeline`
- `:::vue-component` support for embedding Vue components directly in markdown
- Neutral default styling that fits custom design systems

## Installation

```bash
npm install agentdown katex
```

```ts
import 'agentdown/style.css';
import 'katex/dist/katex.min.css';
```

## Quick Start

### 1. Start with the narrative layer

```vue
<script setup lang="ts">
import { MarkdownRenderer } from 'agentdown';
import 'agentdown/style.css';
import 'katex/dist/katex.min.css';

const source = `
# Agentdown

This is a minimal example.

:::thought
Collapsible thought content works here.
:::
`;
</script>

<template>
  <MarkdownRenderer :source="source" />
</template>
```

### 2. Then connect streaming packets to the runtime

```ts
import {
  cmd,
  createHelperProtocolFactory,
  createAgentRuntime,
  createBridge,
  createMarkdownAssembler,
  defineEventProtocol
} from 'agentdown';

type Packet =
  | { event: 'RunStarted'; runId: string; title: string }
  | { event: 'ContentOpen'; streamId: string; slot: string }
  | { event: 'ContentDelta'; streamId: string; text: string }
  | { event: 'ContentClose'; streamId: string }
  | { event: 'ToolCall'; id: string; name: string }
  | { event: 'ToolCompleted'; id: string; name: string; content: Record<string, unknown> };

const runtime = createAgentRuntime();

const protocol = defineEventProtocol<Packet>({
  RunStarted: (event) =>
    cmd.run.start({
      id: event.runId,
      title: event.title
    }),
  ContentOpen: (event) =>
    cmd.content.open({
      streamId: event.streamId,
      slot: event.slot
    }),
  ContentDelta: (event) => cmd.content.append(event.streamId, event.text),
  ContentClose: (event) => cmd.content.close(event.streamId)
});

const bridge = createBridge({
  runtime,
  protocol,
  assemblers: {
    markdown: createMarkdownAssembler()
  }
});

bridge.push([
  { event: 'RunStarted', runId: 'run:weather', title: 'Weather Assistant' },
  { event: 'ContentOpen', streamId: 'stream:answer', slot: 'main' },
  { event: 'ContentDelta', streamId: 'stream:answer', text: 'Let me check the weather.' },
  { event: 'ContentClose', streamId: 'stream:answer' }
]);

console.log(runtime.snapshot());
```

If you are wiring SSE directly inside a Vue component, the composable form is usually simpler:

```ts
const {
  runtime,
  connect,
  consuming,
  error
} = useSseBridge<Packet>({
  source: '/api/agent/sse',
  protocol,
  assemblers: {
    markdown: createMarkdownAssembler()
  },
  request: {
    body: {
      message: 'Check Beijing weather'
    }
  },
  transport: {
    mode: 'json'
  }
})

await connect(undefined, {
  request: {
    body: {
      message: 'Check once more'
    }
  }
})
```

If you do not need the bridge yet and just want a standalone SSE hook:

```ts
const { status, lastMessage, connect, abort } = useSse<MyPacket>({
  onMessage: (packet) => {
    console.log(packet)
  }
})

await connect('/api/chat/sse', {
  request: {
    body: {
      message: 'hello'
    }
  }
})
```

If your backend sends full content snapshots instead of token appends, you can also do:

```ts
cmd.content.replace({
  id: 'block:assistant',
  groupId: 'turn:1',
  content: 'I already prepared it.\\n\\n- Beijing is sunny\\n- 26°C',
  kind: 'markdown'
});
```

For replay or export:

```ts
const transcript = createRuntimeTranscript(runtime)

console.log(transcript.messages)
console.log(transcript.tools)
console.log(transcript.artifacts)
console.log(transcript.approvals)
```

If you want to load exported JSON back into the app:

```ts
const importedTranscript = parseRuntimeTranscript(jsonText)

const player = createRuntimeReplayPlayer(importedTranscript.history)
```

If your app already has a stable event convention, you can also define a reusable global protocol factory:

```ts
const helperProtocolFactory = createHelperProtocolFactory<Packet, 'type'>({
  eventKey: 'type',
  defaults: {
    'content.replace': {
      kind: 'markdown'
    },
    'tool.start': {
      renderer: 'tool.weather'
    }
  },
  bindings: {
    'content.replace': {
      on: 'content.replace',
      resolve: (event) => ({
        id: event.blockId,
        groupId: event.groupId,
        content: event.markdown
      })
    },
    'tool.start': {
      on: 'tool.start',
      resolve: (event) => ({
        id: event.toolId,
        title: event.label,
        groupId: event.groupId
      })
    }
  }
});

const protocol = helperProtocolFactory.createProtocol();
```

## Mental Model

```text
raw packet -> protocol -> bridge -> assembler -> runtime -> your UI
```

- `MarkdownRenderer` renders standalone narrative markdown
- `Protocol` converts arbitrary backend packets into runtime commands
- `Assembler` stabilizes token streams before rendering complex markdown structures
- `Runtime` stores synchronous, replayable UI state
- `RunSurface` turns runtime blocks into a real chat or card-based UI

## Component Overrides

```ts
import {
  MarkdownRenderer,
  type MarkdownBuiltinComponentOverrides
} from 'agentdown';

import MyCodeBlock from './MyCodeBlock.vue';
import MyThoughtBlock from './MyThoughtBlock.vue';

const builtinComponents: MarkdownBuiltinComponentOverrides = {
  code: MyCodeBlock,
  thought: MyThoughtBlock
};
```

## Documentation

- Home: [https://codexiaoke.github.io/agentdown/](https://codexiaoke.github.io/agentdown/)
- Getting Started: [https://codexiaoke.github.io/agentdown/guide/getting-started](https://codexiaoke.github.io/agentdown/guide/getting-started)
- Runtime Overview: [https://codexiaoke.github.io/agentdown/runtime/overview](https://codexiaoke.github.io/agentdown/runtime/overview)
- Protocol Mapping: [https://codexiaoke.github.io/agentdown/runtime/protocol](https://codexiaoke.github.io/agentdown/runtime/protocol)
- API Reference: [https://codexiaoke.github.io/agentdown/api/runtime](https://codexiaoke.github.io/agentdown/api/runtime)

## Development

```bash
npm install
npm run dev
npm run docs:dev
npm run build
```

## Publishing

```bash
npm run typecheck
npm run build
npm run pack:check
npm publish
```

## License

[MIT](./LICENSE)
