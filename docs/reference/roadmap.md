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

## V1 已完成

当前已经完成的主链包括：

- `Protocol + Bridge + Assembler + Runtime + RunSurface`
- 官方框架前端适配入口
- 基础流式 markdown 稳定化
- 长文本 / 长会话性能主链
- transcript / replay 基础能力

如果你想先看已经收敛出的正式基线，请先阅读 [V1 产品设计](/reference/v1-design)。

## V2 方向

V2 的核心目标不是“把 markdown 渲染得更炫”，而是：

`把 Agentdown 从可用 runtime 推进成真实 Agent 产品前端平台`

## Phase 1: Renderer 2.0 + Adapter Kit 2.0

目标：先把最影响接入体验和渲染体验的主链做强。

重点：

- 语法感知的 markdown 流式稳定化
- `draft / stable / settled` 生命周期
- dual mode renderer
- worker / SSR handoff
- adapter factory
- 官方框架 starter

## Phase 2: Devtools + Replay 2.0

目标：让 Agentdown 具备真正可调试、可诊断、可复现的工具链。

重点：

- event inspector
- protocol trace
- runtime snapshot diff
- replay debugger
- performance overlay
- 可复制最小复现 JSON

## Phase 3: Human-In-The-Loop 2.0

目标：让 agent run 支持真实业务里的人工干预和工作流分支。

重点：

- approval action
- retry / resume / branch
- interrupt
- handoff to human / handoff to team
- user attachment block

## Phase 4: Graph + Team Runtime

目标：把 team mode 从“多个 block 的展示”推进成“真实协作拓扑”。

重点：

- run graph
- dependency graph
- parallel lane
- blocked / waiting / finished path highlight
- team branch lane

## 进一步阅读

- [V1 产品设计](/reference/v1-design)
- [V2 产品设计](/reference/v2-design)
- [V2 任务清单](/reference/v2-task-list)
