---
title: 核心类型
description: Agentdown 当前最值得优先掌握的 Markdown、Runtime、Protocol 和 Stream 类型。
---

# 核心类型

如果你在 Vue 3 + TypeScript 项目里接 Agentdown，这一页的类型通常最值得优先了解。

## Markdown 相关

### `MarkdownBlock`

```ts
type MarkdownBlock =
  | MarkdownTextBlock
  | MarkdownHtmlBlock
  | MarkdownCodeBlock
  | MarkdownMermaidBlock
  | MarkdownThoughtBlock
  | MarkdownMathBlock
  | MarkdownAguiBlock
  | MarkdownArtifactBlock
  | MarkdownApprovalBlock
  | MarkdownTimelineBlock;
```

它是 `parseMarkdown()` 的输出核心，也是 `MarkdownBlockList` 分发组件的依据。

### `MarkdownBuiltinComponents`

```ts
interface MarkdownBuiltinComponents {
  text: Component;
  code: Component;
  mermaid: Component;
  math: Component;
  thought: Component;
  html: Component;
  agui: Component;
  artifact: Component;
  approval: Component;
  timeline: Component;
}
```

### `MarkdownBuiltinComponentOverrides`

```ts
type MarkdownBuiltinComponentOverrides = Partial<MarkdownBuiltinComponents>;
```

这是你最常用的覆写入口。

### `ParseMarkdownOptions`

```ts
interface ParseMarkdownOptions {
  plugins?: MarkdownEnginePlugin[];
  thoughtTitle?: string;
  aguiComponents?: AguiComponentMap;
}
```

## Runtime 相关

### `RuntimeNode`

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

### `SurfaceBlock`

```ts
interface SurfaceBlock<TData = Record<string, unknown>> {
  id: string
  slot: string
  type: string
  renderer: string
  state: 'draft' | 'stable' | 'settled'
  nodeId?: string | null
  groupId?: string | null
  content?: string
  data: TData
  createdAt?: number
  updatedAt?: number
}
```

### `SurfaceBlockStreamingDraftData`

```ts
interface SurfaceBlockStreamingDraftData {
  streamingDraftMode?: 'text' | 'preview' | 'hidden'
  streamingDraftKind?: 'blank' | 'line' | 'paragraph' | 'blockquote' | 'list' | 'table' | 'fence' | 'math' | 'thought' | 'directive' | 'setext-heading' | 'html'
  streamingDraftStability?: 'line-stable' | 'separator-stable' | 'candidate-stable' | 'close-stable'
  streamingDraftMultiline?: boolean
}
```

这个类型描述 markdown assembler 在 draft block 上补充的结构化尾部信息。
如果你要根据正在流式输出的语法类型去切换 UI，这是最直接的入口。

### `RuntimeIntent`

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

### `RuntimeCommand`

```ts
type RuntimeCommand =
  | { type: 'node.upsert'; node: RuntimeNode }
  | { type: 'node.patch'; id: string; patch: Partial<RuntimeNode> }
  | { type: 'node.remove'; id: string }
  | { type: 'block.insert'; block: SurfaceBlock; beforeId?: string; afterId?: string }
  | { type: 'block.upsert'; block: SurfaceBlock }
  | { type: 'block.patch'; id: string; patch: Partial<SurfaceBlock> }
  | { type: 'block.remove'; id: string }
  | { type: 'stream.open'; streamId: string; slot: string; assembler: string }
  | { type: 'stream.delta'; streamId: string; text: string }
  | { type: 'stream.close'; streamId: string }
  | { type: 'stream.abort'; streamId: string; reason?: string }
  | { type: 'event.record'; event: Record<string, unknown> }
```

### `AgentRuntime`

```ts
interface AgentRuntime {
  apply(commands: RuntimeCommand | RuntimeCommand[]): void
  node(id: string): RuntimeNode | undefined
  nodes(): RuntimeNode[]
  block(id: string): SurfaceBlock | undefined
  blocks(slot?: string): SurfaceBlock[]
  children(nodeId: string): RuntimeNode[]
  intents(): RuntimeIntent[]
  history(): RuntimeHistoryEntry[]
  emitIntent(intent: Omit<RuntimeIntent, 'id' | 'at'>): RuntimeIntent
  snapshot(): RuntimeSnapshot
  subscribe(listener: () => void): () => void
  reset(): void
}
```

## Protocol 相关

### `ProtocolContext`

```ts
interface ProtocolContext {
  now(): number
  makeId(prefix?: string): string
}
```

### `ProtocolRule`

```ts
interface ProtocolRule<TRawEvent> {
  name?: string
  match: (event: TRawEvent, context: ProtocolContext) => boolean
  map: (input: {
    event: TRawEvent
    context: ProtocolContext
  }) => RuntimeCommand | RuntimeCommand[] | null | void
}
```

### `RuntimeProtocol`

```ts
interface RuntimeProtocol<TRawPacket = unknown> {
  map(input: {
    packet: TRawPacket
    context: ProtocolContext
  }): RuntimeCommand | RuntimeCommand[] | null | void
  reset?(): void
}
```

`reset()` 是可选的。
如果你的 protocol 内部会保存流式映射状态，bridge 在 `reset()` / `close()` 时会自动调用它。

## Stream 相关

### `StreamAssembler`

```ts
interface StreamAssembler {
  open(command: StreamOpenCommand, context: AssemblerContext): RuntimeCommand | RuntimeCommand[] | null | void
  delta(command: StreamDeltaCommand, context: AssemblerContext): RuntimeCommand | RuntimeCommand[] | null | void
  close(command: StreamCloseCommand, context: AssemblerContext): RuntimeCommand | RuntimeCommand[] | null | void
  abort?(command: StreamAbortCommand, context: AssemblerContext): RuntimeCommand | RuntimeCommand[] | null | void
  reset?(): void
}
```

## 组件注入相关

### `AguiComponentMap`

```ts
type AguiComponentMap = Record<string, Component | AguiComponentRegistration>
```

### `AguiComponentRegistration`

```ts
interface AguiComponentRegistration {
  component: Component
  minHeight?: number
}
```

## RunSurface 相关

### `RunSurfaceOptions`

```ts
interface RunSurfaceOptions {
  slot?: string
  lineHeight?: number
  font?: string
  emptyText?: string
  performance?: RunSurfacePerformanceOptions
  aguiComponents?: AguiComponentMap
  builtinComponents?: MarkdownBuiltinComponentOverrides
  renderers?: RunSurfaceRendererMap
  draftPlaceholder?: RunSurfaceDraftPlaceholder
  messageShells?: RunSurfaceMessageShellMap
}
```

### `RunSurfacePerformanceOptions`

```ts
interface RunSurfacePerformanceOptions {
  groupWindow?: number | false
  groupWindowStep?: number
  lazyMount?: boolean
  lazyMountMargin?: string
  textSlabChars?: number
}
```
