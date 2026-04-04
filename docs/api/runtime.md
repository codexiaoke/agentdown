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
| `reset()` | 清空 bridge 状态并重置 assembler |
| `close()` | 关闭 bridge |
| `status()` | 获取当前状态 |
| `snapshot()` | 获取 bridge 调试快照 |

## `createRuntimeTranscript()`

把当前 runtime 或 snapshot 导出成一份可序列化 transcript：

```ts
const transcript = createRuntimeTranscript(runtime)
```

导出结果会包含：

- `snapshot`
- `history`
- `messages`

其中 `messages` 是按 `slot / groupId / role` 聚合后的消息视图，适合做导出、摘要和回放页。

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
