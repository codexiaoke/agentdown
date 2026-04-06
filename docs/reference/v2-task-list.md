---
title: V2 任务清单
description: Agentdown V2 的可执行任务拆解、优先级、验收标准与建议推进顺序。
---

# V2 任务清单

> 这份文档不是愿景说明，而是 V2 的落地执行清单。  
> 配合 [V2 产品设计](/reference/v2-design) 一起看更合适。

## 使用方式

推荐把 V2 工作拆成 3 个层次来排：

- `必须做`
  不做这块，V2 的核心体验不会真正成立
- `应该做`
  做完后，Agentdown 会明显更像一个可落地平台
- `可以后做`
  很有价值，但不应该阻塞前面主链

同时，每个任务都尽量满足 4 个标准：

- 能单独开发和验收
- 能直接改善真实用户体验
- 能通过 demo / benchmark / test 证明价值
- 不把后端重新绑死成 Agentdown 私有协议

## V2 总优先级

建议实际推进顺序：

1. `Renderer 2.0`
2. `Adapter Kit 2.0`
3. `Devtools 2.0`
4. `Human-In-The-Loop 2.0`
5. `Graph + Team Runtime`

---

## 一. Renderer 2.0

这一块是 V2 最应该最先完成的部分，因为它直接决定：

- 流式内容稳不稳
- 长文渲染是否真的快
- 大组件混排会不会卡
- 用户会不会看到乱码、跳动、半截结构

### 必须做

#### `R2-1` block 生命周期正式收敛

目标：

- 给 block 建立正式的 `draft -> stable -> settled` 生命周期
- renderer、animation、virtualization、replay 都统一基于这套状态判断

验收：

- text / code / table / html / math / mermaid block 都能进入这 3 种状态中的合理一种
- `settled` 必须有明确来源
  可以来自后端 completion 事件，也可以来自 assembler 的结构闭合判断
- 文档里明确解释 3 个状态的语义和推荐用法

#### `R2-2` 语法感知的 streaming 稳定化

目标：

- 不同 markdown 结构使用不同的稳定策略，而不是统一按 token 直接渲染

必须覆盖：

- fenced code
- table
- math
- list
- blockquote
- html block

验收：

- 半截 table 不出现明显乱码
- code fence 在未闭合前保持安全草稿态
- html block 未闭合时不出现结构错乱
- 针对每种语法补测试样例和 demo

#### `R2-3` dual mode renderer

目标：

- 给用户明确的两种渲染模式，而不是逼用户调参数猜效果

模式：

- `typing`
  聊天优先，强调生成过程与逐字感
- `window`
  阅读优先，强调稳定和性能

验收：

- `MarkdownRenderer` 或更高层 preset 能一眼切换两种模式
- 文档说明每种模式适合什么页面
- demo 中能直接对比两种模式

#### `R2-4` 长文本性能基线升级

目标：

- 把当前的窗口化和 pretext 主链，变成可量化、可回归的性能基线

验收：

- Performance Lab 增加固定 benchmark 场景
- 输出可复制 JSON 基线
- 至少对 `initialRenderMs`、`maxMountedBlockCount`、`scrollSweep` 建立对比标准
- 文档写清楚“推荐参数”和“什么时候需要切 window mode”

### 应该做

#### `R2-5` heavy block lazy strategy 细化

目标：

- 对 Mermaid、图片、复杂 HTML、自定义组件提供更聪明的延迟挂载策略

验收：

- 可以按 block 类型设定默认 lazy 策略
- 提供 per-renderer override
- 不影响首屏文本连续性

#### `R2-6` worker 解析链路

目标：

- 大 markdown 解析优先放到 worker，主线程只做展示和少量调度

验收：

- 提供可选 worker renderer / worker parser 入口
- 大文档 demo 可切换 worker on/off 对比
- 失败时自动回退主线程

### 可以后做

#### `R2-7` SSR / hydration handoff

目标：

- SSR 给首屏 block，客户端接管后继续流式追加

验收：

- 至少有一个最小 SSR demo
- hydration 后内容不重复、不闪烁

---

## 二. Adapter Kit 2.0

这一块决定“接真实 backend 到底麻不麻烦”。

### 必须做

#### `A2-1` 官方 adapter factory 正式 API

目标：

- 把当前已经形成的内部统一能力，收敛成正式公开 API

建议形态：

```ts
defineAdapter({
  protocol,
  transport,
  tools,
  events,
  eventActions,
  surface
})
```

验收：

- 文档中给出最小接入例子
- 不需要用户理解内部 shared factory 文件结构
- 适配层代码量明显少于现在的手写 protocol + transport + chat helper 组合

#### `A2-2` helper DSL 第一批正式收敛

优先 helper：

- `toolByName()`
- `eventToBlock()`
- `contentChannel()`
- `groupStrategy()`
- `errorStrategy()`
- `sessionFactory()`

验收：

- 每个 helper 都有注释、类型说明、最小 demo
- 能覆盖 Agno / LangChain / AutoGen / CrewAI 中至少两个框架的真实场景

#### `A2-3` 官方 starter 文档

目标：

- 不是只有 demo 能跑，而是用户看完就能照着接自己的后端

优先输出：

- Agno starter
- LangChain starter
- AutoGen starter
- CrewAI starter

验收：

