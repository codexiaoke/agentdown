---
title: FAQ
description: 回答 Agentdown 当前最常见的接入问题和运行时疑问。
---

# FAQ

## 组件状态变化时，是重新渲染还是只更新 props

大多数情况下是同一个组件实例继续存在，只是它读取到的响应式值更新了。  
因为 runtime 内部是 `ref / computed` 驱动的，所以组件只会随着依赖变化刷新，而不会每次都整块重建。

## 多个组件使用同一个 `ref` 会不会污染

不会“污染”，但会“共享”。  
同一个 runtime 下，如果多个组件使用相同的 `ref`，它们会拿到同一份 binding。这很适合做主视图和侧边栏镜像展示。

如果你不想共享，就给它们不同的 `ref`。

## `inject(AGUI_NODE_CONTEXT_KEY, null)` 会不会在多个组件树同时存在时串值

不会。  
Vue 的 `provide/inject` 只会读取最近的 provider，所以每个 AGUI wrapper 都只会影响自己的子树。

## 为什么默认样式不直接给 AGUI 卡片加很重的边框和背景

因为 Agentdown 的定位是 runtime + protocol + renderer，不是强绑定某一种产品视觉。  
默认样式应该尽量保证可用，但把“最终长什么样”留给用户自己的 Design System。

## 我能完全替换内置组件吗

可以。  
`text / code / mermaid / thought / math / html / agui` 都可以覆写。

## `applyEvent` 是不是公开 API

不是。  
它是 runtime 内部把事件归约成状态的实现函数，对外 API 是 `runtime.emit(event)`。

## 用户能不能自定义事件

可以。  
`runtime.emit()` 接受任意 `AguiRuntimeEvent`，你只需要保证事件对象里至少有 `type` 和 `nodeId`。

## 为什么 `agent.blocked` 默认不直接变成 `waiting_tool`

因为“blocked” 背后的业务原因太多了：等工具、等审批、等人工、等并行分支都可能成立。  
首版更稳妥的做法是给你标准事件，再让 reducer 决定如何映射到状态。

## 表格、图片、复杂富文本怎么处理

当前优先走增强型 HTML 渲染：

- 图片支持预览
- 表格支持横向滚动
- 链接和图片在表格单元格里也能工作

## Mermaid 支持到什么程度

当前默认支持：

- 代码块渲染 Mermaid
- 点击进入全屏预览
- 全屏拖拽
- 鼠标滚轮缩放
- 重置缩放

## 当前最值得优先补的能力是什么

如果你准备把 Agentdown 用到真实产品里，最值得优先补的是：

- 自动化测试
- replay / timeline
- artifact / approval 的标准展示协议
- 更完整的示例和最佳实践
