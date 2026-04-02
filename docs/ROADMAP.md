# Roadmap

## Direction

`Agentdown` 的目标不是“能渲染 markdown 的 AGUI”，而是：

`把 agent run 变成可阅读、可回放、可干预的前端协议`

## v0.2 Protocol Layer

目标：把 runtime 从 demo 能力收敛成稳定协议。

计划：

- 稳定核心事件 schema
- 暴露官方事件 helpers
- 完善 reducer 扩展能力
- 补齐 AGUI runtime 文档和最佳实践
- 增加基础测试样例

当前状态：

- 已有响应式 runtime
- 已有自定义 reducer
- 已有核心事件 helpers 雏形

## v0.3 Replay And Artifacts

目标：让一次 run 能被复盘，而不只是实时播放。

计划：

- 增加 timeline / replay 能力
- 增加 artifact 事件与展示 block
- 增加 shell / tool log 展示协议
- 增加 run transcript 导出格式

关键价值：

- 让 agent 结果可以回看
- 让“为什么得到这个结论”有证据链

## v0.4 Human In The Loop

目标：让 agent run 支持真实业务干预。

计划：

- approval block
- changes requested / retry / resume from checkpoint
- handoff to human / handoff to team
- interrupt / resume / branch run

关键价值：

- 从 demo 走向真实工作流

## v0.5 Graph View

目标：把 team mode 从“多个卡片”升级成“真正的协作拓扑”。

计划：

- run graph
- dependency graph
- team branch lane
- parallel tool call lane
- blocked / waiting / finished 的路径高亮

关键价值：

- 清楚展示 leader、agent、tool 的关系和依赖

## v1.0 Agent-Native Markdown

目标：形成真正的 agent-native markdown DSL。

计划：

- `:::agent`
- `:::tool`
- `:::artifact`
- `:::approval`
- `:::handoff`
- `:::timeline`

理想状态：

- 文档本身就是 run 协议
- markdown 不只是内容层，也是 agent UI 的声明层
