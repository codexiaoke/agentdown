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
  protocol,
  assemblers: {
    markdown: createMarkdownAssembler()
  },
  runtimeOptions: {
    limits: {
      maxBlocks: 10_000,
      maxHistoryEntries: 2_000
    },
    onListenerError(error, context) {
      reportFrontendError(error, context);
    }
  }
});
```

Bridge 负责：

- 接 raw packet
- 调用 protocol
- 把流式命令交给 assembler
- 再提交到 runtime

如果已经由宿主创建了 `runtime`，可以直接传入它；`runtime` 和
`runtimeOptions` 不能同时出现，避免配置看似生效、实际被忽略。

## `createAgentRuntime()` 的生产保护

Runtime 默认有明确容量边界：

| 集合 | 默认上限 | 达到上限后的行为 |
| --- | ---: | --- |
| nodes | 10,000 | 在写入前拒绝整批命令 |
| blocks | 20,000 | 在写入前拒绝整批命令 |
| intents | 2,000 | 只保留最近记录 |
| history | 5,000 | 只保留最近记录 |

节点和 block 不会被静默清理。宿主应在切换会话或归档完成后调用
`runtime.reset()`，或者根据业务规模显式调整 `limits`。传入 `false`
可以关闭某一个上限，但不建议对外部、不可信的数据流这样做。

```ts
const runtime = createAgentRuntime({
  limits: {
    maxNodes: 5_000,
    maxBlocks: 12_000,
    maxIntents: 1_000,
    maxHistoryEntries: 3_000
  },
  onListenerError(error, { revision }) {
    telemetry.capture(error, { revision });
  }
});

console.log(runtime.stats());
```

`apply([...commands])` 会先校验整批命令和执行后的容量，再修改状态。
自定义协议即使绕过 TypeScript 传入畸形命令，也不会留下执行一半的
runtime 状态。

只负责渲染时，可以排除调试数据，避免每次更新都克隆 history：

```ts
runtime.snapshot({
  includeIntents: false,
  includeHistory: false
});
```

`RunSurface` 和按 block/message 查询的 composable 已默认使用这种轻量
快照；回放、导出和 Devtools 仍然使用完整快照。

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
