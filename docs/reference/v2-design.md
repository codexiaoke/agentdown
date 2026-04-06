---
title: V2 产品设计
description: Agentdown V2 的产品目标、核心差异化、模块规划与阶段性落地路线。
---

# V2 产品设计

> 本文定义 Agentdown V2 的目标方向。  
> 如果说 V1 已经把 `Protocol + Bridge + Assembler + Runtime + RunSurface` 的主链收敛出来，那么 V2 的任务就是把它从“可用的前端 runtime”推进成“适合真实 Agent 产品落地的平台”。

## 一句话定位

**Agentdown V2 是一个面向真实 Agent 产品的前端运行时平台。**

它不只是：

- 一个 markdown 渲染器
- 一个流式文本播放器
- 一个聊天 UI 组件库

它要做的是：

**把 Agent 的一次运行，变成可阅读、可交互、可调试、可回放、可干预、可性能优化的前端协议和界面系统。**

## 为什么要做 V2

V1 已经解决了三件很关键的事：

- 后端协议不强绑，任意事件都能接
- 流式 markdown 有了稳定化主链
- tool / artifact / approval / 自定义组件进入了统一 runtime

但如果 Agentdown 想真正帮助更多团队，V2 还需要补齐下面这些差距：

- 接入还可以更简单
- 流式渲染还可以更智能
- 运行态调试工具还不够强
- 人机协作能力还停留在 block 展示层
- 官方框架支持还没有形成真正的 adapter kit

## V2 的产品目标

V2 重点解决 4 类问题：

1. 让开发者用更少样板代码接入真实 Agent backend
2. 让复杂 markdown 和大组件在流式场景下渲染得更稳、更快
3. 让 runtime 可调试、可回放、可诊断，而不是只会“显示结果”
4. 让 approval / branch / retry / handoff 这类真实 Agent 工作流成为第一公民

## V2 不做什么

V2 仍然坚持这些边界：

- 不把后端统一成 Agentdown 私有协议
- 不退化成单纯的 markdown renderer
- 不把 tool / artifact / approval 再塞回一大段 HTML 里
- 不把 runtime 做成和 Vue 深度耦合的黑盒状态机

## 我们的差异化

## 1. 我们不只是 renderer-first

市面上一些优秀库更擅长解决：

- streaming markdown 渲染
- 长文档性能
- 渐进代码块 / Mermaid
- SSR / worker handoff

