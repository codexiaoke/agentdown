---
title: 核心概念
description: 理解 Agentdown 的 runtime、block、协议和流式稳定化。
---

# 核心概念

Agentdown 的目标不是“再做一个 markdown 解析器”，而是把 Agent 的流式输出接成一条稳定的 UI 渲染链。

## 整体链路

```text
raw packet / SSE
  -> protocol
  -> bridge
  -> assembler
  -> runtime
  -> RunSurface / MarkdownRenderer
```

每一层各做一件事：

| 层 | 作用 |
| --- | --- |
| `raw packet / SSE` | 后端原始事件，例如 token、tool call、artifact、approval、handoff |
| `protocol` | 把原始事件翻译成 `RuntimeCommand[]` |
| `bridge` | 顺序消费事件、驱动 assembler、把命令应用到 runtime |
| `assembler` | 负责流式文本稳定化，例如 markdown draft -> stable |
| `runtime` | 保存 nodes、blocks、messages、history 等运行态状态 |
| `RunSurface` | 把 runtime 里的 block 渲染成聊天界面或工作流界面 |

## 两个核心实体

### `node`

`node` 更像运行态实体。

常见例子：

- 一个 run
- 一个 tool call
- 一个 artifact
- 一个 approval
- 一个 handoff

它更适合表达“这个东西正在运行、已完成、失败、被拒绝”。

### `block`

`block` 是最终渲染单元。

常见例子：

- 一段文本
- 一个工具卡片
- 一个 artifact 卡片
- 一个 approval 卡片
- 一个 handoff 卡片

一个 message 里可以有很多 block，一个 turn 里也可以有很多 block。

## 聊天语义 id

为了让聊天 UI 稳定，Agentdown 会尽量给 block 带上这些语义字段：

- `conversationId`
- `turnId`
- `messageId`
- `groupId`

最常见的理解方式是：

| 字段 | 用途 |
| --- | --- |
| `conversationId` | 整个会话 |
| `turnId` | 一问一答中的这一轮 |
| `messageId` | 某条用户消息或助手消息 |
| `groupId` | surface 渲染时的一组 block |

## draft 和 stable

Agent 的输出是流式的，但 UI 不应该把半截 markdown 直接渲染出来。

所以 Agentdown 会把很多流式内容先当成 draft：

- 表格表头没闭合，不渲染正式 table
- fenced code block 没闭合，不渲染正式 code block
- 某些 HTML / markdown 结构没稳定，不提前落成最终 block

等结构足够稳定后，再进入 stable。

## 你应该用哪个入口

### 只想渲染内容

用 `MarkdownRenderer`。

### 已经有 runtime

用 `RunSurface`。

### 接官方框架

优先用：

- `useAgnoChatSession()`
- `useLangChainChatSession()`
- `useAutoGenChatSession()`
- `useCrewAIChatSession()`

### 接你自己的 SSE / JSON 后端

优先用：

- `defineEventProtocol()`
- `useSseBridge()`

## 一个原则

Agentdown 不要求你的后端变成“Agentdown 后端”。

它只做一件事：

把任意后端事件，稳定地翻译成可交互 UI。
