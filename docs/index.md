---
layout: home

hero:
  name: Agentdown
  text: 给 Agent 产品前端用的 UI Runtime
  tagline: 把 Agent 后端返回的 SSE / JSON / 框架事件流，渲染成聊天消息、工具卡片、审批和可持续更新的 Markdown + AGUI 界面。
  actions:
    - theme: brand
      text: 5 分钟开始
      link: /guide/getting-started
    - theme: alt
      text: 官方框架接入
      link: /guide/framework-adapters
    - theme: alt
      text: Runtime API
      link: /api/runtime

features:
  - title: 几行接入真实聊天页
    details: 官方框架优先使用 `use*ChatSession()`，直接拿到 runtime、surface、send、busy、sessionId 和 regenerate。
  - title: 内置人机交互
    details: 已覆盖 approval、handoff、interrupt、resume 等 HITL 场景，不需要先把这些流程手写一遍。
  - title: 不绑定后端协议
    details: 后端返回什么 JSON，就映射什么 JSON。Agentdown 不要求你再包一层专属协议。
  - title: 面向流式 Markdown
    details: 半截表格、半截代码块、半截列表不会直接渲染成乱码，而是先进入 draft，再稳定落地。
  - title: 工具和工作流也是 UI
    details: tool、artifact、approval、handoff 不只是文本说明，它们都可以成为独立 block 和组件。
  - title: 官方框架适配
    details: 已内置 Agno、LangChain、AutoGen、CrewAI 的前端适配层，直接消费官方事件。
  - title: 长文性能优化
    details: 内建 pretext、text slab、windowing、group window、lazy mount，避免长文档和大组件把页面拖慢。
  - title: 调试与回放
    details: 支持 events、trace、effects、runtime diff、replay 和 transcript，方便定位协议映射问题。
---

## Agentdown 是什么

Agentdown 不是模型 SDK，也不是 Python Agent 框架。

它是一个给 Agent 产品前端使用的渲染运行时，专门解决这件事：

> 后端不断返回原始事件流，前端怎么把它稳定地变成真正可交互的聊天界面。

你可以把它理解成：

- 输入：SSE / JSON / 官方框架事件流
- 输出：聊天消息、工具块、审批块、handoff、artifact、自定义组件、长文 Markdown
- 位置：Agent 产品前端

如果你已经有 Agent 后端，或者正在用 Agno、LangChain、AutoGen、CrewAI，这个库解决的就是“最后一公里 UI 渲染和交互”。

## 先看这个

如果你只是想把真实 Agent 后端快速接到前端聊天页，先用：

- `useAgnoChatSession()`
- `useLangChainChatSession()`
- `useAutoGenChatSession()`
- `useCrewAIChatSession()`

这层是官方框架的最短入口，默认就会把流式输出、工具块、消息语义 id，以及 approval / handoff / interrupt / resume 这类人机交互能力一起接进来。

```vue
<script setup lang="ts">
import { ref } from 'vue';
import {
  RunSurface,
  useAgnoChatSession
} from 'agentdown';

const prompt = ref('帮我查一下北京天气，并说明工具调用过程。');

const session = useAgnoChatSession<string>({
  source: 'http://127.0.0.1:8000/api/stream/agno',
  input: prompt,
  conversationId: 'session:weather-demo',
  mode: 'hitl'
});
</script>

<template>
  <form @submit.prevent="session.send()">
    <textarea v-model="prompt" rows="2" />
    <button :disabled="session.busy">发送</button>
  </form>

  <RunSurface
    :runtime="session.runtime"
    v-bind="session.surface"
  />
</template>
```

## 你会用到的三层入口

| 入口 | 适合什么场景 |
| --- | --- |
| `MarkdownRenderer` | 先把 markdown 叙事层跑起来 |
| `RunSurface` + runtime | 你已经有 `protocol -> bridge -> runtime`，只差渲染层 |
| `use*ChatSession()` / `useSseBridge()` | 想直接接真实 Agent 后端或自定义 SSE 后端；聊天页优先 `use*ChatSession()` |

## 最短理解路径

```text
raw packet / SSE
  -> protocol
  -> bridge
  -> assembler
  -> runtime
  -> RunSurface
```

## 推荐阅读顺序

1. [快速开始](/guide/getting-started)
2. [核心概念](/guide/core-concepts)
3. [官方框架适配](/guide/framework-adapters)
4. [自定义协议接入](/guide/custom-framework)
5. [流式 Markdown](/guide/streaming-markdown)
6. [性能优化](/guide/performance)
