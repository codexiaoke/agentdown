---
title: V1 产品设计
description: Agentdown V1 的产品定位、核心架构、协议边界与非目标定义。
---

# V1 产品设计

> 本文定义 Agentdown V1 的正式设计基线。  
> 当前主链已经收敛为 `Protocol + Bridge + Assembler + Runtime + RunSurface`，并覆盖流式 Markdown 稳定化、性能收敛和默认 AGUI 渲染体验。

## 一句话定位

**Agentdown V1 是一个面向流式输出的、协议无关的、可交互的 Agent Markdown + AGUI Runtime。**

它的核心目标不是“把 markdown 渲染得更好看”，而是：

**把任意 Agent 后端的流式输出，变成可交互、可组合、可持续更新、性能可控的前端界面。**

## V1 要解决什么问题

Agentdown V1 重点解决 4 类问题：

- 任意后端协议都能接入，不强绑定某一种 SSE 事件格式
- 流式 Markdown 能安全渲染，不出现半截表格、代码块、Mermaid、公式乱码
- Agent 输出不再只有纯文本，还能自然混排工具卡片、产物、审批、思考过程等 AGUI
- 长文本和大组件并存时，浏览器仍然保持顺滑，不因为高频 token 更新而卡顿

## 核心原则

- `Protocol-agnostic`：不绑定 Agno、LangGraph、AI SDK 或任何固定后端事件名
- `Streaming-first`：流式输出是主场景，不是附加能力
- `AGUI-first`：工具卡片、审批、产物、自定义组件是第一公民，不是 markdown hack
- `Safe rendering`：宁可先保守展示，也不提前渲染错误结构
- `Performance by default`：默认内建 batching、单尾部草稿、长文本分段冻结、重型组件懒挂载
- `Vue-first UI`：V1 的渲染层先聚焦 Vue，协议层和 runtime 保持框架无关

## 总体分层

V1 采用 6 层结构：

1. `Transport`
2. `Protocol`
3. `Bridge`
4. `Assembler`
5. `Runtime`
6. `RunSurface`

它们的链路固定为：

```text
Transport -> Protocol -> Assembler -> Runtime -> RunSurface
```

这条链路的目标是把“异步输入世界”和“同步可重放的 UI 状态机”彻底分开。

## 各层职责

### 1. Transport

`Transport` 只负责把 `SSE / NDJSON / WebSocket / AsyncIterable` 转成原始包 `raw packet`。

职责：

- 读取传输层数据
- 解析成一个个原始包
- 暴露统一的 `AsyncIterable<TRawPacket>`

非职责：

- 不做业务语义映射
- 不做 UI 状态更新
- 不假设后端一定是 SSE

当前已经提供：

- `createAsyncIterableTransport()`
- `createSseTransport()`
- `createNdjsonTransport()`
- `createWebSocketTransport()`

### 2. Protocol

`Protocol` 负责把原始包映射为 `RuntimeCommand[]`。

核心心智模型：

```text
raw event -> RuntimeCommand[]
```

职责：

- 匹配原始事件
- 输出结构化命令
- 允许用户完全自定义映射规则

非职责：

- 不直接读 runtime
- 不处理 markdown 流式稳定化
- 不决定最终 UI 布局

V1 的 `ProtocolContext` 只暴露：

- `now()`
- `makeId()`

这样可以避免 protocol 逐渐演化成难维护的小型解释器。

### 3. Bridge

`Bridge` 是整个 V1 的输入编排器。

职责：

- 接收输入流
- 调用 `protocol.map()`
- 把 `stream.*` 命令路由给 assembler
- 做批量 flush
- 把最终命令提交给 runtime
- 可选记录 debug/history

Bridge 的存在是为了让 runtime 保持纯粹：

- runtime 不需要理解 SSE、NDJSON、token stream
- runtime 只需要理解结构化命令

### 4. Assembler

`Assembler` 负责处理 `stream.open / stream.delta / stream.close / stream.abort`。

职责：

- 维护流式会话状态
- 将碎片化 token 组装成稳定 block
- 区分 `draft` 与 `stable`
- 保证 markdown 流式输出的展示体验

V1 内置：

- `createMarkdownAssembler()`
- `createPlainTextAssembler()`

### 5. Runtime

`Runtime` 是同步、可重放的状态核心。

职责：

- 接收命令
- 维护 node / block / intent / history
- 提供读接口和快照能力

约束：

