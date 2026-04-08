---
title: 框架能力矩阵
description: 对比 Agno、LangChain、AutoGen、CrewAI 在 Agentdown 里的默认能力边界。
---

# 框架能力矩阵

这页只回答一个问题：

什么框架，默认最适合拿来做什么。

## 默认支持范围

| 框架 | 官方事件直连 | 流式文本 | 工具卡片 | 非 UI side effect | 内置操作审批 | 推荐场景 |
| --- | --- | --- | --- | --- | --- | --- |
| Agno | 支持 | 支持 | 支持 | 支持 | 支持 | requirement、approval、工具确认 |
| LangChain | 支持 | 支持 | 支持 | 支持 | 支持 | LangGraph interrupt、人工审阅、参数修改 |
| AutoGen | 支持 | 支持 | 支持 | 支持 | 支持 | handoff、人工接力、继续对话 |
| CrewAI | 支持 | 支持 | 支持 | 支持 | 不默认提供 | 真实 SSE chunk、工具展示、最终 `CrewOutput` 渲染 |

## 怎么理解 “不默认提供”

以 CrewAI 为例：

- Agentdown 会直接消费它的官方 SSE chunk
- 会把文本流、工具调用、最终 `CrewOutput` 正常渲染出来
- 但不会默认把某些 review / Flow feedback 事件自动升级成 approval UI

原因不是前端做不到，而是当前官方能力更适合先作为“真实流式输出适配层”来接入，而不是主打“操作级审批”。

## 选型建议

如果你最在意的是：

- 工具调用前审批：优先 `Agno`、`LangChain`
- 人工接力与 handoff：优先 `AutoGen`
- 先把真实文本流和工具卡片快速接上：`CrewAI` 也很合适

## 对应前端入口

| 框架 | 最推荐入口 |
| --- | --- |
| Agno | `useAgnoChatSession()` |
| LangChain | `useLangChainChatSession()` |
| AutoGen | `useAutoGenChatSession()` |
| CrewAI | `useCrewAIChatSession()` |
