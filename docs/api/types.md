---
title: 核心类型
description: Agentdown 当前最值得优先掌握的 TypeScript 类型。
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
  | MarkdownAguiBlock;
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

## AGUI 相关

### `AguiComponentMap`

```ts
type AguiComponentMap = Record<string, Component | AguiComponentRegistration>;
```

其中完整注册对象长这样：

```ts
interface AguiComponentRegistration {
  component: Component;
  minHeight?: number;
}
```

### `AgentNodeState`

```ts
interface AgentNodeState {
  id: string;
  kind: AguiNodeKind;
  status: AguiNodeStatus;
  title: string;
  parentId?: string;
  message?: string;
  toolName?: string;
  startedAt?: number;
  endedAt?: number;
  childrenIds: string[];
  meta: Record<string, unknown>;
}
```

### `AguiNodeKind`

```ts
type AguiNodeKind = 'run' | 'user' | 'leader' | 'agent' | 'tool' | 'system';
```

### `AguiNodeStatus`

```ts
type AguiNodeStatus =
  | 'idle'
  | 'thinking'
  | 'assigned'
  | 'running'
  | 'waiting_tool'
  | 'done'
  | 'error';
```

### `AguiRuntimeEvent`

```ts
interface AguiRuntimeEvent {
  type: string;
  nodeId: string;
  parentId?: string;
  kind?: AguiNodeKind;
  title?: string;
  message?: string;
  toolName?: string;
  meta?: Record<string, unknown>;
  at?: number;
}
```

这是所有事件的基础形态。  
核心 events helpers 只是基于这个接口进一步补了更精确的字段。

### `AguiBinding`

```ts
interface AguiBinding<TState = unknown, TEvent = AguiRuntimeEvent> {
  id: string;
  stateRef: Readonly<ShallowRef<TState | null>>;
  childrenRef: Readonly<ComputedRef<TState[]>>;
  eventsRef: Readonly<ShallowRef<TEvent[]>>;
}
```

它是 runtime 和组件之间真正的“桥”。

### `AguiRuntime`

```ts
interface AguiRuntime {
  ref(id): Readonly<ShallowRef<TState | null>>;
  binding(id): AguiBinding<TState, TEvent>;
  set(id, value): void;
  patch(id, patch): void;
  emit(event): void;
  children(parentId): Readonly<ComputedRef<TState[]>>;
  events(id?): Readonly<ShallowRef<AguiRuntimeEvent[]>>;
  reset(): void;
}
```

## reducer 相关

### `AguiRuntimeReducerContext`

```ts
interface AguiRuntimeReducerContext {
  event: AguiRuntimeEvent;
  at: number;
  previousState: AgentNodeState | null;
  defaultPatch: Readonly<AguiNodePatch>;
}
```

### `AguiRuntimeReducerResult`

```ts
interface AguiRuntimeReducerResult {
  patch?: AguiNodePatch;
  replaceDefault?: boolean;
}
```

## 一条使用建议

如果你希望组件内的类型体验更顺手，最推荐的组合通常是：

```ts
const state = useAguiState<AgentNodeState>();
const children = useAguiChildren<AgentNodeState>();
```

这样你在模板和计算属性里都会拿到非常直接的类型提示。
