---
title: AGUI Runtime 概览
description: 理解 Agentdown runtime 的角色、节点模型、ref 绑定和 hooks 设计。
---

# AGUI Runtime 概览

在 Agentdown 里：

- markdown 负责叙事层
- runtime 负责状态层

它们不是竞争关系，而是两层互补。

## 你可以把 runtime 想成什么

你可以把它想成一个非常轻量的、面向 agent UI 的事件总线 + 状态归约器：

1. 你通过 `runtime.emit(event)` 推入事件
2. runtime 记录事件流
3. runtime 把事件归约成节点状态
4. AGUI 组件通过 `ref` 绑定到节点
5. 组件内部再用 hooks 读取状态、子节点和事件

## 默认节点模型

当前 runtime 的默认节点类型：

- `run`
- `user`
- `leader`
- `agent`
- `tool`
- `system`

当前默认状态：

- `idle`
- `assigned`
- `thinking`
- `running`
- `waiting_tool`
- `done`
- `error`

## `ref` 是怎么工作的

当 markdown 里出现：

```md
:::vue-component DemoRunBoard {"ref":"run:pricing"}
```

默认 AGUI wrapper 会做两件事：

1. 读出 `ref = "run:pricing"`
2. 调用 `runtime.binding('run:pricing')`

于是这个组件就拿到了：

- 当前节点状态
- 当前节点子节点
- 当前节点事件流

## hooks 为什么简单

组件内部最推荐的读法是：

```ts
const state = useAguiState<AgentNodeState>();
const children = useAguiChildren<AgentNodeState>();
const events = useAguiEvents();
```

你不需要自己手动传 store，也不需要自己在组件树里逐层传 runtime。  
这是因为 wrapper 已经把上下文提供好了。

## 会重新渲染，还是只是更新 prop

大多数情况下是“同一个组件实例继续存在，但里面读取到的响应式值发生变化”。

也就是：

- runtime 里的 `stateRef / eventsRef / childrenRef` 会更新
- 使用 hooks 的组件会响应式刷新
- 不会因为一次普通事件就整块强制卸载重建

只有你自己修改了组件 `key`、条件渲染、或切换到另一个 AGUI 组件名时，实例才会真正换掉。

## 同一个 `ref` 能不能复用

可以，而且这是有意支持的语义。  
如果两个组件使用同一个 `ref`，它们会共享同一份 runtime binding。

这适合：

- 主视图 + 侧边栏都看同一个节点
- 列表视图 + 详情视图同步展示
- 一个 run 的多个镜像 UI

在开发环境里，如果出现重复 `ref`，Agentdown 会给出提示，帮助你确认这是有意共享，而不是误写。

## inject 会不会污染到另一个组件树

不会。  
`provide/inject` 只会读取“最近的 AGUI wrapper”提供的上下文，所以多个节点、多个组件树同时存在时不会互相串值。

真正会共享的是“相同 runtime 下、相同 ref 的绑定”，这属于数据层共享，不是注入污染。

## 什么时候只用 markdown，什么时候一定要 runtime

### 只用 markdown 就够

- 静态文档
- 单次输出展示
- 没有运行态状态切换

### runtime 非常值得接

- 工具调用状态
- 多 agent 分工
- approval / handoff / artifact
- 想在一个页面里同时展示 run board、timeline、detail card

继续看 [协议与事件](/runtime/protocol) 会更容易把 runtime 真正用起来。