- `apply()` 是唯一公共写入口
- runtime 不感知后端协议
- runtime 不处理流式 markdown 解析

### 6. RunSurface

`RunSurface` 是 V1 的主 UI 入口，不再由 `MarkdownRenderer` 独自承担全部叙事和运行态职责。

职责：

- 按 `slot` 渲染 block
- 按 `renderer` 分发组件
- 用 `groupId` 形成聊天消息单元
- 支持 lazy mount、virtualization 和自定义 widget

## 核心数据模型

### RuntimeNode

```ts
interface RuntimeNode<TData = Record<string, unknown>> {
  id: string
  type: string
  status?: string
  parentId?: string | null
  title?: string
  message?: string
  data: TData
  startedAt?: number
  updatedAt?: number
  endedAt?: number
}
```

设计原则：

- `node` 表示运行态实体，如 run、agent、tool、approval
- 保留 `title / message` 作为最常见的人类可读字段
- `data` 作为开放扩展区，不提前写死业务 schema

### SurfaceBlock

```ts
interface SurfaceBlock<TData = Record<string, unknown>> {
  id: string
  slot: string
  type: string
  renderer: string
  state: 'draft' | 'stable'
  nodeId?: string | null
  groupId?: string | null
  content?: string
  data: TData
  createdAt?: number
  updatedAt?: number
}
```

设计原则：

- `type` 表示块的抽象类型
- `renderer` 表示最终使用哪个渲染器
- `slot` 是开放字符串，允许主区、侧栏、详情区等布局
- `state` 属于 block，不属于 node
- `groupId` 用于把多个 block 聚合成一条消息单元

### RuntimeIntent

```ts
interface RuntimeIntent<TPayload = Record<string, unknown>> {
  id: string
  type: string
  nodeId?: string | null
  blockId?: string | null
  payload: TPayload
  at: number
}
```

设计原则：

- `intent` 是结构化 UI 动作
- 它不是 DOM event，也不是后端请求本身
- intent 默认只记录和上抛，不自动修改 runtime

## 命令模型

V1 的核心命令定义为：

```ts
type RuntimeCommand =
  | { type: 'node.upsert'; node: RuntimeNode }
  | { type: 'node.patch'; id: string; patch: Partial<RuntimeNode> }
  | { type: 'node.remove'; id: string }
  | {
      type: 'block.insert'
      block: SurfaceBlock
      beforeId?: string
      afterId?: string
    }
  | { type: 'block.upsert'; block: SurfaceBlock }
  | { type: 'block.patch'; id: string; patch: Partial<SurfaceBlock> }
  | { type: 'block.remove'; id: string }
  | {
      type: 'stream.open'
      streamId: string
      slot: string
      assembler: string
      nodeId?: string | null
      groupId?: string | null
      data?: Record<string, unknown>
    }
  | { type: 'stream.delta'; streamId: string; text: string }
  | { type: 'stream.close'; streamId: string }
  | { type: 'stream.abort'; streamId: string; reason?: string }
  | { type: 'event.record'; event: Record<string, unknown> }
```

这里有两个重要原则：

- core 保持结构化命令，不内建固定业务语义
- `tool.start`、`approval.update`、`artifact.upsert` 这类名字只能存在于 preset 或 helper 层，不能成为 core 的强制协议

## Runtime API

```ts
interface AgentRuntime {
  apply(commands: RuntimeCommand | RuntimeCommand[]): void

  node(id: string): RuntimeNode | undefined
  nodes(): RuntimeNode[]

  block(id: string): SurfaceBlock | undefined
  blocks(slot?: string): SurfaceBlock[]

  children(nodeId: string): RuntimeNode[]
  intents(): RuntimeIntent[]
  history(): unknown[]

  emitIntent(intent: Omit<RuntimeIntent, 'id' | 'at'>): RuntimeIntent
  snapshot(): RuntimeSnapshot
  reset(): void
}
```

最终约束：

- `apply()` 是唯一公共写入口
- runtime 的所有状态变更都可重放
- intent 会被记录进历史

## Protocol API

V1 采用对象式规则，而不是在 core 中引入复杂 DSL。

```ts
interface ProtocolContext {
  now(): number
  makeId(prefix?: string): string
}

interface ProtocolRule<TRawEvent> {
  name?: string
  match: (event: TRawEvent, context: ProtocolContext) => boolean
  map: (input: {
    event: TRawEvent
    context: ProtocolContext
  }) => RuntimeCommand | RuntimeCommand[] | null | void
}
```

