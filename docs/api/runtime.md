---
title: Runtime 与 Hooks
description: createAguiRuntime、AguiRuntime 实例方法与常用 hooks 说明。
---

# Runtime 与 Hooks

## `createAguiRuntime()`

```ts
const runtime = createAguiRuntime(options?)
```

### 参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `reducer` | `AguiRuntimeReducer` | 自定义事件归约器，用来扩展或覆盖默认状态映射 |

## `AguiRuntime` 实例方法

| 方法 | 说明 |
| --- | --- |
| `ref(id)` | 获取某个节点的只读状态 ref |
| `binding(id)` | 一次性拿到状态、子节点和事件的 binding |
| `set(id, value)` | 直接写入完整状态 |
| `patch(id, patch)` | 以浅合并方式更新状态 |
| `emit(event)` | 推入一个事件，并触发归约 |
| `children(parentId)` | 获取某个父节点的响应式子节点列表 |
| `events(id?)` | 获取全局事件流或某个节点的事件流 |
| `reset()` | 清空当前 runtime 保存的状态、关系和事件 |

## 常用 hooks

| Hook | 返回值 | 用途 |
| --- | --- | --- |
| `useAguiNode()` | 完整 AGUI 上下文 | 需要一次性拿全部信息时 |
| `useAguiNodeId()` | 当前节点 id | 只关心自己是谁 |
| `useAguiRuntime()` | 当前 runtime | 需要读全局事件或其他节点 |
| `useAguiBinding()` | 当前节点 binding | 想直接拿 `stateRef / childrenRef / eventsRef` |
| `useAguiState()` | 当前节点状态 | 最常用 |
| `useAguiChildren()` | 当前节点子节点数组 | team mode、run board 很常用 |
| `useAguiEvents()` | 当前节点事件流 | timeline、recent signals 很常用 |
| `useAguiHasNode()` | 是否拿到 AGUI 上下文 | 让组件能在普通页面安全复用 |

## 一个常见组件写法

```ts
import { computed } from 'vue';
import { useAguiChildren, useAguiEvents, useAguiState, type AgentNodeState } from '@codexiaoke/agentdown';

const state = useAguiState<AgentNodeState>();
const children = useAguiChildren<AgentNodeState>();
const events = useAguiEvents();

const activeChildren = computed(() =>
  children.value.filter((node) => node.status === 'running' || node.status === 'thinking')
);
```

## `useAguiRuntime()` 什么时候最有用

当你在一个组件里不仅想看“自己这个节点”，还想看：

- 全局事件流
- 某个兄弟节点
- 某个孙节点
- 当前 run 下面的整棵树

这时就可以结合 `runtime.children(id)`、`runtime.events()` 自己做派生计算。

## `set()` 和 `patch()` 什么时候用

### 推荐优先使用 `emit()`

因为 `emit()` 会同时留下事件记录，并且自动维护默认状态语义。

### `set()` / `patch()` 更适合

- 初始化某些本地状态
- 做临时演示数据
- 对非事件型数据做直接同步

如果你的页面需要回放、审计、timeline，优先用事件而不是直接 patch。
