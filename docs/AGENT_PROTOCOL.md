# Agent Protocol

`Agentdown` 目前把 agent 前端展示拆成两层：

- `MarkdownRenderer` 负责叙事层
- `AGUI runtime` 负责状态层

runtime 接收事件，记录事件流，再把事件归约成节点状态。这样同一份 run 可以同时驱动：

- markdown 中嵌入的 AGUI 组件
- 侧边栏状态面板
- 时间轴 / 回放视图
- 未来的 graph / artifact / approval 视图

## Core Events

当前公开的核心事件 helpers 位于 `src/core/agentEvents.ts`，并通过包入口导出。

已包含的事件类别：

- `run.started`
- `run.finished`
- `user.message.created`
- `agent.assigned`
- `agent.started`
- `agent.thinking`
- `agent.blocked`
- `agent.finished`
- `team.finished`
- `tool.started`
- `tool.finished`
- `artifact.created`
- `approval.requested`
- `approval.resolved`
- `handoff.created`
- `node.error`

推荐写法：

```ts
import {
  agentBlocked,
  agentStarted,
  createAguiRuntime,
  runStarted,
  toolStarted
} from '@codexiaoke/agentdown';

const runtime = createAguiRuntime();

runtime.emit(runStarted({
  nodeId: 'run:demo-1',
  title: 'Pricing run'
}));

runtime.emit(agentStarted({
  nodeId: 'node:agent-1',
  parentId: 'run:demo-1',
  title: 'Research agent'
}));

runtime.emit(agentBlocked({
  nodeId: 'node:agent-1',
  message: 'Waiting for downstream tool output.'
}));

runtime.emit(toolStarted({
  nodeId: 'node:tool-1',
  parentId: 'node:agent-1',
  toolName: 'pricing.lookup'
}));
```

## Reducer Layer

runtime 内置了一套默认归约规则：

- `run.started` 默认进入 `running`
- `agent.started` 默认进入 `thinking`，leader 默认进入 `running`
- `tool.started` 默认进入 `running`
- `tool.finished` / `agent.finished` / `run.finished` 默认进入 `done`
- `node.error` 默认进入 `error`

如果你需要扩展自己的业务语义，可以在 `createAguiRuntime({ reducer })` 里补 reducer：

```ts
const runtime = createAguiRuntime({
  reducer: ({ event, previousState }) => {
    if (event.type === 'agent.blocked') {
      return {
        patch: {
          kind: previousState?.kind ?? 'agent',
          status: 'waiting_tool',
          message: event.message ?? 'Waiting for downstream tool output.'
        }
      };
    }
  }
});
```

## Display Model

当前最推荐的前端展示模型是：

1. markdown 负责叙事和长文本
2. runtime 负责 run / agent / tool / approval / artifact 的状态流
3. 组件通过 `{"ref":"..."}` 绑定 runtime
4. 组件内部通过 `useAguiState()`、`useAguiEvents()`、`useAguiChildren()` 读取状态

## Next Protocol Gaps

协议层下一步最值得补的是：

- artifact 的标准字段约定
- approval / human-in-the-loop 的状态约定
- run replay / timeline 的时间语义
- graph view 所需的 dependency / handoff 关系
