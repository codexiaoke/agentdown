---
title: 官方框架适配
description: 使用内置 Agno、LangChain、AutoGen、CrewAI 适配层，直接消费官方事件并映射成 Agentdown UI。
---

# 官方框架适配

如果你的后端已经是主流 Agent 框架，最推荐的方式不是自己从零写 protocol，而是直接使用内置适配层。

## 当前已支持

| 框架 | 入口 | 额外 helper |
| --- | --- | --- |
| Agno | `createAgnoAdapter()` / `createAgnoProtocol()` | `defineAgnoToolComponents()` / `defineAgnoEventComponents()` / `toolByName()` / `eventToBlock()` |
| LangChain | `createLangChainProtocol()` / `defineLangChainPreset()` | `defineLangChainToolComponents()` / `defineLangChainEventComponents()` |
| AutoGen | `createAutoGenProtocol()` / `defineAutoGenPreset()` | `defineAutoGenToolComponents()` / `defineAutoGenEventComponents()` |
| CrewAI | `createCrewAIProtocol()` / `defineCrewAIPreset()` | `defineCrewAIToolComponents()` / `defineCrewAIEventComponents()` / `parseCrewAISseMessage()` |

## 这些适配器默认帮你做了什么

- 建立 run 节点
- 接 assistant markdown 文本流
- 在工具开始前自动切分文本段
- 把工具开始 / 完成映射成独立工具 block
- 在 run 结束、取消、错误时自动收尾
- 可选记录原始事件，方便调试和回放

这意味着大多数场景里，你只需要关注两件事：

1. 哪个工具名应该渲染成哪个组件
2. 哪些额外事件还要额外渲染成组件

## 推荐接法

还是以 Agno 为例。其他框架只需要换成各自的入口函数。

```ts
import {
  // 直接消费官方 Agno SSE 事件。
  createAgnoAdapter,
  createAgnoSseTransport,
  // 页面层直接拿到响应式 session。
  useAdapterSession,
  // 工具名映射 helper，避免协议层和 UI 层重复写一份配置。
  defineAgnoToolComponents
} from 'agentdown';
import WeatherToolCard from './WeatherToolCard.vue';

// 只要工具名里带 weather/天气，就渲染成天气卡片。
const agnoTools = defineAgnoToolComponents({
  'tool.weather': {
    match: ['weather', '天气'],
    mode: 'includes',
    component: WeatherToolCard
  }
});

// starter adapter 把官方协议和 helper 组装在一起。
const agno = createAgnoAdapter<string>({
  title: 'Agno 助手',
  tools: agnoTools
});

// 页面直接得到 runtime、surface、connect、restart、error、status。
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

如果你想跨框架复用工具组件或事件组件规则，也可以把 `defineAgnoToolComponents()` / `defineAgnoEventComponents()` 换成通用 DSL：

- `toolByName()`
- `eventToBlock()`

## 按工具名映射组件

这是最常见的需求。  
现在内置了通用 helper，不需要你自己重复写两份配置。

```ts
// 一份配置同时生成 toolRenderer 和 renderers。
const agnoTools = defineAgnoToolComponents({
  'tool.weather': {
    match: ['weather', '天气'],
    mode: 'includes',
    component: WeatherToolCard
  },
  'tool.search-docs': {
    match: /search|docs/i,
    component: SearchDocsCard
  }
});
```

它会同时产出：

- `toolRenderer`
  给 `protocolOptions.toolRenderer` 使用
- `renderers`
  给 `surface.renderers` 使用

也就是说，你维护一份定义就够了。

## 按事件名映射组件

另一个常见需求是：

- 某个原始 SSE 事件到了
- 想额外插入一个自定义组件
- 或者持续 patch 同一个组件

这时用 `define*EventComponents()`。

```ts
import {
  // 把多个协议按顺序组合起来。
  composeProtocols,
  // 官方主协议仍然保留。
  createAgnoProtocol,
  // 额外再把某些事件直接映射成组件块。
  defineAgnoEventComponents,
  defineAgnoPreset
} from 'agentdown';
import WeatherSummaryCard from './WeatherSummaryCard.vue';

// 某个事件命中后，直接产出一个自定义 block。
const agnoEvents = defineAgnoEventComponents({
  'event.weather-summary': {
    on: 'tool_call_completed',
    component: WeatherSummaryCard,
    resolve: ({ event }) => ({
      id: 'event:block:weather-summary',
      groupId: 'turn:weather',
      data: {
        payload: event
      }
    })
  }
});

// 主协议负责 run/tool/text，附加协议负责额外组件块。
const preset = defineAgnoPreset({
  protocol: composeProtocols(
    createAgnoProtocol(),
    agnoEvents.protocol
  ),
  surface: {
    renderers: agnoEvents.renderers
  }
});
```

默认写入模式是 `patch`，这是为了避免 SSE 连续更新时 block 被不断挪到消息尾部。

## 用户还能自定义什么

### `protocolOptions`

常见可改项包括：

- `defaultRunTitle`
- `toolRenderer`
- `groupId`
- `blockId`
- `streamId`
- `recordEvents`

如果你只想微调默认映射，大多数时候改这些就够了。

### `surface`

可以直接覆写：

- `renderers`
- `draftPlaceholder`
- `builtinComponents`
- `messageShells`
- `performance`

### 完全替换协议

如果你的项目确实需要更深控制，也可以：

- 直接使用 `createAgnoProtocol()` 返回的主协议
- 用 `composeProtocols()` 叠加额外 helper 协议
- 或者完全不用 preset，自己 `createBridge()`

## CrewAI 的特别说明

CrewAI 的 SSE 数据通常需要先 parse，再交给 protocol。

```ts
// CrewAI 的 SSE 文本要先 parse，再交给 protocol。
createSseTransport<CrewAIEvent, string>({
  parse: parseCrewAISseMessage,
  init() {
    return {
      method: 'POST'
    };
  }
})
```

## 什么时候该直接自己写 protocol

推荐自己写 `defineEventProtocol()` / `defineProtocol()` 的情况只有两类：

- 你的后端不是这些框架
- 你的框架事件经过了非常重的二次封装，已经和官方事件差很多

其他大多数情况下，直接用内置适配器会更省事，也更不容易漏掉 run/tool/stream 的收尾细节。
