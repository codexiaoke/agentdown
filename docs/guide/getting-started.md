---
title: 快速开始
description: 用最短路径在 Vue 3 项目里接入 Agentdown，完成 markdown 渲染、流式协议映射和聊天式运行界面。
---

# 快速开始

这一页的目标不是把所有 API 一次讲完，而是让你最快跑起来。

## 你可以按三条路径使用 Agentdown

### 1. 只渲染 markdown

适合：

- 静态文档
- 一次性生成结果
- 暂时不需要接 runtime

### 2. 接自己的 SSE / JSON 后端

适合：

- 后端事件完全自定义
- 不想为了前端改后端协议
- 想自己决定 `content.append`、`tool.finish`、`artifact.upsert` 这类事件语义

### 3. 接官方框架事件

适合：

- Agno
- LangChain
- AutoGen
- CrewAI

这种情况优先用内置 starter adapter，会省掉很多重复样板。

## 安装

```bash
npm install agentdown katex
```

```ts
import 'agentdown/style.css';
import 'katex/dist/katex.min.css';
```

## 第一个渲染器

```vue
<script setup lang="ts">
// 引入最小 markdown 渲染入口和样式。
import { MarkdownRenderer } from 'agentdown';
import 'agentdown/style.css';
import 'katex/dist/katex.min.css';

// 先用一段固定 markdown 跑通渲染链路。
const source = `
# Agentdown

这是一个最小示例。

:::thought
这里可以承载可折叠的思考过程。
:::

| 城市 | 天气 |
| --- | --- |
| 北京 | 晴 |

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

如果你只需要 markdown 展示，到这里已经够了。

## 接自己的 SSE / JSON 后端

当后端返回的是你自己的事件结构时，推荐直接用：

- `defineEventProtocol()`
- `createMarkdownAssembler()`
- `useSseBridge()`
- `RunSurface`

```ts
import {
  // `cmd` 用来描述 runtime 里的结构化动作。
  cmd,
  // 负责把流式 markdown 组装成更稳定的 block。
  createMarkdownAssembler,
  // 最常见的 event -> handler 映射入口。
  defineEventProtocol,
  // 直接在 Vue 页面里消费 SSE。
  useSseBridge
} from 'agentdown';

type Packet =
  | { event: 'RunContent'; text: string }
  | { event: 'RunCompleted' }
  | { event: 'ToolCall'; id: string; name: string }
  | { event: 'ToolCompleted'; id: string; name: string; content: Record<string, unknown> };

// 把你的后端事件翻译成 runtime 命令。
const protocol = defineEventProtocol<Packet>({
  // assistant 文本不断到来时，持续追加到同一条流里。
  RunContent: (event) => [
    cmd.content.open({
      streamId: 'stream:assistant',
      slot: 'main'
    }),
    cmd.content.append('stream:assistant', event.text)
  ],
  // 这一轮结束时，把流正式关闭。
  RunCompleted: () => cmd.content.close('stream:assistant'),
  // 工具开始时创建一个工具块。
  ToolCall: (event, context) =>
    cmd.tool.start({
      id: event.id,
      title: event.name,
      renderer: 'tool',
      at: context.now()
    }),
  // 工具完成时更新同一个工具块。
  ToolCompleted: (event, context) =>
    cmd.tool.finish({
      id: event.id,
      title: event.name,
      result: event.content,
      at: context.now()
    })
});

// 这里会返回 runtime 和连接控制方法，页面里直接用就行。
const { runtime, connect, error, consuming } = useSseBridge<Packet>({
  source: '/api/agent/sse',
  protocol,
  assemblers: {
    markdown: createMarkdownAssembler()
  },
  transport: {
    mode: 'json'
  }
});

// 调用 connect() 后就会开始消费后端事件流。
await connect();
```

```vue
<template>
  <p v-if="error">{{ error.message }}</p>
  <p v-if="consuming">请求中...</p>
  <RunSurface :runtime="runtime" />
</template>
```

### 如果后端返回的是完整内容快照

这种情况不一定要走 `append`，可以直接：

```ts
// 这种写法适合“后端每次都返回整段完整 markdown”的场景。
cmd.content.replace({
  id: 'block:assistant',
  groupId: 'turn:1',
  content: '我已经整理好了。\\n\\n- 北京晴\\n- 26°C',
  kind: 'markdown'
});
```

### 如果自定义组件需要运行中的值

推荐把值放到 `block.data` 或 `tool.result` 里，而不是依赖全局注入。

也就是说：

1. 协议层映射 SSE 事件
2. runtime 保存结构化数据
3. `RunSurface` 按 `renderer` 选择组件
4. 组件直接从当前 block 的 `data` 读取值

## 接官方框架最省事的方式

官方适配器已经帮你处理了：

- assistant 文本流
- 工具开始 / 完成
- 文本分段
- run 开始 / 结束 / 错误

以 Agno 为例：

```ts
import {
  // 直接请求官方 Agno SSE 接口。
  createAgnoAdapter,
  createAgnoSseTransport,
  // 页面层直接拿到响应式 session。
  useAdapterSession,
  // 让工具名映射和组件注册共用同一份配置。
  defineAgnoToolComponents
} from 'agentdown';
import WeatherToolCard from './WeatherToolCard.vue';

// 命中天气类工具名时，切到自定义天气卡片。
const agnoTools = defineAgnoToolComponents({
  'tool.weather': {
    match: ['weather', '天气'],
    mode: 'includes',
    component: WeatherToolCard
  }
});

// adapter 会收好 Agno 默认 protocol、assembler 和 helper。
const agno = createAgnoAdapter<string>({
  title: 'Agno 助手',
  tools: agnoTools
});

// 页面直接得到 runtime、surface、status、error、connect。
const session = useAdapterSession(agno, {
  overrides: {
    source: 'http://127.0.0.1:8000/api/stream/agno',
    transport: createAgnoSseTransport<string>({
      message: '帮我查一下北京天气'
    })
  }
});

await session.connect();
```

```vue
<RunSurface
  :runtime="session.runtime"
  v-bind="session.surface"
/>
```

新写法比以前少了三层常见胶水代码：

- 不需要先 `defineAgnoPreset()`
- 不需要再自己 `preset.createSession()`
- 不需要再手动包一层 `useBridgeTransport()`
- 不需要再手写 `mode / headers / body / JSON.stringify`

目前 starter adapter 先在 Agno 上落地了。
LangChain、AutoGen、CrewAI 当前仍然继续使用各自的 preset 入口：

- `defineLangChainPreset()`
- `defineAutoGenPreset()`
- `defineCrewAIPreset()`

CrewAI 直接消费 SSE 文本时，还要配合：

- `parseCrewAISseMessage()`

## 推荐的接入顺序

1. 先跑通 `MarkdownRenderer`
2. 再决定是“自定义 protocol”还是“官方 preset”
3. 接上 `RunSurface`
4. 再按产品需要覆写工具卡片、assistant shell、user bubble 和 markdown 内置组件

## 什么时候该继续往下看

- 想接主流框架：看 [官方框架适配](/guide/framework-adapters)
- 想深入看 Agno：看 [Agno 适配](/guide/agno-adapter)
- 想理解 markdown block 模型：看 [Markdown 渲染](/guide/markdown-rendering)
- 想理解 runtime 主链：看 [Runtime 概览](/runtime/overview)
- 想优化大文本和长会话：看 [性能优化](/guide/performance)