- 每个 starter 都包含前端和 FastAPI 后端最小链路
- 明确哪些事件是官方事件，哪些是业务扩展事件

### 应该做

#### `A2-4` framework registry / preset registry

目标：

- 在 `useAgentChat()` 的基础上，再补一层更短的注册式入口

例如：

```ts
createAgentChatFrameworkRegistry({
  agno: agnoChatFramework,
  myBackend: myFramework
})
```

验收：

- 用户可只传字符串别名
- 仍然保留直接传 driver 的高级能力

#### `A2-5` transport cookbook

目标：

- 把 SSE / NDJSON / fetch streaming / websocket 的接法收成标准文档

验收：

- 每种 transport 有最小例子
- 写清楚什么时候推荐哪一种

### 可以后做

#### `A2-6` OpenAI Agents / AI SDK 官方适配

目标：

- 把更多生态接进来，但不阻塞前四套主链继续做深

---

## 三. Devtools 2.0

这一块决定 Agentdown 是不是“只会显示”，还是“能诊断问题”。

### 必须做

#### `D2-1` event inspector

目标：

- 能看到后端原始事件、到达顺序、时间戳、大小

验收：

- 开发模式下可开关
- 能过滤 event name
- 能复制单条事件 JSON

#### `D2-2` protocol trace

目标：

- 能看到“一条原始事件映射成了哪些 runtime commands”

验收：

- 至少能展示 raw event -> protocol -> command list
- 出错时能定位是哪一步抛错

#### `D2-3` runtime snapshot / transcript diff

目标：

- 能比对不同时间点的 runtime 状态

验收：

- 至少支持 block list diff
- 能导出一份最小复现 JSON

### 应该做

#### `D2-4` replay debugger

目标：

- 不只是“回放”，而是能逐步调试一段 transcript

验收：

- 支持 step / pause / resume
- 支持查看每一步新增 block / command

#### `D2-5` performance overlay

目标：

- 把 Performance Lab 的能力往运行时 devtools 上挪一部分

验收：

- 页面里可直接看到 mounted block、viewport sync、window range change 等关键指标

### 可以后做

#### `D2-6` devtools panel 插件化

目标：

- 让框架 adapter 也能向 devtools 注入自己的调试面板

---

## 四. Human-In-The-Loop 2.0

这一块决定 Agentdown 能不能承接真实业务工作流。

### 必须做

#### `H2-1` approval action API

目标：

- approval 不只是展示 pending / approved / rejected
- 用户可以从 UI 里真的触发动作

验收：

- 提供 approve / reject / submit 接口
- 可以接入业务回调
- 支持 loading / error / optimistic state

#### `H2-2` retry / resume / interrupt

目标：

- 一次 run 出错后，不是只能新开一轮，而是可以原地恢复或重试

验收：

- runtime 层有明确 action
- UI 层可绑定到消息操作栏或 approval 区域

#### `H2-3` user attachment block

目标：

- 用户消息支持文件、图片、结构化输入，而不是只是一段 text

验收：

- user message 能挂附件 block
- 能和文本同属一条 message / turn
- 有最小上传 demo

### 应该做

#### `H2-4` branch run

目标：

- 一条运行可以从某个点派生分支，而不是只能线性继续

验收：

- runtime 能表示 branch 关系
- surface 至少有一种可读展示方式

#### `H2-5` handoff

目标：

- 支持 handoff to human / handoff to team

验收：

- 有专门状态和 block 语义
- 不强绑具体后端协议名

---

## 五. Graph + Team Runtime

这部分价值很大，但不该阻塞前面主链。

### 应该做

#### `G2-1` run graph 数据模型

目标：

- 把并行 lane、依赖关系、blocked path 正式进入 runtime

#### `G2-2` team surface

目标：

- 多 agent 协作不是简单时间线堆叠，而是可读的协作拓扑

### 可以后做

#### `G2-3` graph replay

目标：

- 支持按 graph 路径回放，而不是只按时间顺序播放

---

## 推荐先落地的 3 个 RFC

如果我们现在立刻开始做 V2，最推荐先单独写成 RFC 的是：

1. `Renderer 2.0 RFC`
2. `Adapter Kit 2.0 RFC`
3. `Devtools Trace RFC`

原因很简单：

- Renderer 决定用户第一感受
- Adapter 决定接入成本
- Devtools 决定后续迭代效率

## 推荐近期执行顺序

如果按“最快让用户感知到 V2 价值”的顺序，我建议这样排：

1. 先做 `R2-1 + R2-2 + R2-3`
2. 再做 `A2-1 + A2-2 + A2-3`
3. 然后做 `D2-1 + D2-2 + D2-3`
4. 再进入 `H2-1 + H2-2 + H2-3`

## V2 完成的判断标准

V2 至少应该满足这些条件，才算真的站住：

- 用户接主流 Agent backend，不再需要大量样板代码
- 大多数流式 markdown 结构不会再出现明显乱码或抖动
- 性能优化有 benchmark、有基线、有可回归指标
- 出问题时能定位是 transport、protocol、assembler 还是 renderer 出的问题
- approval / tool / artifact / user attachment 都能自然进入同一条运行界面主链

## 相关文档

- [V2 产品设计](/reference/v2-design)
- [Adapter Kit 2.0 RFC](/reference/adapter-kit-2-rfc)
- [路线图](/reference/roadmap)
