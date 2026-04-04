---
title: Runtime 概览
description: 理解 Agentdown 当前的 Protocol、Bridge、Assembler、Runtime 分层与核心数据模型。
---

# Runtime 概览

在 Agentdown 里：

- markdown 负责叙事层
- `Protocol + Bridge + Assembler + Runtime` 负责交互层

它们不是竞争关系，而是两层互补。

## 主链路

```text
raw packet -> protocol -> bridge -> assembler -> runtime -> your UI
```

每一层的职责都尽量单一：

- `Protocol`: 把任意后端包映射成 `RuntimeCommand[]`
- `Bridge`: 调度协议映射、stream assembler 和批量 flush
- `Assembler`: 把 token 流组装成更稳定的 block 更新
- `Runtime`: 保存同步、可重放的状态
- `Your UI`: 用 `snapshot()` 和 `subscribe()` 渲染成聊天界面、卡片区或自定义 Surface

## Runtime 里到底存什么

当前 `createAgentRuntime()` 维护 4 类核心数据：

### 1. `nodes`

`nodes` 表示运行态实体，比如 `run`、`agent`、`tool`、`approval`。

常见字段：

- `id`
- `type`
- `status`
- `parentId`
- `title`
- `data`

### 2. `blocks`

`blocks` 表示最终渲染层要消费的 UI 片段，比如：

- 一段 assistant 文本
- 一个工具卡片
- 一个 artifact 卡片
- 一个 approval 交互块

常见字段：

- `slot`
- `type`
- `renderer`
- `state`
- `nodeId`
- `groupId`
- `content`
- `data`

### 3. `intents`

`intents` 是结构化 UI 动作记录，用于把“用户在界面里的交互”也纳入统一模型。

当前 runtime 默认只记录它，不自动修改其他状态。

### 4. `history`

`history` 会记录命令和 intent，方便调试、回放和后续可视化。

## 为什么 block 要有 `draft` / `stable`

这是为了处理流式输出的用户体验。

- `draft`: 当前还在持续增长，通常用于“正在输出中”的尾部内容
- `stable`: 当前内容已经稳定，可以安全渲染复杂结构

比如 markdown table、代码块、Mermaid、公式，都不适合在结构未闭合前就提前渲染。

## UI 层怎么接入 runtime

最直接的方式是：

1. 初次渲染时读取 `runtime.snapshot()`
2. 通过 `runtime.subscribe(listener)` 监听变化
3. 在 UI 里按 `slot`、`groupId`、`renderer` 自己分发组件

当前 demo 里的聊天式天气示例就是这样做的。

## 什么时候只用 MarkdownRenderer

- 静态文档
- 只展示一次性内容
- 不需要后端流式更新

## 什么时候一定要接 Runtime

- 工具调用状态要持续更新
- 需要把纯文本和大组件混排
- 需要 approval / artifact / custom widget
- 想保留后续 replay、debug、grouping 的空间

继续看 [协议映射](/runtime/protocol) 会更容易把后端事件真正接进来。
