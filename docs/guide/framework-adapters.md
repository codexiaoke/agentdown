---
title: 官方框架适配
description: 用内置适配层直接接 Agno、LangChain、AutoGen、CrewAI 的官方事件。
---

# 官方框架适配

如果你的后端已经是主流 Agent 框架，最推荐的方式不是从零写 protocol，而是直接用内置适配层。

## 推荐入口

| 目标 | 推荐入口 |
| --- | --- |
| 最短聊天页接入 | `useAgnoChatSession()` / `useLangChainChatSession()` / `useAutoGenChatSession()` / `useCrewAIChatSession()` |
| 想要 starter 级控制 | `create*Adapter()` |
| 想继续下钻协议 | `create*Protocol()` / `define*Preset()` |
| 想统一封装成自己的框架层 | `useAgentChat()` |

## 能力矩阵

| 框架 | 流式文本 | 工具卡片 | 内置操作审批 | 典型场景 |
| --- | --- | --- | --- | --- |
| Agno | 支持 | 支持 | 支持 | requirement、approval、工具确认 |
| LangChain | 支持 | 支持 | 支持 | LangGraph interrupt、人工审阅、参数修改 |
| AutoGen | 支持 | 支持 | 支持 | handoff、人机接力、继续对话 |
| CrewAI | 支持 | 支持 | 不默认提供 | 真实 SSE chunk、工具展示、最终 `CrewOutput` 渲染 |

## 这些适配层默认帮你做什么

- 建立 run 节点
- 接 assistant 文本流
- 在工具开始前自动切分文本段
- 把工具开始 / 完成映射成独立工具 block
- 在 run 结束、取消、错误时自动收尾
- 可选记录原始事件，方便调试和回放

这意味着大多数场景里，你只需要关心两件事：

1. 哪个工具应该渲染成哪个组件
2. 哪些额外事件需要映射成额外 UI

## 最短接法

下面是一个 Agno 例子。其他框架基本同一套思路。

```ts
import { ref } from 'vue';
import {
  defineAgnoToolComponents,
  useAgnoChatSession
} from 'agentdown';
import WeatherToolCard from './WeatherToolCard.vue';

const prompt = ref('帮我查一下北京天气，并说明工具调用过程。');

// 一份配置同时产出 toolRenderer 和 renderers。
const tools = defineAgnoToolComponents({
  'tool.weather': {
    match: ['weather', '天气'],
    mode: 'includes',
    component: WeatherToolCard
  }
});

const session = useAgnoChatSession<string>({
  source: 'http://127.0.0.1:8000/api/stream/agno',
  input: prompt,
  conversationId: 'session:weather-demo',
  title: 'Agno 助手',
  mode: 'hitl',
  tools
});
```

```vue
<RunSurface
  :runtime="session.runtime"
  v-bind="session.surface"
/>
```

## 按工具名映射组件

这是接入时最常见的需求。

```ts
import { defineLangChainToolComponents } from 'agentdown';
import WeatherToolCard from './WeatherToolCard.vue';
import SearchResultCard from './SearchResultCard.vue';

const tools = defineLangChainToolComponents({
  'tool.weather': {
    match: ['weather', '天气'],
    mode: 'includes',
    component: WeatherToolCard
  },
  'tool.search': {
    match: /search|retriever|docs/i,
    component: SearchResultCard
  }
});
```

## 按事件名插入组件

如果某个原始事件和工具无关，但你仍想把它渲染成 UI，可以继续叠加 `define*EventComponents()`。

```ts
import {
  composeProtocols,
  createAgnoProtocol,
  defineAgnoEventComponents,
  defineAgnoPreset
} from 'agentdown';
import WeatherSummaryCard from './WeatherSummaryCard.vue';

const events = defineAgnoEventComponents({
  'event.weather-summary': {
    on: 'tool_call_completed',
    component: WeatherSummaryCard,
    resolve: ({ event }) => ({
      id: 'event:block:weather-summary',
      mode: 'upsert',
      groupId: 'turn:weather',
      data: {
        payload: event
      }
    })
  }
});

const preset = defineAgnoPreset({
  protocol: composeProtocols(
    createAgnoProtocol(),
    events.protocol
  ),
  surface: {
    renderers: events.renderers
  }
});
```

## 各框架的使用建议

### Agno

- 最适合 requirement / approval 一类场景
- 官方适配层已经把暂停与继续跑通

### LangChain

- 最适合 LangGraph interrupt / review
- 如果你要做“是否允许执行某个工具”，LangChain 很合适

### AutoGen

- 最适合 handoff 和人工接力
- 当前适配层重点是官方 handoff 继续执行

### CrewAI

- 当前最适合做真实文本流和工具展示
- 默认会消费官方 SSE chunk 和最终 `CrewOutput`
- 不默认把 review / flow feedback 事件提升成 approval UI

如果你的业务侧自己扩展了 CrewAI review 事件，仍然可以继续用：

- `recordEvents`
- `defineCrewAIEventComponents()`
- 自定义附加 protocol

## 什么时候别用内置适配层

下面两种情况更适合直接自己写 protocol：

1. 你的后端不是这些框架
2. 你的事件协议和这些框架完全不是一个风格
