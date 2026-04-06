---
title: Runtime 概览
description: 理解 Agentdown 的 Protocol、Bridge、Assembler、Runtime、Preset 和 Surface 分层。
---

# Runtime 概览

在 Agentdown 里：

- `MarkdownRenderer` 负责叙事层
- `Protocol + Bridge + Assembler + Runtime + RunSurface` 负责交互层

它们不是二选一，而是按场景组合使用。

## 主链路

```text
raw packet -> protocol -> bridge -> assembler -> runtime -> surface
```

每层职责尽量单一：

- `Protocol`
  把原始事件映射成 `RuntimeCommand[]`
- `Bridge`
  调度协议执行、stream assembler 和批量 flush
- `Assembler`
  把 token 流组装成更稳定的 block 更新
- `Runtime`
  保存同步、可订阅、可回放的运行态
- `Surface`
  把 runtime 中的 block 渲染成聊天界面或 AGUI

## Runtime 里到底存什么

`createAgentRuntime()` 当前维护四类核心数据：

### `nodes`

表示运行态实体，例如：

- `run`
- `tool`
- `approval`
- `artifact`

常见字段：

- `id`
- `type`
- `status`
- `parentId`
- `title`
- `data`

### `blocks`

表示最终会被 UI 渲染的单元，例如：

- 一段 assistant 消息
- 一张工具卡片
- 一个 artifact 卡片
- 一个 approval 组件

常见字段：

- `slot`
- `type`
- `renderer`
- `state`
- `nodeId`
- `groupId`
- `content`
- `data`

### `intents`

表示结构化 UI 交互意图。  
这让“界面中的动作”也能进入统一模型。

### `history`

记录命令和 intent，方便：

- 调试
- transcript 导出导入
- replay

## 为什么有 `draft`、`stable` 和 `settled`

这是流式体验的关键。

- `draft`
  当前内容还在增长，适合做流式草稿
- `stable`
  当前结构已经稳定，适合渲染复杂 markdown 和正式组件
- `settled`
  当前 block 已经最终完成，后续不会再变化

这能避免半截 table、半截 code fence、半截公式直接闪到页面上。

## `preset` 在链路里的作用

`defineAgentdownPreset()` 和官方 `defineAgnoPreset()` 这类 helper，本质上是把一套常用配置打包起来：

- protocol
- assembler
- bridge 默认配置
- surface 默认配置

所以 preset 的作用不是“替你做所有逻辑”，而是把重复配置收敛掉。

## 推荐的三种使用层级

### 1. 只用 `MarkdownRenderer`

适合：

- 静态文档
- 一次性 markdown 结果展示

### 2. 自己写 protocol

适合：

- 自定义 SSE / JSON 协议
- 你希望自己控制每种事件如何映射

### 3. 使用官方框架接入层

适合：

- Agno
- LangChain
- AutoGen
- CrewAI

这时通常直接用：

- 聊天页面：`useAgnoChatSession()` / `useLangChainChatSession()` / `useAutoGenChatSession()` / `useCrewAIChatSession()`
- starter 控制层：`createAgnoAdapter()` / `createLangChainAdapter()` / `createAutoGenAdapter()` / `createCrewAIAdapter()`
- 更底层时，再继续往 `create*Protocol()` / `define*Preset()` 走

## Surface 为什么不直接塞进 Runtime

Runtime 只保存状态，不关心你最后要渲染成：

- 聊天气泡
- timeline
- 左右分栏
- 工具区 + 内容区
- 自定义 AGUI 页面

`RunSurface` 是默认实现，但不是唯一实现。

## 下一步看什么

- 想看事件如何映射：看 [协议映射](/runtime/protocol)
- 想看官方框架怎么接：看 [官方框架适配](/guide/framework-adapters)
- 想看默认聊天界面：看 [RunSurface](/api/run-surface)
