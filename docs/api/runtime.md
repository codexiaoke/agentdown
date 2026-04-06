---
title: Runtime 与 Bridge
description: createAgentRuntime、createBridge、transport 与 runtime 读写接口说明。
---

# Runtime 与 Bridge

## `createAgentRuntime()`

```ts
const runtime = createAgentRuntime()
```

当前版本的 runtime 没有旧式事件 reducer。  
它专注于同步状态读写和快照能力。

## `AgentRuntime` 实例方法

| 方法 | 说明 |
| --- | --- |
| `apply(commands)` | 应用一条或多条 `RuntimeCommand` |
| `node(id)` | 获取单个 node |
| `nodes()` | 获取全部 node |
| `block(id)` | 获取单个 block |
| `blocks(slot?)` | 获取全部 block 或某个 slot 的 block |
| `children(nodeId)` | 获取某个 node 的直接子节点 |
| `intents()` | 获取已记录 intent |
| `history()` | 获取命令与 intent 历史 |
| `emitIntent(intent)` | 写入结构化 UI intent |
| `snapshot()` | 获取完整快照 |
| `subscribe(listener)` | 监听 runtime 更新 |
| `reset()` | 清空当前状态 |

## `createBridge()`

```ts
const bridge = createBridge({
  runtime,
  protocol,
  assemblers: {
    markdown: createMarkdownAssembler()
  }
})
```

Bridge 负责：

- 接收 raw packet
- 调用 `protocol.map()`
- 把 `stream.*` 命令交给对应 assembler
- 批量 flush 到 runtime

## `Bridge` 实例方法

| 方法 | 说明 |
| --- | --- |
| `push(packetOrPackets)` | 推入一条或多条 raw packet |
| `consume(source, options?)` | 从 transport 持续消费异步数据 |
| `flush(reason?)` | 立即把待处理命令提交到 runtime |
| `reset()` | 清空 bridge 状态，并重置 protocol 与 assembler |
| `close()` | 关闭 bridge |
| `status()` | 获取当前状态 |
| `snapshot()` | 获取 bridge 调试快照 |

## `useSseBridge()`

如果你在 Vue 组件里直接消费 SSE，最省事的写法通常是：

```ts
const {
  runtime,
  connect,
  disconnect,
  consuming,
  error,
  status
} = useSseBridge<Packet>({
  source: '/api/agent/sse',
  protocol,
  assemblers: {
    markdown: createMarkdownAssembler()
  },
  request: {
    body: {
      message: '帮我查一下北京天气'
    }
  },
  transport: {
    mode: 'json'
  }
})

await connect(undefined, {
  request: {
    body: {
      message: '再查一次'
    }
  }
})
```

它内部会帮你：

- 创建 `bridge`
- 连接 `createSseTransport()`
- 用 `request.body / request.headers / request.method` 这种更贴近业务的写法生成请求
- 管理 `start / stop / restart`
- 同时提供更贴近业务 hook 心智的 `connect / reconnect / disconnect`
- 暴露响应式的 `status / error / consuming`

## `useSse()`

如果你暂时只需要一个更通用的 SSE hook，而不是直接接 Agentdown runtime：

```ts
const {
  status,
  lastMessage,
  connect,
  abort
} = useSse<MyPacket>({
  onMessage: (packet) => {
    console.log(packet)
  }
})

await connect('/api/chat/sse', {
  request: {
    body: {
      message: 'hello'
    }
  }
})
```

它更接近普通业务 composable 的写法，支持：

- `connect() / restart() / abort()`
- `status`
- `lastMessage / messages / messageCount`
- `request.body / request.headers / request.method`

同一套模式也提供：

- `useNdjsonBridge()`
- `useWebSocketBridge()`
- `useAsyncIterableBridge()`
- `useBridgeTransport()`：如果你已经有一个现成 bridge

## `useAsyncIterableBridge()`

如果你的数据源本身就是 `async function*`、本地 mock 流或测试 packet 列表：

```ts
const { runtime, start } = useAsyncIterableBridge<Packet>({
  protocol,
  assemblers: {
    markdown: createMarkdownAssembler()
  }
})

await start(createPacketStream())
```

这对本地 demo、测试、离线 replay 源特别顺手。

## `useRuntimeSnapshot()`

```ts
const { snapshot, blocks, nodes, history } = useRuntimeSnapshot(runtime)
```

适合把 `runtime.subscribe()` 包成 Vue 响应式状态。

## `useAgentSession()`

如果你就是在搭一个完整页面，想一次拿到：

- `runtime`
- `bridge`
- `surface`
- `exportedTranscript`
- `activeTranscript`
- `replay`

可以直接用：

```ts
const session = useAgentSession(myPreset)

session.push(packet)
session.flush()
session.useExportedTranscript()
await session.replay.play()
```

它本质上是对：

- `preset.createSession()`
- `useRuntimeSnapshot()`
- `useRuntimeTranscript()`
- `useRuntimeReplayPlayer()`

这几层的页面级组合封装。

## `useAdapterSession()`

如果你已经在使用官方 starter adapter，例如：