这类能力非常有参考价值。  
例如 [markstream-vue](https://github.com/Simon-He95/markstream-vue) 在以下方向就很值得借鉴：

- 更成熟的 streaming-first markdown renderer 工程化
- 虚拟窗口与增量 batch 两种渲染模式
- worker / SSR handoff
- test / playground / 可复现实验页面

但 Agentdown 的核心差异不应停留在“比谁 markdown 渲染更强”，而是：

- `runtime-first`
- `agui-first`
- `protocol-first`

也就是：

**我们吸收优秀 renderer 的能力，但不放弃 runtime 和 agent workflow 这条主轴。**

## V2 的四个主轴

## 一. Renderer 2.0

目标：把 V1 的流式 markdown 主链升级成更细粒度、更工程化的稳定化引擎。

### 要做什么

- 语法感知的 streaming 稳定化
- block 级 `draft -> stable -> settled` 生命周期
- code fence / table / math / list / quote / html block 分类别处理
- 更细粒度的 inline streaming 策略
- worker 解析链路
- SSR / hydration handoff

### 关键能力

#### 1. 语法感知稳定化

现在 V1 已经能避免很多半截结构乱码。  
V2 要继续把这件事做细：

- table 表头完整后再进入稳定渲染
- fenced code 在 fence 闭合前保留安全草稿态
- math 在表达式完整后再切到正式块
- HTML block 在结构未闭合时保守展示

#### 2. `settled` 概念

V2 建议在 `draft` / `stable` 之外补一个更偏协议层的概念：

- `draft`
  还在持续增长
- `stable`
  结构已可安全渲染
- `settled`
  后端已明确声明“这一段完成”，后续不会再改

这会让：

- 动画
- 性能冻结
- replay
- 导出

都更容易做。

#### 3. 双模式渲染

V2 可以明确支持两种 renderer 模式：

- `typing`
  更适合聊天和生成过程展示
- `window`
  更适合长文档、阅读和性能优先

而不是完全交给一堆性能参数让用户自己猜。

#### 4. Worker / SSR handoff

这部分非常值得借鉴成熟 renderer 的做法。

理想形态：

- SSR 先给出首屏 block
- 客户端接管后继续流式追加
- 大 markdown 解析优先在 worker 中完成

## 二. Adapter Kit 2.0

目标：让“接主流 Agent backend”从可行，变成真正轻松。

### 要做什么

- 统一 adapter 开发模型
- 官方框架 starter
- 更高层 helper DSL
- transport cookbook

### 核心形态

V2 推荐引入：

```ts
defineAdapter({
  protocol,
  toolComponents,
  eventComponents,
  transport,
  surface,
  devtools
})
```

让用户只关心：

- 后端是什么框架
- 工具怎么显示
- 某些事件要不要额外渲染块

### 官方 adapter 目标覆盖

优先级建议：

1. Agno
2. LangChain
3. AutoGen
4. CrewAI
5. OpenAI Agents / AI SDK

### 新 helper 方向

- `toolByName()`
- `eventToBlock()`
- `contentChannel()`
- `groupStrategy()`
- `errorStrategy()`
- `sessionFactory()`

这些 helper 的目标不是再发明统一后端协议，而是让适配官方事件更轻松。

## 三. Runtime Devtools 2.0

目标：让 Agentdown 从“能展示”变成“能诊断、能优化、能复现”。

### 要做什么

- event inspector
- protocol trace
- runtime snapshot viewer
- block tree / node tree inspector
- replay debugger
- performance overlay

### 为什么这个很重要

流式渲染问题最难的地方不是“出 bug”，而是：

- 很难复现
- 很难判断问题出在 transport、protocol、assembler 还是 renderer
- 很难比较优化前后的变化

V2 的 devtools 要帮用户回答这些问题：

- 当前收到的原始事件是什么
- 这一条事件映射成了哪些命令
- 哪个 assembler 改了什么 block
- 为什么某个 block 还是 draft
- 为什么某次滚动触发了重新挂载

### 目标输出

- 可复制的最小复现 JSON
- 可导出的 transcript / trace
- 可视化的命令时间轴

## 四. Human-In-The-Loop 2.0

目标：让 approval / retry / branch / handoff 成为真实工作流能力，而不只是展示块。

### 要做什么

- approval action API
- branch run
- retry / resume
- interrupt
- human handoff
- team handoff

### 新的数据模型方向

V2 可以补充：

- `run.branch`
- `run.resume`
- `run.retry`
- `node.waiting`
- `node.blocked`
- `approval.action`

### UI 层目标

- approval 不只是状态展示
- tool block 可以有 log / progress / partial result
- artifact 可以进入 side panel / detail panel
- user block 支持文件、图片和结构化输入

## V2 推荐模块结构

可以考虑从当前结构继续演化为：

```text
src/
  adapters/
  transport/
  protocol/
  assembler/
  runtime/
  surface/
  renderer/
  devtools/
  presets/
```

这里的关键变化不是目录本身，而是把“渲染引擎”“运行时”“调试工具”“适配器工厂”几个层次表达得更清楚。

## V2 推荐阶段

## Phase 1: Renderer + Adapter

先做最能立刻提升用户体验的部分：

- Renderer 2.0
- Adapter Kit 2.0
- 官方框架 starter

这是最直接能提升接入和渲染体验的一阶段。

## Phase 2: Devtools + Replay

- event inspector
- protocol trace
- replay debugger
- benchmark overlay

这阶段完成后，Agentdown 才真正具备“调试平台”的味道。

## Phase 3: HITL + Workflow

- approval action
- branch / retry / resume
- handoff
- team mode 的运行态能力

这阶段会让 Agentdown 更接近真实业务产品，而不是 demo runtime。

## V2 成功标准

如果 V2 做对了，用户应该能明显感受到这些变化：

- 接一个主流 Agent backend，不再需要写大量样板代码
- 流式 markdown 更少出现抖动、乱码和结构跳变
- 出问题时能清楚知道是哪个层出了问题
- tool / artifact / approval / user attachment 都能自然进入同一条界面主链
- Agent 产品不只是“输出内容”，而是真正可交互的运行界面

## 下一步建议

建议把 V2 正式拆成两个立刻可执行的任务：

1. `Renderer 2.0 RFC`
2. [`Adapter Kit 2.0 RFC`](/reference/adapter-kit-2-rfc)

也就是先把：

- streaming block 生命周期
- dual mode renderer
- adapter factory
- helper DSL

这四件事单独落成更细的 RFC，再开始编码。

如果你想直接看执行拆解，请继续阅读：

- [V2 任务清单](/reference/v2-task-list)
