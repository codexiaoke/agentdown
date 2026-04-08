---
title: 官方框架适配
description: 使用内置 Agno、LangChain、AutoGen、CrewAI 适配层，直接消费官方事件并映射成 Agentdown UI。
---

# 官方框架适配

如果你的后端已经是主流 Agent 框架，最推荐的方式不是自己从零写 protocol，而是直接使用内置适配层。

推荐顺序很简单：

1. 做聊天页面，优先用 `useAgnoChatSession()` / `useLangChainChatSession()` / `useAutoGenChatSession()` / `useCrewAIChatSession()`
2. 需要 starter 级控制，再用 `create*Adapter()` / `useAdapterSession()`
3. 只有在更底层定制协议时，才往 `create*Protocol()` / `define*Preset()` 继续下钻
4. `useAgentChat()` 主要留给“自定义 framework driver”或你自己封装统一框架层时使用，详见 [自定义 Framework 接入](/guide/custom-framework)

## 当前已支持

| 框架 | 入口 | 额外 helper |
| --- | --- | --- |
| Agno | `useAgnoChatSession()` / `createAgnoAdapter()` / `createAgnoProtocol()` | `defineAgnoToolComponents()` / `defineAgnoEventComponents()` / `toolByName()` / `eventToBlock()` |
| LangChain | `useLangChainChatSession()` / `createLangChainAdapter()` / `createLangChainProtocol()` | `defineLangChainToolComponents()` / `defineLangChainEventComponents()` |
| AutoGen | `useAutoGenChatSession()` / `createAutoGenAdapter()` / `createAutoGenProtocol()` | `defineAutoGenToolComponents()` / `defineAutoGenEventComponents()` |
| CrewAI | `useCrewAIChatSession()` / `createCrewAIAdapter()` / `createCrewAIProtocol()` | `defineCrewAIToolComponents()` / `defineCrewAIEventComponents()` / `parseCrewAISseMessage()` |

## 能力矩阵

| 框架 | 流式文本 | 工具卡片 | 内置操作审批 | 默认推荐定位 |
| --- | --- | --- | --- | --- |
| Agno | 支持 | 支持 | 支持 | 真实 Agent 聊天 + approval |
| LangChain | 支持 | 支持 | 支持 | LangGraph interrupt / review |
| AutoGen | 支持 | 支持 | 支持 | handoff / 人机接力 |
| CrewAI | 支持 | 支持 | 不默认提供 | 真实 SSE chunk + `CrewOutput` 渲染 |

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

## 聊天页面最推荐接法

还是以 Agno 为例。其他框架只需要换成各自的 chat helper。

```ts
import {
  defineAgnoToolComponents,
  useAgnoChatSession
} from 'agentdown';
import WeatherToolCard from './WeatherToolCard.vue';

const prompt = ref('帮我查一下北京天气');

// 页面直接得到 runtime、surface、send、restart、error、status。
const session = useAgnoChatSession<string>({
  source: 'http://127.0.0.1:8000/api/stream/agno',
  input: prompt,
  conversationId: 'session:weather-demo',
  title: 'Agno 助手',
  devtools: {
    maxEntries: 120
  },
  tools: defineAgnoToolComponents({
    'tool.weather': {
      match: ['weather', '天气'],
      mode: 'includes',
      component: WeatherToolCard
    }
  })
});

await session.send();
```

```vue
<RunSurface
  :runtime="session.runtime"
  v-bind="session.surface"
/>

<AgentDevtoolsOverlay
  :devtools="session.devtools"
  title="Agno Devtools"
  default-tab="effects"
/>
```

这种方式最适合：

- 标准问答式聊天页
- 一次一问一答的产品界面
- 希望拿到最直接的类型提示和最少样板代码

同时也意味着：

- 内置 chat helper 现在可以直接带出 `session.devtools`
- 不需要你额外手写 raw event / trace / runtime diff 的采集逻辑
- `eventActions` 触发的非 UI side effect 也会单独进入 `Effects` 页签
- 页面里就能直接展开单条事件、单条 trace、单条 diff，看完整 JSON

如果你需要更底层控制，再继续往 `create*Adapter()` / `useAdapterSession()` 走。

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

当前内置 CrewAI 适配层默认只处理两件事：

- 官方流式文本 chunk
- 工具调用与最终 `CrewOutput`

它不默认把 CrewAI review / Flow feedback 事件提升成 approval UI。  
如果你的业务后端自己扩展了这类事件，可以继续用 `recordEvents`、`defineCrewAIEventComponents()` 或自定义附加 protocol 处理。

## LangChain 真实联调建议

如果你现在接的是仓库里的 FastAPI backend，推荐先把 LangChain 真后端跑通，再回到前端看 UI。

最短验收顺序：

1. `python3 backend/run.py`
2. `npm run backend:smoke:langchain`
3. 打开前端 `/sse-langchain` demo 页面

`backend:smoke:langchain` 会直接校验：

- 根 `on_chain_start`
- `on_tool_start`
- `on_tool_end`
- 根 `on_chain_end`
- 真实 assistant 文本流

这样你可以先确认“后端事件真的来了”，再看前端 adapter 是不是映射正确。

## 什么时候该直接自己写 protocol

推荐自己写 `defineEventProtocol()` / `defineProtocol()` 的情况只有两类：

- 你的后端不是这些框架
- 你的框架事件经过了非常重的二次封装，已经和官方事件差很多

其他大多数情况下，直接用内置适配器会更省事，也更不容易漏掉 run/tool/stream 的收尾细节。

## `useAgentChat()` 什么时候用

`useAgentChat()` 不是给内置四个框架做日常接入的首选入口。

更合适的场景是：

- 你在项目里又包了一层自己的 framework registry
- 你想把多个后端框架收敛成一套业务 API
- 你要接入一个自定义 framework driver，但又想复用 Agentdown 现成的 helper DSL

如果你只是单独接 Agno、LangChain、AutoGen、CrewAI，本页列出的专用 helper 会更直观，类型提示也更好。
