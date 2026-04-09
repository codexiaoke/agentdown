---
title: 官方适配器 API
description: Agno、LangChain、AutoGen、CrewAI 适配层的共同模式和主要导出。
---

# 官方适配器 API

四套官方适配器遵循同一套模式。

## 共同层次

| 层次 | 作用 |
| --- | --- |
| `use*ChatSession()` | 页面层最短入口 |
| `create*Adapter()` | starter adapter |
| `create*Protocol()` | 底层协议映射 |
| `create*SseTransport()` | 更贴近对应后端请求习惯的 SSE transport |
| `define*ToolComponents()` | 工具名 -> 组件 |
| `define*EventComponents()` | 事件名 -> 组件 |
| `define*EventActions()` | 事件名 -> side effect |

## 当前四套适配器

### Agno

- `useAgnoChatSession()`
- `createAgnoAdapter()`
- `createAgnoProtocol()`
- `createAgnoSseTransport()`
- `defineAgnoToolComponents()`
- `defineAgnoEventComponents()`
- `defineAgnoEventActions()`

### LangChain

- `useLangChainChatSession()`
- `createLangChainAdapter()`
- `createLangChainProtocol()`
- `createLangChainSseTransport()`
- `defineLangChainToolComponents()`
- `defineLangChainEventComponents()`
- `defineLangChainEventActions()`

### AutoGen

- `useAutoGenChatSession()`
- `createAutoGenAdapter()`
- `createAutoGenProtocol()`
- `createAutoGenSseTransport()`
- `defineAutoGenToolComponents()`
- `defineAutoGenEventComponents()`
- `defineAutoGenEventActions()`

### CrewAI

- `useCrewAIChatSession()`
- `createCrewAIAdapter()`
- `createCrewAIProtocol()`
- `createCrewAISseTransport()`
- `defineCrewAIToolComponents()`
- `defineCrewAIEventComponents()`
- `defineCrewAIEventActions()`
- `parseCrewAISseMessage()`

## 共享 helper

如果你想跨框架复用规则，还可以直接用：

- `toolByName()`
- `eventToBlock()`
- `eventToAction()`

## 什么时候用 `useAgentChat()`

如果你已经决定在项目里继续抽象一层“统一框架入口”，再用 `useAgentChat()`。

如果只是接某一个真实框架，优先直接用各自的 `use*ChatSession()`，类型和心智都更直观。
