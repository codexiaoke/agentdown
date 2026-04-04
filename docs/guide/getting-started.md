---
title: 快速开始
description: 在 Vue 3 项目中接入 Agentdown，完成 markdown 渲染、协议映射、stream 组装与 runtime 更新。
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

## 接入 Runtime 主链路

如果你只需要纯 markdown 渲染，到这里已经够了。  
如果你还需要把后端流式事件接进一个可持续更新的 UI，就把 `Protocol + Bridge + Assembler + Runtime` 一起接上。

```ts
import {
  cmd,
  createAgentRuntime,
  createBridge,
  createMarkdownAssembler,
  defineEventProtocol
} from 'agentdown';

type Packet =
  | { event: 'RunContent'; text: string }
  | { event: 'ToolCall'; id: string; name: string }
  | { event: 'ToolCompleted'; id: string; name: string; content: Record<string, unknown> };

const runtime = createAgentRuntime();

const protocol = defineEventProtocol<Packet>({
  RunContent: (event) => [
    cmd.content.open({
      streamId: 'stream:assistant',
      slot: 'main'
    }),
    cmd.content.append('stream:assistant', event.text),
    cmd.content.close('stream:assistant')
  ],
  ToolCall: (event, context) =>
    cmd.tool.start({
      id: event.id,
      title: event.name,
      renderer: 'tool.weather',
      at: context.now()
    }),
  ToolCompleted: (event, context) =>
    cmd.tool.finish({
      id: event.id,
      title: event.name,
      result: event.content,
      at: context.now()
    })
});

const bridge = createBridge({
  runtime,
  protocol,
  assemblers: {
    markdown: createMarkdownAssembler()
  }
});

bridge.push([
  { event: 'RunContent', text: '我来为你查询天气' },
  { event: 'ToolCall', id: 'tool:weather', name: '查询天气' },
  {
    event: 'ToolCompleted',
    id: 'tool:weather',
    name: '查询天气',
    content: { city: '北京', condition: '晴', tempC: 26 }
  }
]);
```

## 一个推荐的项目接入顺序

1. 先用 `MarkdownRenderer` 跑通内容渲染。
2. 再定义你的 `raw packet -> RuntimeCommand[]` 映射规则。
3. 用 `createBridge()` 和 assembler 接好流式链路。
4. 最后按你的 Design System 覆写 `code / thought / html / agui` 等内置组件。

## 关于 UI 渲染

`createAgentRuntime()` 只负责保存同步状态。  
你可以通过 `runtime.snapshot()` / `runtime.subscribe()` 把 block 渲染成聊天界面、工具卡片区、侧边栏或你自己的 RunSurface。

## 本地文档站

仓库已经内置了 VitePress 文档站脚本：

```bash
npm run docs:dev
npm run docs:build
npm run docs:preview
```

## 下一步看什么

- 想理解内容是怎么被拆成 block 的：看 [Markdown 渲染](/guide/markdown-rendering)
- 想理解 runtime 里到底保存了什么：看 [Runtime 概览](/runtime/overview)
- 想理解自定义后端事件怎么映射：看 [协议映射](/runtime/protocol)
- 想把默认 UI 换成自己的设计系统：看 [组件覆写](/guide/component-overrides)
