---
title: 协议映射
description: 用 defineEventProtocol、defineProtocol、composeProtocols 和高阶 helper 把任意后端事件映射成 Agentdown RuntimeCommand。
---

# 协议映射

Agentdown 不要求后端必须返回某一种固定事件格式。  
后端返回什么 JSON，就映射什么 JSON。

核心心智模型只有一句话：

```text
raw event -> RuntimeCommand[]
```

## 什么时候用哪种入口

### `defineEventProtocol()`

适合最常见的：

- 事件里有 `event` 字段
- 或者有 `type` 这类固定事件名字段

### `defineProtocol() + when()`

适合：

- 协议分支更复杂
- 需要类型守卫
- 事件顺序和状态关系比较强

### 官方 adapter

如果你的后端已经是：

- Agno
- LangChain
- AutoGen
- CrewAI

优先用对应的 `create*Protocol()` 或 `define*Preset()`，不要重复自己写主协议。

## 常见命令

最常用的命令包括：

- `cmd.run.start()`
- `cmd.run.finish()`
- `cmd.content.open()`
- `cmd.content.append()`
- `cmd.content.replace()`
- `cmd.content.close()`
- `cmd.tool.start()`
- `cmd.tool.finish()`
- `cmd.artifact.upsert()`
- `cmd.approval.update()`
- `cmd.node.error()`
- `cmd.event.record()`

## 一个最小示例

```ts
// `cmd` 负责创建 runtime 命令，`defineEventProtocol` 负责按事件名分发。
import { cmd, defineEventProtocol } from 'agentdown';

type Packet =
  | { event: 'RunContent'; text: string }
  | { event: 'RunCompleted' }
  | { event: 'ToolCall'; id: string; name: string }
  | { event: 'ToolCompleted'; id: string; name: string; content: Record<string, unknown> };

// 把最常见的 event-based 协议映射成 runtime 命令。
const protocol = defineEventProtocol<Packet>({
  // assistant 文本到来时，把内容持续追加到同一条流。
  RunContent: (event) => [
    cmd.content.open({
      streamId: 'stream:main',
      slot: 'main'
    }),
    cmd.content.append('stream:main', event.text)
  ],
  // 回答结束时，关闭这条流。
  RunCompleted: () => cmd.content.close('stream:main'),
  // 工具开始时创建工具节点和工具 block。
  ToolCall: (event, context) =>
    cmd.tool.start({
      id: event.id,
      title: event.name,
      renderer: 'tool.weather',
      at: context.now()
    }),
  // 工具完成时更新同一个工具 block。
  ToolCompleted: (event, context) =>
    cmd.tool.finish({
      id: event.id,
      title: event.name,
      result: event.content,
      at: context.now()
    })
});
```

## 事件名不叫 `event` 也没关系

比如你的协议用 `type`：

```ts
type Packet =
  | { type: 'content.replace'; markdown: string }
  | { type: 'tool.start'; toolId: string; label: string };

// 当事件字段不是 `event` 时，把字段名作为第一个参数传进去。
const protocol = defineEventProtocol('type', {
  'content.replace': (event, context) =>
    cmd.content.replace({
      id: 'block:assistant',
      groupId: 'turn:1',
      content: event.markdown,
      kind: 'markdown',
      at: context.now()
    }),
  'tool.start': (event, context) =>
    cmd.tool.start({
      id: event.toolId,
      title: event.label,
      at: context.now()
    })
});
```

## Helper protocol 适合全局语义规范

如果你的项目已经约定了这些语义事件：

- `content.append`
- `content.replace`
- `tool.start`
- `tool.finish`
- `artifact.upsert`
- `approval.update`
- `node.error`

可以用 `createHelperProtocolFactory()` 或 `defineHelperProtocol()` 把这套规则收敛成复用配置。

## `composeProtocols()` 的作用

很多真实项目里，你不会只有一个 protocol。

例如：

- 主协议负责框架事件
- 一个附加协议负责把某个原始 SSE 事件渲染成业务组件

这时用：

```ts
import {
  // 用来把“主协议 + 附加协议”叠加成一个协议。
  composeProtocols,
  // 官方主协议。
  createAgnoProtocol,
  // 把某些事件直接渲染成业务组件。
  defineAgnoEventComponents
} from 'agentdown';

// 额外事件组件协议。
const agnoEvents = defineAgnoEventComponents({
  'event.weather-summary': {
    on: 'tool_call_completed',
    component: WeatherSummaryCard,
    resolve: ({ event }) => ({
      id: 'event:block:weather-summary',
      data: {
        payload: event
      }
    })
  }
});

// 组合后，两个协议都会按顺序执行。
const protocol = composeProtocols(
  createAgnoProtocol(),
  agnoEvents.protocol
);
```

## 按工具名选组件

工具卡片是最常见的“协议层 + UI 层”重复样板。  
现在推荐直接用：

- `defineAgnoToolComponents()`
- `defineLangChainToolComponents()`
- `defineAutoGenToolComponents()`
- `defineCrewAIToolComponents()`

它们会同时产出：

- `toolRenderer`
- `renderers`

这样你不用自己维护两份工具映射表。

## 什么时候该用 `stream.*`

适合持续增长的文本流：

- assistant token 输出
- markdown 片段逐步追加
- 长文生成中的尾部草稿

## 什么时候该直接用 `block.*`

适合结构已经稳定、或者本来就是组件态的数据：

- 工具卡片
- artifact 卡片
- approval 卡片
- 业务自定义 widget

## 如果后端就是官方框架，还要不要自己写协议

一般不需要。  
优先用官方 adapter，再在两种地方扩展：

1. `protocolOptions`
2. `composeProtocols() + define*EventComponents()`

只有当你的后端对官方事件做了大幅改造时，才建议完全自己写协议。
