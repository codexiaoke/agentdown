---
title: FAQ
description: 回答 Agentdown 当前最常见的接入、适配、性能和运行时问题。
---

# FAQ

## 后端事件一定要符合 Agentdown 规定的格式吗

不需要。  
Agentdown 的重点就是让你自己定义映射规则。

如果后端是自定义协议，用：

- `defineEventProtocol()`
- `defineProtocol()`
- `defineHelperProtocol()`

如果后端是主流框架，用：

- 官方 adapter / preset

## 官方 adapter 会不会把用户锁死在固定协议里

不会。  
官方 adapter 的目标是直接消费官方事件，不是把后端统一成 Agentdown 私有协议。

你仍然可以：

- 改 `protocolOptions`
- 改 `surface`
- 用 `composeProtocols()` 叠加额外协议
- 完全自己写 protocol

## `content.append`、`tool.finish`、`artifact.upsert` 这些事件名必须这样写吗

不必须。  
这些只是推荐的语义 helper 名，不是后端必须遵守的格式。

## 自定义组件怎么拿到运行中的值

最推荐的方式是把值放到 `block.data`、`tool.result` 或其他结构化字段里。

也就是说：

1. 协议层把原始事件映射成 `cmd.block.*()` / `cmd.tool.*()`
2. runtime 保存结构化数据
3. 组件根据 `renderer` 被渲染出来
4. 组件直接读取当前 block 的 `data`

## 为什么 loading 只应该在没内容前显示

这正是 `draftPlaceholder` 的作用。  
它只会在“当前消息块还没有任何可见内容”时显示占位；一旦出现真实内容，就应该自动让位。

## 流式 token 如果刚好是一半 table / code block 怎么办

这是 assembler 要解决的问题。  
Agentdown 不要求每个 token 一到就立刻渲染成正式 markdown，而是会先保留在 draft，等结构稳定后再进入 stable block。

## 工具调用一定要写成 markdown 吗

不是。  
工具调用更推荐直接渲染成独立 block 或 tool block，再配合 Vue 组件显示。

## 用户消息也能是 block 吗

可以。  
用户消息不一定只是纯文本，也可以是：

- 文件卡片
- 引用块
- 结构化内容

本质上还是 block，只是 role 是 `user`。

## 我能完全替换内置组件吗

可以。  
你可以覆写：

- `builtinComponents`
- `renderers`
- `messageShells`

也可以继续注入：

- `:::vue-component`

## 大文本和大组件一起渲染会不会卡

有风险，所以 Agentdown 默认内置了这几条性能策略：

- pretext 文本主链
- draft/stable 稳定化
- `textSlabChars`
- `virtualize`
- `groupWindow`
- `lazyMount`

## 为什么性能实验里的 JS Heap 会变来变去

因为浏览器本身会受这些因素影响：

- GC 回收
- 当前滚动位置
- DevTools 是否打开
- Mermaid / 高亮 / 图片等资源的创建和释放

所以更重要的是看趋势和多次采样中位数，而不是一次瞬时值。

## 如果后端是 Agno、LangChain 这些，还需要统一后端协议吗

不建议。  
现在更推荐的方向就是：

- 后端保持官方事件
- 前端直接适配官方事件

这样对用户接入最省心，也更容易对照官方文档调试。

## 当前最推荐先看哪几页

- [快速开始](/guide/getting-started)
- [官方框架适配](/guide/framework-adapters)
- [性能优化](/guide/performance)
- [协议映射](/runtime/protocol)