```ts
function defineProtocol<TRawEvent>(
  rules: ProtocolRule<TRawEvent>[]
): RuntimeProtocol<TRawEvent>
```

V1 行为约束：

- 一条原始事件可以命中多条 rule
- 所有命中的 rule 按声明顺序执行
- V1 的 protocol 默认不能读取 runtime

helper 层建议提供：

- `cmd.node.upsert(...)`
- `cmd.node.patch(...)`
- `cmd.block.upsert(...)`
- `cmd.block.patch(...)`
- `cmd.stream.open(...)`
- `cmd.stream.delta(...)`
- `cmd.stream.close(...)`
- `cmd.stream.abort(...)`
- `cmd.event.record(...)`
- `stream.write(...)`
- `stream.end(...)`

这样开发者只需要处理映射规则，不需要自己实现整套前端运行逻辑。

## Bridge API

```ts
interface Bridge<TRawPacket = unknown, TSource = unknown> {
  readonly runtime: AgentRuntime
  readonly protocol: RuntimeProtocol<TRawPacket>

  push(packet: TRawPacket | TRawPacket[]): void
  consume(source: TSource, options?: ConsumeOptions): Promise<void>

  flush(reason?: string): void
  reset(): void
  close(): void

  status(): BridgeStatus
  snapshot(): BridgeSnapshot<TRawPacket>
}
```

```ts
interface BridgeOptions<TRawPacket = unknown, TSource = unknown> {
  runtime?: AgentRuntime
  protocol: RuntimeProtocol<TRawPacket>
  transport?: TransportAdapter<TSource, TRawPacket>
  assemblers?: Record<string, StreamAssembler>
  scheduler?: 'sync' | 'microtask' | 'animation-frame' | FlushScheduler
  batch?: {
    maxCommands?: number
    maxLatencyMs?: number
    coalesceStreamDeltas?: boolean
  }
  debug?: {
    recordRawPackets?: boolean
    recordMappedCommands?: boolean
    maxEntries?: number
  }
}
```

为什么 V1 一定需要 bridge：

- 不同后端的传输层和事件层并不统一
- runtime 不应该直接感知流式协议
- assembler 的 buffering 状态也不应该进入 runtime

## Markdown Assembler 设计

Markdown assembler 是 V1 最关键的体验模块。

### 核心目标

- token 很碎时仍然稳定显示
- 表格、代码块、Mermaid、公式、directive 不提前乱码
- 只对“新稳定的前缀”做解析，不反复重跑整篇 markdown

### 核心规则

- 每个 `streamId` 只有一个活动 `draft tail`
- 已经成为 `stable` 的 block 默认不回退
- 只解析新稳定下来的前缀
- 剩余尾巴继续作为 `draft` 保留

### 内部会话状态

```ts
interface MarkdownStreamSession {
  streamId: string
  slot: string
  nodeId?: string | null
  groupId?: string | null

  source: string
  stableOffset: number

  draftBlockId?: string | null
  segmentIndex: number

  mode: 'open' | 'closed' | 'aborted'
}
```

### 稳定策略

V1 按以下四类规则判断何时可以把内容从 `draft` 提升为 `stable`：

- `line-stable`
  - 如 ATX heading、horizontal rule
- `separator-stable`
  - 如 paragraph、list、blockquote
- `candidate-stable`
  - 如 table、setext heading
- `close-stable`
  - 如 fenced code、mermaid、math、directive、thought

### 渲染策略

- 普通段落：先 `markdown.draft`，遇到明确边界后转 `markdown.stable`
- fenced code：未闭合前走 `code.draft`，闭合后转 `code.stable`
- table：先确认表头和分隔线，再进入 `table.draft`，完整结束后再稳定
- 未闭合复杂结构：保守显示，不提前结构化
- `stream.close`：强制 finalize 剩余尾巴
- `stream.abort`：保留当前内容并标记 `aborted / incomplete`

### 一个重要补充

`block.insert` 需要支持 `beforeId / afterId`，因为 assembler 会持续把“新稳定块”插到当前 draft 之前，才能保证顺序正确。

## RunSurface 设计

`RunSurface` 是 V1 真正面向产品的渲染入口。

职责：

- 按 `slot` 渲染 surface
- 按 `renderer` 分发组件
- 基于 `groupId` 组织聊天式消息布局
- 对 heavy block 启用 lazy mount 和 virtualization

