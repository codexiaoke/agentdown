---
title: 快速开始
description: 在 Vue 3 项目中接入 Agentdown，完成 markdown 渲染、Mermaid、AGUI runtime 与组件注入。
---

# 快速开始

这一页的目标很简单：让你在一个 Vue 3 + TypeScript 项目里，最快跑起 Agentdown。

## 安装

```bash
npm install agentdown katex
```

如果你会用到数学公式，建议一起安装 `katex`，这样在 `pnpm` 项目里也能稳定导入它的样式：

```ts
import 'agentdown/style.css';
import 'katex/dist/katex.min.css';
```

## 第一个渲染器

```vue
<script setup lang="ts">
import { MarkdownRenderer } from 'agentdown';
import 'agentdown/style.css';
import 'katex/dist/katex.min.css';

const source = `
# Agentdown

这是一个最小示例。

:::thought
这里可以承载可折叠的思考过程。
:::

\`\`\`ts
console.log('hello agentdown');
\`\`\`

\`\`\`mermaid
flowchart LR
  User --> Agent
\`\`\`
`;
</script>

<template>
  <MarkdownRenderer :source="source" />
</template>
```

## 接入 AGUI Runtime

如果你只需要纯 markdown 渲染，到这里已经够了。  
如果你还需要让组件随着 agent 事件实时变化，就把 runtime 一起接上。

```vue
<script setup lang="ts">
import {
  MarkdownRenderer,
  createAguiRuntime,
  runStarted,
  agentStarted,
  toolStarted
} from 'agentdown';

const runtime = createAguiRuntime();

const source = `
:::vue-component DemoRunBoard {"ref":"run:demo"}
`;

runtime.emit(runStarted({
  nodeId: 'run:demo',
  title: '中文演示运行',
  message: '等待 leader 分配任务'
}));

runtime.emit(agentStarted({
  nodeId: 'agent:planner',
  parentId: 'run:demo',
  title: 'Planner',
  kind: 'leader',
  message: '拆解任务中'
}));

runtime.emit(toolStarted({
  nodeId: 'tool:search',
  parentId: 'agent:planner',
  title: '搜索知识库',
  toolName: 'knowledge.search'
}));
</script>

<template>
  <MarkdownRenderer
    :source="source"
    :agui-runtime="runtime"
    :agui-components="{ DemoRunBoard }"
  />
</template>
```

## 一个推荐的项目接入顺序

1. 先用 `MarkdownRenderer` 跑通内容渲染。
2. 再把 `aguiRuntime` 和 `:::vue-component` 接上。
3. 最后按你的 Design System 覆写 `code / thought / html / agui` 等内置组件。

## 本地文档站

仓库已经内置了 VitePress 文档站脚本：

```bash
npm run docs:dev
npm run docs:build
npm run docs:preview
```

## 下一步看什么

- 想理解内容是怎么被拆成 block 的：看 [Markdown 渲染](/guide/markdown-rendering)
- 想把默认 UI 换成自己的设计系统：看 [组件覆写](/guide/component-overrides)
- 想理解 runtime 的事件与状态模型：看 [AGUI Runtime 概览](/runtime/overview)
