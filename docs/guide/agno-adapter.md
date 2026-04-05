---
title: Agno 适配
description: 使用官方 Agno SSE 事件直接接入 Agentdown，并通过工具名和事件 helper 继续定制 UI。
---

# Agno 适配

如果你的后端就是 Agno，最推荐的接法是：

- 继续返回官方 Agno 事件
- 前端用 `defineAgnoPreset()` 或 `createAgnoProtocol()` 直接适配
- 不为了前端额外发明一层新协议

## 默认映射了什么

`createAgnoProtocol()` 当前默认会处理：

- `RunStarted`
  映射成 `run.start`
- `RunContent`
  作为 markdown 流式文本追加
- `ToolCallStarted`
  关闭当前文本分段，再创建工具 block
- `ToolCallCompleted`
  更新工具结果
- `RunCompleted`
  收尾当前文本分段并结束 run
- `RunCancelled` / `RunError` / `Error`
  中止流并标记 run/error

额外还做了两件很关键的事：

- 工具前后的文本会自动分段，避免全部拼到同一个 block
- 工具结果如果是常见的 Python `repr` 风格字符串，会尽量恢复成对象

## 最常见的接法

```ts
import {
  type AgnoEvent,
  // 直接消费官方 Agno SSE 事件。
  createSseTransport,
  // preset 会内置 Agno 官方主协议和 markdown assembler。
  defineAgnoPreset,
  // 工具名 -> renderer / 组件，只维护一份配置即可。
  defineAgnoToolComponents
} from 'agentdown';
import WeatherToolCard from './WeatherToolCard.vue';

// 命中天气相关工具名时，用天气卡片渲染。
const agnoTools = defineAgnoToolComponents({
  'tool.weather': {
    match: ['weather', '天气'],
    mode: 'includes',
    component: WeatherToolCard
  }
});

// 这里把工具映射和 surface 配置一起收进 preset。
const preset = defineAgnoPreset<string>({
  protocolOptions: {
    defaultRunTitle: 'Agno 助手',
    toolRenderer: agnoTools.toolRenderer
  },
  surface: {
    renderers: agnoTools.renderers
  }
});

// 创建当前页面的完整会话对象。
const { runtime, bridge, surface } = preset.createSession({
  bridge: {
    transport: createSseTransport<AgnoEvent, string>({
      mode: 'json',
      init() {
        return {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          // 这里通常来自输入框。
          body: JSON.stringify({
            message: '帮我查一下北京天气'
          })
        };
      }
    })
  }
});
```

```vue
<RunSurface
  :runtime="runtime"
  v-bind="surface"
/>
```

## 按工具名挂组件

最常见的需求就是：

- `lookup_weather` 显示天气卡片
- `search_docs` 显示文档搜索卡片

现在直接用 `defineAgnoToolComponents()`：

```ts
// 同一份配置会同时产生 toolRenderer 和 renderers。
const agnoTools = defineAgnoToolComponents({
  'tool.weather': {
    match: ['lookup_weather', 'weather', '天气'],
    mode: 'includes',
    component: WeatherToolCard
  },
  'tool.search-docs': {
    match: ['search_docs', /doc|search/i],
    component: SearchDocsCard
  }
});
```

它会同时生成：

- `agnoTools.toolRenderer`
- `agnoTools.renderers`

所以你不需要一边在协议里写工具名判断，一边在 surface 里再维护一份组件表。

## 按事件名挂组件

如果你还想做：

- 某个 Agno 原始事件到了就额外渲染组件
- 同一个组件随着 SSE 事件持续 patch

可以用 `defineAgnoEventComponents()`。

```ts
import {
  // 组合协议时，主协议和附加协议都能保留。
  composeProtocols,
  createAgnoProtocol,
  // 让某些 Agno 原始事件直接渲染成组件。
  defineAgnoEventComponents,
  defineAgnoPreset
} from 'agentdown';
import WeatherSummaryCard from './WeatherSummaryCard.vue';

// 当工具完成事件到来时，补一张业务摘要卡片。
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

// 主协议继续负责文本和工具，附加协议负责事件组件。
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

这里默认使用 `patch` 模式而不是 `upsert`，原因是 SSE 场景里同一个组件连续更新更常见，而 `patch` 不会把已有 block 反复挪到列表尾部。

## 用户可以自定义什么

### `defaultRunTitle`

```ts
// 也可以直接写死一个标题。
defaultRunTitle: 'Agno 助手'
```

或者：

```ts
// 或者根据当前 packet 动态决定标题。
defaultRunTitle: (packet) => packet.agent_name ?? '通用助手'
```

### `toolRenderer`

最常用的自定义项，用来决定工具块使用哪个 renderer key。

### `groupId` / `blockId` / `streamId`

如果你想和现有消息模型、埋点模型或缓存模型对齐，可以改这些 id 规则。

### `recordEvents`

调试或做回放时可打开：

```ts
// 打开后，原始 Agno 事件也会写进 runtime history 里。
recordEvents: true
```

### `surface`

可以继续覆写：

- `renderers`
- `draftPlaceholder`
- `builtinComponents`
- `messageShells`
- `performance`

## 什么时候不用默认 Agno protocol

只有两种情况建议你自己往下拆：

- 你的后端对官方 Agno 事件做了很重的二次封装
- 你要把 Agno 事件和其他来源的自定义事件混在同一条流里统一消费

这时通常的做法也不是完全推倒重来，而是：

- `createAgnoProtocol()` 保留主协议
- `composeProtocols()` 叠加额外协议

这样既保留官方事件支持，也能继续扩展业务块。
