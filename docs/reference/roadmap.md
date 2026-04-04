---
title: 路线图
description: Agentdown 从 0.0.1 测试版到协议稳定层的演进方向。
---

# 路线图

## 方向

Agentdown 的目标不是“能渲染 markdown 的 AGUI”，而是：

`把 agent run 变成可阅读、可回放、可干预的前端协议`

## 0.0.1 Test Release

当前首发测试版已经具备：

- markdown 渲染主链路
- Protocol + Bridge + Assembler + Runtime 基础骨架
- 可覆写的内置组件系统
- 图片预览、Mermaid 全屏预览、拖拽与滚轮缩放
- npm 打包、类型声明与发布清单校验

## v0.2 Protocol Layer

目标：把协议层和 streaming 组装进一步做稳。

重点：

- 更细粒度的 protocol helpers
- 更聪明的 markdown 稳定化策略
- 补齐 transport 最佳实践
- 增加基础测试

## v0.3 Replay And Artifacts

目标：让一次 run 可以被复盘，而不只是实时播放。

重点：

- replay / transcript
- artifact 事件与展示协议
- shell / tool log
- transcript 导出格式

## v0.4 Human In The Loop

目标：让 agent run 支持真实业务干预。

重点：

- approval block
- changes requested / retry / resume
- handoff to human / handoff to team
- interrupt / branch run

## v0.5 Graph View

目标：把 team mode 从“多个卡片”升级成“真正的协作拓扑”。

重点：

- run graph
- dependency graph
- team branch lane
- parallel tool call lane
- blocked / waiting / finished 路径高亮

## v1.0 Agent-Native Markdown

目标：形成真正的 agent-native markdown DSL。

理想状态：

- 文档本身就是 run 协议
- markdown 不只是内容层，也是 agent UI 的声明层
- `:::agent`、`:::tool`、`:::artifact`、`:::approval`、`:::timeline` 形成稳定 DSL

如果你想先看已经收敛出的目标架构，请先阅读 [V1 产品设计](/reference/v1-design)。
