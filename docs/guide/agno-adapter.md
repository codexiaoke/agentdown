---
title: Agno 适配
description: 使用官方 Agno SSE 事件直接接入 Agentdown，并了解有哪些默认能力和可自定义点。
---

# Agno 适配

`createAgnoProtocol()` 和 `defineAgnoPreset()` 的目标很简单：

- 后端继续返回官方 Agno 事件
- 前端负责把这些事件映射成 Agentdown runtime
- 用户只改“映射规则”和“渲染组件”，不用自己反复写样板代码

## 默认做了什么

开箱即用时，Agno 适配层会自动处理这些事情：

- `RunStarted` 映射成一次 `run.start`
- `RunContent` 作为 markdown 流式文本追加
- `ToolCallStarted` 自动插入工具块
- `ToolCallCompleted` 自动更新工具结果
- `RunCompleted` 自动结束本轮消息
- 工具前后的文本会自动分段，避免全部拼成一个 block
- 工具结果如果是 Python `repr` 风格字符串，会尽量恢复成对象

也就是说，后端不用为了 Agentdown 再包一层“统一协议”。

## 最常见的接法

```ts
import { defineAgnoPreset } from 'agentdown';
import WeatherToolCard from './WeatherToolCard.vue';

const preset = defineAgnoPreset<string>({
  protocolOptions: {
    toolRenderer: ({ tool }) => {
      if (tool?.tool_name === 'lookup_weather') {
        return 'tool.weather';
      }

      return 'tool';
    }
  },
  renderers: {
    'tool.weather': WeatherToolCard
  }
});
```

## 用户可以自定义什么

### 1. 工具渲染器映射

最常用的是 `toolRenderer`。

```ts
toolRenderer: ({ tool }) => {
  if (tool?.tool_name === 'search_docs') {
    return 'tool.search-docs';
  }

  if (tool?.tool_name === 'lookup_weather') {
    return 'tool.weather';
  }

  return 'tool';
}
```

它只负责决定这个工具块用哪个 `renderer key`。  
真正显示成什么 Vue 组件，再交给 `RunSurface` 的 `renderers`。

### 2. 消息分组 id

如果你想控制一轮消息在聊天 UI 里怎么分组，可以改 `groupId`。

```ts
groupId: (runId) => `conversation:${runId}`
```

### 3. 文本流 id 和 block id

如果你需要和自己已有的数据结构对齐，可以改：

- `streamId`
- `blockId`

```ts
streamId: (runId) => `assistant-stream:${runId}`,
blockId: (runId) => `assistant-block:${runId}`
```

### 4. run 标题

可以自定义每次 run 在 runtime 里的标题来源：

```ts
defaultRunTitle: (packet) => packet.agent_name ?? '通用助手'
```

### 5. 文本使用哪个 assembler

默认 `RunContent` 走 `markdown` assembler。  
如果你想接别的流式组装器，也可以改：

```ts
streamAssembler: 'markdown'
```

或者在 preset 里扩展自己的 assembler：

```ts
defineAgnoPreset({
  protocolOptions: {
    streamAssembler: 'my-markdown'
  },
  assemblers: {
    'my-markdown': myAssembler
  }
});
```

### 6. 是否记录原始事件

调试时可以打开 `recordEvents`：

```ts
recordEvents: true
```

这样 runtime 会保留原始 packet，方便你做调试面板或回放。

### 7. 是否在 `run_started` 时立刻开流

默认会先开一个 assistant 草稿流，适合聊天场景。  
如果你不想这么做，可以关掉：

```ts
openStreamOnRunStarted: false
```

## UI 层还能继续自定义

Agno adapter 只负责“协议到 runtime”。  
真正渲染时，用户还可以继续替换：

- `renderers`
  用来替换工具卡片、artifact 卡片、审批卡片等 surface renderer
- `builtinComponents`
  用来替换 markdown 内置块，例如 `text`、`code`、`html`、`thought`

所以它的分层是：

1. 后端输出官方 Agno 事件
2. Agno adapter 把事件映射成 runtime 命令
3. `renderers` 决定工具块长什么样
4. `builtinComponents` 决定 markdown block 长什么样

## 什么时候需要自己重写 protocol

只有两种情况建议自己重写：

- 你的后端事件顺序和 Agno 官方差异非常大
- 你希望把非 Agno 事件也混在同一个流里统一处理

其他大多数场景里，直接在 `AgnoProtocolOptions` 里改就够了。