- `createAgnoAdapter()`
- `createLangChainAdapter()`
- `createAutoGenAdapter()`
- `createCrewAIAdapter()`

那更推荐直接用：

```ts
const session = useAdapterSession(myAdapter, {
  overrides: {
    source: '/api/stream/agno',
    transport: createSseTransport({
      mode: 'json'
    })
  }
})

await session.connect()
```

它本质上是在 `adapter.createSession()` 之上，再把这些页面常用能力一起收好：

- `status`
- `error`
- `runtimeState`
- `transcriptState`
- `replay`
- `connect()` / `disconnect()` / `restart()`

## `createRuntimeTranscript()`

把当前 runtime 或 snapshot 导出成一份可序列化 transcript：

```ts
const transcript = createRuntimeTranscript(runtime)
```

导出结果会包含：

- `snapshot`
- `history`
- `messages`
- `tools`
- `artifacts`
- `approvals`

其中：

- `messages` 是按 `slot / groupId / role` 聚合后的消息视图
- `tools` 是工具调用摘要，适合做审计、回放或侧栏工具面板
- `artifacts` / `approvals` 是面向 UI 消费的结构化摘要

适合直接拿来做导出、摘要页和 replay 面板。

## `parseRuntimeTranscript()`

把导出的 JSON 字符串或普通对象恢复成标准 transcript：

```ts
const transcript = parseRuntimeTranscript(jsonText)
```

如果导入内容缺少 `messages / tools / artifacts / approvals`，会基于 `snapshot` 自动补齐。

## `isRuntimeTranscript()`

如果你只想先做轻量判断：

```ts
if (isRuntimeTranscript(value)) {
  console.log(value.history)
}
```

## `useRuntimeTranscript()`

```ts
const { transcript } = useRuntimeTranscript(runtime)
```

适合接导出按钮、摘要面板或会话存档。

## `replayRuntimeHistory()`

如果你只想根据 history 直接重建最终状态：

```ts
const replayedRuntime = replayRuntimeHistory(transcript.history)
```

## `createRuntimeReplayPlayer()`

如果你想做可控回放：

```ts
const player = createRuntimeReplayPlayer(transcript.history)

player.step()
await player.play({ intervalMs: 320 })
player.seek(10)
player.reset()
```

它内部维护一个新的 runtime，适合接到 `RunSurface` 做可视化回放。

## `useRuntimeReplayPlayer()`

```ts
const {
  runtime,
  position,
  total,
  play,
  pause,
  step,
  reset
} = useRuntimeReplayPlayer(transcript)
```

适合接回放控制条或导入 transcript 后的预览页。

## `createAsyncIterableTransport()`

如果你的输入本身已经是 `AsyncIterable<TRawPacket>`，可以直接使用：

```ts
const transport = createAsyncIterableTransport<MyPacket>()
```

然后交给 `bridge.consume(source)`。

## `createSseTransport()`

适合直接消费标准 SSE 响应流：

```ts
const transport = createSseTransport<MyPacket>({
  mode: 'json'
})

await bridge.consume('/api/stream', { signal })
```

默认支持三种模式：

- `event`：返回完整 SSE message
- `json`：对 `data` 做 `JSON.parse`
- `text`：直接返回 `data` 字符串

如果后端格式更特殊，也可以自定义 `parse(message, context)`。

## `createJsonSseTransport()`

如果你的后端是最常见的“POST JSON body，然后返回 SSE JSON 事件”：

```ts
const transport = createJsonSseTransport<MyPacket>({
  request: {
    body: {
      message: '帮我查一下北京天气'
    }
  }
})

await bridge.consume('/api/stream', { signal })
```

这个 helper 会自动处理：

- `mode: 'json'`
- JSON body 的 `JSON.stringify`
- 默认 `Content-Type: application/json`
- 传了 body 但没写 method 时，默认使用 `POST`

## `createNdjsonTransport()`

适合消费按行输出的 NDJSON：

```ts
const transport = createNdjsonTransport<MyPacket>()

await bridge.consume('/api/stream.ndjson', { signal })
```

默认每一行都会走 `JSON.parse`；如果你只是想拿原始文本，可以传 `mode: 'text'`。

## `createWebSocketTransport()`

适合消费持续连接的 WebSocket 消息流：

```ts
const transport = createWebSocketTransport<MyPacket>({
  mode: 'json'
})

await bridge.consume('wss://example.com/agent', { signal })
```

默认支持三种模式：

- `event`：返回完整 websocket message 包装对象
- `json`：把收到的文本消息做 `JSON.parse`
- `text`：把收到的消息解码成文本

如果你需要登录握手、订阅频道或自定义协议，也可以用：

- `protocols`
- `onOpen(context)`
- `parse(message, context)`

## 一个常见的 UI 接法

```ts
const snapshot = runtime.snapshot()

const unsubscribe = runtime.subscribe(() => {
  render(runtime.snapshot())
})
```

这让你可以把 runtime 接到聊天界面、工具面板、侧栏摘要或你自己的 `RunSurface` 上。
