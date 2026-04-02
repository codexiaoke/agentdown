# Agentdown

Language: [中文](./README.md) | **English**

Agentdown is an agent-native markdown UI runtime for Vue 3.  
It combines the structured parsing power of `markdown-it`, the text layout capability of `@chenglou/pretext`, AGUI component injection, and a reactive runtime so you can build interfaces for AI responses, tool calls, multi-agent workflows, and team-mode orchestration.

Documentation: [https://codexiaoke.github.io/agentdown/](https://codexiaoke.github.io/agentdown/)  
Repository: [https://github.com/codexiaoke/agentdown](https://github.com/codexiaoke/agentdown)

## Features

- Markdown UI runtime for `Vue 3 + TypeScript`
- Pretext-first rendering for plain text headings and paragraphs
- Structured block pipeline powered by `markdown-it`
- Built-in renderers for `text / code / mermaid / thought / math / html / agui`
- `:::vue-component` support for runtime-aware Vue components inside markdown
- Reactive AGUI runtime with events, node state, parent-child relationships and hooks
- Rich markdown support including tables, images, links, quotes, lists, code blocks, Mermaid and math
- Image preview and fullscreen Mermaid preview with pan and wheel zoom
- Neutral default styles designed to fit into your own design system
- Full `.d.ts` declarations included in the published package

## Installation

```bash
npm install @codexiaoke/agentdown
```

```ts
import '@codexiaoke/agentdown/style.css';
import 'katex/dist/katex.min.css';
```

## Quick Start

```vue
<script setup lang="ts">
import {
  MarkdownRenderer,
  createAguiRuntime,
  runStarted,
  toolStarted
} from '@codexiaoke/agentdown';
import '@codexiaoke/agentdown/style.css';
import 'katex/dist/katex.min.css';

import RunBoard from './RunBoard.vue';

const runtime = createAguiRuntime();

const source = `
# Pricing Assistant

This is an active run.

:::vue-component RunBoard {"ref":"run:pricing"}

\`\`\`mermaid
flowchart LR
  User[User] --> Agent[Pricing Agent]
  Agent --> Tool[pricing.lookup]
\`\`\`
`;

const aguiComponents = {
  RunBoard: {
    component: RunBoard,
    minHeight: 120
  }
};

runtime.emit(runStarted({
  nodeId: 'run:pricing',
  title: 'Pricing Run',
  message: 'Processing user request'
}));

runtime.emit(toolStarted({
  nodeId: 'tool:pricing',
  parentId: 'run:pricing',
  toolName: 'pricing.lookup',
  title: 'Querying pricing database'
}));
</script>

<template>
  <MarkdownRenderer
    :source="source"
    :agui-runtime="runtime"
    :agui-components="aguiComponents"
  />
</template>
```

## Core Concepts

### 1. Markdown as the narrative layer

You can write content as regular markdown:

- headings and paragraphs
- tables and images
- lists and quotes
- code blocks
- Mermaid diagrams
- math blocks
- `:::thought`

### 2. Runtime as the state layer

Drive a run lifecycle with events:

```ts
import {
  createAguiRuntime,
  runStarted,
  agentStarted,
  toolStarted,
  toolFinished,
  runFinished
} from '@codexiaoke/agentdown';

const runtime = createAguiRuntime();

runtime.emit(runStarted({
  nodeId: 'run:demo',
  title: 'Demo Run'
}));

runtime.emit(agentStarted({
  nodeId: 'agent:planner',
  parentId: 'run:demo',
  title: 'Planner'
}));

runtime.emit(toolStarted({
  nodeId: 'tool:search',
  parentId: 'agent:planner',
  toolName: 'web.search'
}));

runtime.emit(toolFinished({
  nodeId: 'tool:search',
  parentId: 'agent:planner',
  toolName: 'web.search'
}));

runtime.emit(runFinished({
  nodeId: 'run:demo',
  title: 'Demo Run'
}));
```

### 3. Runtime-aware AGUI components

Inside markdown:

```md
:::vue-component RunBoard {"ref":"run:demo"}
```

Inside the component:

```ts
import {
  useAguiChildren,
  useAguiEvents,
  useAguiState,
  type AgentNodeState
} from '@codexiaoke/agentdown';

const state = useAguiState<AgentNodeState>();
const children = useAguiChildren<AgentNodeState>();
const events = useAguiEvents();
```

## Component Overrides

If you want to plug Agentdown into your own design system, you can override the built-in components:

```ts
import {
  MarkdownRenderer,
  type MarkdownBuiltinComponentOverrides
} from '@codexiaoke/agentdown';

import MyCodeBlock from './MyCodeBlock.vue';
import MyThoughtBlock from './MyThoughtBlock.vue';
import MyAguiShell from './MyAguiShell.vue';

const builtinComponents: MarkdownBuiltinComponentOverrides = {
  code: MyCodeBlock,
  thought: MyThoughtBlock,
  agui: MyAguiShell
};
```

Overridable keys:

- `text`
- `code`
- `mermaid`
- `thought`
- `math`
- `html`
- `agui`

## Documentation

- Home: [https://codexiaoke.github.io/agentdown/](https://codexiaoke.github.io/agentdown/)
- Getting Started: [https://codexiaoke.github.io/agentdown/guide/getting-started](https://codexiaoke.github.io/agentdown/guide/getting-started)
- Markdown Rendering: [https://codexiaoke.github.io/agentdown/guide/markdown-rendering](https://codexiaoke.github.io/agentdown/guide/markdown-rendering)
- Runtime Overview: [https://codexiaoke.github.io/agentdown/runtime/overview](https://codexiaoke.github.io/agentdown/runtime/overview)
- Protocol and Events: [https://codexiaoke.github.io/agentdown/runtime/protocol](https://codexiaoke.github.io/agentdown/runtime/protocol)
- API Reference: [https://codexiaoke.github.io/agentdown/api/renderer](https://codexiaoke.github.io/agentdown/api/renderer)
- FAQ: [https://codexiaoke.github.io/agentdown/reference/faq](https://codexiaoke.github.io/agentdown/reference/faq)
- Release Checklist: [https://codexiaoke.github.io/agentdown/reference/release](https://codexiaoke.github.io/agentdown/reference/release)

## Development

```bash
npm install
npm run dev
```

## Docs Development

```bash
npm run docs:dev
npm run docs:build
npm run docs:preview
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
