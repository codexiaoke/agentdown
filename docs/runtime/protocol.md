---
title: 协议映射
description: 用 defineEventProtocol 和 cmd 高阶 helper 把任意后端事件映射成 Agentdown RuntimeCommand。
---

# 协议映射

Agentdown 不要求后端必须返回某一种固定事件格式。  
你的后端可以返回任何 JSON，只要你把它映射成统一 `RuntimeCommand[]` 就可以。

如果你的项目已经收敛出一套稳定的语义事件名，也可以直接用 `defineHelperProtocol()` 或 `createHelperProtocolFactory()` 来减少重复样板。

## 核心心智模型

```text
raw event -> RuntimeCommand[]
```

常见命令包括：

- `cmd.node.upsert()`
- `cmd.node.patch()`
- `cmd.block.upsert()`
- `cmd.block.patch()`
- `cmd.stream.open()`
- `cmd.stream.delta()`
- `cmd.stream.close()`
- `cmd.event.record()`

## 一个最小示例

```ts
import { cmd, defineEventProtocol } from 'agentdown';

type Packet =
  | { event: 'RunContent'; text: string }
  | { event: 'ToolCall'; id: string; name: string }
  | { event: 'ToolCompleted'; id: string; name: string; content: Record<string, unknown> };

const protocol = defineEventProtocol<Packet>({
  RunContent: (event) => [
    cmd.content.open({
      streamId: 'stream:main',
      slot: 'main'
    }),
    cmd.content.append('stream:main', event.text),
    cmd.content.close('stream:main')
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
```

## 用 Helper Protocol 工厂做全局规范

```ts
import { createHelperProtocolFactory } from 'agentdown';

const helperProtocolFactory = createHelperProtocolFactory<Packet, 'type'>({
  eventKey: 'type',
  defaults: {
    'content.replace': {
      kind: 'markdown'
    },
    'tool.start': {
      renderer: 'tool.weather'
    }
  },
  bindings: {
    'content.replace': {
      on: 'content.replace',
      resolve: (event) => ({
        id: event.blockId,
        groupId: event.groupId,
        content: event.markdown
      })
    },
    'tool.start': {
      on: 'tool.start',
      resolve: (event) => ({
        id: event.toolId,
        title: event.label,
        groupId: event.groupId
      })
    },
    'tool.finish': {
      on: 'tool.finish',
      resolve: (event) => ({
        id: event.toolId,
        title: event.label,
        result: event.payload
      })
    }
  }
});

const protocol = helperProtocolFactory.createProtocol();
```

这样“事件名怎么映射”可以全局定义一次，后面多个 preset 直接复用；如果个别页面有特殊需求，再用 `createProtocol(overrides)` 局部补充。

另外，`cmd.tool.start()` 如果没有显式传 `renderer`，现在会自动落到内置默认 `tool` renderer。
这意味着你可以先把协议链路接通，之后再逐步替换成自己的业务组件。

## 用户可以完全自定义事件名

你完全可以用你自己的事件协议，例如：

```ts
type Packet =
  | { type: 'content.append'; token: string }
  | { type: 'content.replace'; markdown: string }
  | { type: 'tool.start'; toolId: string; label: string }
  | { type: 'tool.update'; toolId: string; payload: Record<string, unknown> }
  | { type: 'tool.finish'; toolId: string; payload: Record<string, unknown> }
  | { type: 'artifact.upsert'; artifactId: string; kind: string }
  | { type: 'approval.update'; approvalId: string; status: string }
  | { type: 'node.error'; nodeId: string; message: string };
```

只要规则里能识别它们，就可以映射成统一命令。

例如直接这样写：

```ts
const protocol = defineEventProtocol<'type', Packet>('type', {
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
      renderer: 'tool.weather',
      at: context.now()
    }),
  'tool.finish': (event, context) =>
    cmd.tool.finish({
      id: event.toolId,
      result: event.payload,
      at: context.now()
    }),
  'artifact.upsert': (event, context) =>
    cmd.artifact.upsert({
      id: `artifact:${event.artifactId}`,
      title: '生成产物',
      artifactId: event.artifactId,
      artifactKind: event.kind,
      at: context.now()
    }),
  'approval.update': (event, context) =>
    cmd.approval.update({
      id: `approval:${event.approvalId}`,
      title: '等待审批',
      approvalId: event.approvalId,
      status: event.status,
      at: context.now()
    }),
  'node.error': (event, context) =>
    cmd.node.error({
      id: event.nodeId,
      message: event.message,
      at: context.now()
    })
});
```

## 什么时候用 `stream.*`

适合持续增长的文本流：

- assistant token 输出
- markdown 片段持续追加
- 长文生成中的尾部草稿

如果你更喜欢可读性高一点的写法，也可以用：

- `cmd.stream.write(...)`
- `cmd.stream.end(...)`

## 什么时候直接用 `block.*`

适合结构已经稳定或本来就是组件态的数据：

- 工具卡片
- artifact 卡片
- approval 卡片
- 业务自定义 widget

## `when()` 的意义

`defineEventProtocol()` 适合最常见的基于 `event` 字段分发的后端协议。  
如果你的协议更复杂，再退回 `defineProtocol() + when()` 即可。

如果你的 protocol 内部维护了流式状态，也可以实现可选的 `reset()`；
`bridge.reset()` 和 `bridge.close()` 会自动调用它，避免上一轮运行遗留状态污染下一轮映射。

继续看 [Streaming 组装](/runtime/reducer) 可以理解 markdown token 为什么不会立刻乱渲染。