渲染器标准 props：

```ts
{
  block,
  node,
  runtime,
  sendIntent
}
```

设计原则：

- renderer registry 与 widget registry 分开
- draft/stable 的大部分判断由 assembler 负责
- surface 不做复杂的 markdown 语义推理

## AGUI 组件与内建渲染器

V1 不把“工具调用卡片”写死成单一 block type，而是把它视作某个 renderer 的实现。

V1 建议内建 renderer：

- `markdown`
- `text`
- `code`
- `html`
- `table`
- `mermaid`
- `math`
- `thought`
- `artifact`
- `approval`
- `raw`
- `widget`

说明：

- `tool` 不作为必须写死的核心 block type
- `RunSurface` 默认提供一个可覆盖的 `tool` renderer，方便用户在未注册业务组件前先跑通完整链路
- 自定义工具调用组件本质上是一个自定义 renderer
- `timeline` 不作为 V1 主路径能力，只作为未来可选调试或插件视图

## Intent 设计

`Intent` 表示结构化交互动作，例如：

- `approval.submit`
- `tool.retry`
- `artifact.open`
- `message.feedback`

V1 约束：

- `type` 是开放字符串
- `nodeId / blockId` 都保持可选
- intent 会被 runtime 记录
- intent 默认只上抛，不直接修改运行态

## 性能设计

V1 默认内建以下性能策略：

- `Bridge batching`
  - 浏览器默认 `animation-frame`
  - 非浏览器默认 `microtask`
  - `stream.delta` 按 `streamId` 合并
- `Single draft tail`
  - 高频更新只作用在尾部一个草稿 block 上
- `Stable block freezing`
  - 已稳定 block 尽量不再 patch
- `Long text slabization`
  - 超长文本按片段冻结，并共享 `groupId`
- `Heavy block lazy mount`
  - Mermaid、复杂代码块、大卡片进入视口后再挂载
- `Virtualization`
  - 长会话按 block 或 group 级虚拟列表渲染
- `Optimized text renderer`
  - 文本渲染保留接入 `@chenglou/pretext` 的能力

## 包结构

- `@agentdown/core`
  - runtime
  - bridge
  - protocol
  - command types
  - core models
- `@agentdown/transports`
  - sse
  - ndjson
  - websocket
  - async-iterable
- `@agentdown/assemblers`
  - markdown
  - plain-text
- `@agentdown/vue`
  - RunSurface
  - renderer registry
  - composables
- `@agentdown/presets`
  - agno
  - langgraph
  - ai-sdk

## 典型接入方式

V1 开发者的接入心智模型应当尽量简单：

1. 选择一个 transport
2. 定义原始事件到命令的映射规则
3. 给文本流配置对应 assembler
4. 用 `RunSurface` 渲染所有 block
5. 通过 renderer 注册业务组件

这意味着：

```text
任意后端流 -> mapping rules -> runtime commands -> Agentdown 自动渲染
```

而不是：

```text
任意后端流 -> 开发者自己维护一套前端状态机和消息组件
```

## 典型场景

以“查询天气”为例，一个常见后端过程是：

- 返回一段流式说明文本
- 发出工具调用开始事件
- 工具运行中不断补充数据
- 工具结束并返回结构化结果

在 V1 中，它应当被映射为：

- 文本 token -> `stream.*`
- 工具开始 -> `node.upsert + block.upsert(renderer: 'tool.weather')`
- 工具更新 -> `node.patch / block.patch`
- 工具结束 -> 更新同一张卡片的结果数据
- 用户点击卡片操作 -> `intent`

这样最终获得的是：

- 对话文本自然流出
- 工具 UI 卡片自然插入消息流
- 卡片状态实时更新
- 用户还能继续交互

## 非目标

以下内容不属于 V1 主目标：

- 固定某一种后端标准事件协议
- timeline 作为核心主界面
- protocol 直接读取 runtime
- 可视化规则编辑器
- React / Svelte 官方渲染层
- 完整 devtools 产品化
- workflow builder

这些内容都可以放在 V2 以后继续演进。

## V1 最终定义

**Agentdown V1 = 一个协议无关、流式优先、支持 Markdown 稳定化和 AGUI 组件化的 Vue Agent UI Runtime。**

它的核心不是“渲染 markdown”，而是：

**把任意 Agent 后端的流式输出，变成可交互、可组合、可持续更新、性能可控的前端界面。**
