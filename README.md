# Agentdown

语言导航：**中文** | [English](./README.en.md)

Agentdown 是一个面向 Vue 3 的 agent-native markdown UI runtime。  
它把 `markdown-it` 的结构化解析能力、`@chenglou/pretext` 的文本布局能力，以及 AGUI 组件注入与事件驱动 runtime 组合在一起，用来构建更适合 AI、Agent、Tool、Team Mode 的前端界面。

[在线文档](https://codexiaoke.github.io/agentdown/)  

## 特性

- 面向 `Vue 3 + TypeScript` 的 markdown UI runtime
- 纯文本段落和标题优先走 `pretext`，适合更自然的长文本与流式内容展示
- 基于 `markdown-it` 的结构化解析与 block 分发
- 内置 `text / code / mermaid / thought / math / html / agui / approval / artifact / timeline` 渲染组件
- 支持 `:::vue-component` 把运行态组件直接嵌入 markdown
- 内置响应式 `AGUI runtime`，支持事件流、节点状态、父子关系和 hooks
- 支持复杂 markdown 内容：表格、图片、链接、引用、列表、代码块、公式、Mermaid
- 图片预览、Mermaid 全屏预览、拖拽、滚轮缩放
- 默认样式尽量中性，方便接入自己的 Design System
- 发布包内包含完整 `.d.ts` 类型声明

## 安装

```bash
npm install agentdown katex
```

```ts
import 'agentdown/style.css';
import 'katex/dist/katex.min.css';
```

## 快速开始

```vue
<script setup lang="ts">
import {
  MarkdownRenderer,
  createAguiRuntime,
  runStarted,
  toolStarted
} from 'agentdown';
import 'agentdown/style.css';
import 'katex/dist/katex.min.css';

import RunBoard from './RunBoard.vue';

const runtime = createAguiRuntime();

const source = `
# 智能报价助手

这是一次运行中的任务。

:::vue-component RunBoard {"ref":"run:pricing"}

\`\`\`mermaid
flowchart LR
  User[用户] --> Agent[报价 Agent]
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
  title: '报价运行',
  message: '开始处理用户请求'
}));

runtime.emit(toolStarted({
  nodeId: 'tool:pricing',
  parentId: 'run:pricing',
  toolName: 'pricing.lookup',
  title: '查询价格库'
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

## 核心能力

### 1. Markdown 负责叙事层

你可以像平时一样写 markdown 内容：

- 标题和段落
- 表格和图片
- 列表和引用
- 代码块
- Mermaid 图表
- 数学公式
- `:::thought`
- `:::approval`
- `:::artifact`
- `:::timeline`

### 2. Runtime 负责状态层

你可以通过事件驱动一次 run 的生命周期：

```ts
import {
  createAguiRuntime,
  runStarted,
  agentStarted,
  toolStarted,
  toolFinished,
  runFinished
} from 'agentdown';

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

### 3. AGUI 组件直接绑定运行态

在 markdown 中：

```md
:::vue-component RunBoard {"ref":"run:demo"}
```

在组件内部：

```ts
import {
  useAguiChildren,
  useAguiEvents,
  useAguiState,
  type AgentNodeState
} from 'agentdown';

const state = useAguiState<AgentNodeState>();
const children = useAguiChildren<AgentNodeState>();
const events = useAguiEvents();
```

## 组件覆写

如果你想把 Agentdown 接入自己的设计系统，可以直接覆写内置组件：

```ts
import {
  MarkdownRenderer,
  type MarkdownBuiltinComponentOverrides
} from 'agentdown';

import MyCodeBlock from './MyCodeBlock.vue';
import MyThoughtBlock from './MyThoughtBlock.vue';
import MyAguiShell from './MyAguiShell.vue';

const builtinComponents: MarkdownBuiltinComponentOverrides = {
  code: MyCodeBlock,
  thought: MyThoughtBlock,
  agui: MyAguiShell
};
```

可覆写的 key：

- `text`
- `code`
- `mermaid`
- `thought`
- `math`
- `html`
- `agui`
- `artifact`
- `approval`
- `timeline`

## 文档

- 文档首页：[https://codexiaoke.github.io/agentdown/](https://codexiaoke.github.io/agentdown/)
- 快速开始：[https://codexiaoke.github.io/agentdown/guide/getting-started](https://codexiaoke.github.io/agentdown/guide/getting-started)
- Markdown 渲染：[https://codexiaoke.github.io/agentdown/guide/markdown-rendering](https://codexiaoke.github.io/agentdown/guide/markdown-rendering)
- AGUI Runtime：[https://codexiaoke.github.io/agentdown/runtime/overview](https://codexiaoke.github.io/agentdown/runtime/overview)
- 协议与事件：[https://codexiaoke.github.io/agentdown/runtime/protocol](https://codexiaoke.github.io/agentdown/runtime/protocol)
- API 参考：[https://codexiaoke.github.io/agentdown/api/renderer](https://codexiaoke.github.io/agentdown/api/renderer)
- FAQ：[https://codexiaoke.github.io/agentdown/reference/faq](https://codexiaoke.github.io/agentdown/reference/faq)
- 发布清单：[https://codexiaoke.github.io/agentdown/reference/release](https://codexiaoke.github.io/agentdown/reference/release)

文档源文件位于仓库的 [`./docs`](./docs) 目录，使用 `VitePress` 构建。

## 开发

```bash
npm install
npm run dev
```

## 文档站开发

```bash
npm run docs:dev
npm run docs:build
npm run docs:preview
```

## 发布

```bash
npm run typecheck
npm run build
npm run pack:check
npm publish
```

## License

[MIT](./LICENSE)
