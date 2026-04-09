---
title: Runtime 与 Bridge
description: createBridge、defineEventProtocol、useSseBridge、useAsyncIterableBridge 等核心入口。
---

# Runtime 与 Bridge

这一页不追求把所有类型穷举完，而是说明最常用的几个核心入口各负责什么。

## `cmd`

`cmd` 是协议层创建 runtime 命令的 helper。

最常见的命令族：

- `cmd.content.*`
- `cmd.tool.*`
- `cmd.artifact.*`
- `cmd.approval.*`
- `cmd.handoff.*`
- `cmd.run.*`
- `cmd.node.*`
- `cmd.event.record()`

## `defineEventProtocol()`

当你的后端是标准“事件名 -> 数据载荷”风格时，优先用它。

```ts
const protocol = defineEventProtocol<Packet>({
  RunContent: (event) => [
    cmd.content.open({
      streamId: 'stream:assistant',
      slot: 'main'
    }),
    cmd.content.append('stream:assistant', event.text)
  ]
});
```

## `composeProtocols()`

把多个协议串起来。

最常见的用法是：

- 主协议负责 run / text / tool
- 附加协议负责 event component 或 side effect

## `createBridge()`

如果你想自己控制 runtime、protocol、transport，`createBridge()` 是最底层主入口。

```ts
const bridge = createBridge({
  runtime,
  protocol,
  assemblers: {
    markdown: createMarkdownAssembler()
  }
});
```

Bridge 负责：

- 接 raw packet
- 调用 protocol
- 把流式命令交给 assembler
- 再提交到 runtime

## `useSseBridge()`

这是页面层最常用的入口。

```ts
const session = useSseBridge<Packet>({
  source: '/api/agent/sse',
  protocol,
  assemblers: {
    markdown: createMarkdownAssembler()
  },
  transport: {
    mode: 'json'
  }
});

await session.connect();
```

它会直接给你：

- `runtime`
- `connect()`
- `disconnect()`
- `status`
- `error`
- `consuming`

## `useAsyncIterableBridge()`

当你的数据源是本地 `async function*`、测试流或 replay 流时，用它最顺手。

```ts
const session = useAsyncIterableBridge<Packet>({
  source: createPacketStream(),
  protocol,
  assemblers: {
    markdown: createMarkdownAssembler()
  }
});
```

## `eventToAction()`

不是所有事件都应该转成 block。

像这些更适合直接做副作用：

- `CreateSession`
- `SetTitle`
- `UpdateUsage`
- 埋点 / 统计 / 路由跳转

这时用 `eventToAction()`。

## `defineAgentdownPreset()`

如果你想把：

- protocol
- assembler
- surface
- transport 习惯

打包成一套自己的 starter，就用 `defineAgentdownPreset()`。
