---
title: 协议与事件
description: Agentdown 内置核心事件、默认状态映射与推荐事件流。
---

# 协议与事件

Agentdown 当前公开了一组核心事件 helpers，它们是第一版 agent 协议的基础。

## 核心事件类型

| 事件 | 用途 | 默认 kind / 状态 |
| --- | --- | --- |
| `run.started` | 整个运行开始 | `run / running` |
| `run.finished` | 整个运行结束 | `run / done` |
| `user.message.created` | 记录用户输入 | `user / done` |
| `agent.assigned` | agent 被分配任务 | `agent / assigned` |
| `agent.started` | agent 开始执行 | `agent / thinking`，`leader / running` |
| `agent.thinking` | agent 进入思考态 | `agent / thinking` |
| `agent.blocked` | agent 被阻塞 | 默认不改状态，建议通过 reducer 映射 |
| `agent.finished` | agent 完成 | `agent / done` |
| `team.finished` | 一个 team 分支完成 | `agent / done` |
| `tool.started` | 工具开始 | `tool / running` |
| `tool.finished` | 工具结束 | `tool / done` |
| `artifact.created` | 产物创建 | 默认只补字段，不改状态 |
| `approval.requested` | 请求人工审批 | 默认只补字段，不改状态 |
| `approval.resolved` | 审批结束 | 默认只补字段，不改状态 |
| `handoff.created` | 交接给其他角色 | 默认只补字段，不改状态 |
| `node.error` | 节点出错 | `agent / error` |

## 推荐的最小事件流

一个单 agent + tool 的常见流程：

```ts
runtime.emit(runStarted({
  nodeId: 'run:pricing',
  title: '报价运行'
}));

runtime.emit(userMessageCreated({
  nodeId: 'msg:user:1',
  parentId: 'run:pricing',
  message: '帮我做一个中文报价'
}));

runtime.emit(agentStarted({
  nodeId: 'agent:planner',
  parentId: 'run:pricing',
  title: 'Planner'
}));

runtime.emit(toolStarted({
  nodeId: 'tool:pricing',
  parentId: 'agent:planner',
  toolName: 'pricing.lookup'
}));

runtime.emit(toolFinished({
  nodeId: 'tool:pricing',
  parentId: 'agent:planner',
  toolName: 'pricing.lookup',
  message: '返回 4 条报价结果'
}));

runtime.emit(agentFinished({
  nodeId: 'agent:planner',
  parentId: 'run:pricing',
  title: 'Planner'
}));

runtime.emit(runFinished({
  nodeId: 'run:pricing',
  title: '报价运行'
}));
```

## 为什么 `agent.blocked` 默认不直接变成 `waiting_tool`

因为“阻塞”的业务语义其实很依赖上下文：

- 可能是在等 tool
- 可能是在等人工审批
- 可能是在等另一个 agent
- 也可能只是暂停

所以 Agentdown 选择把它暴露为标准事件，但把最终状态语义交给你自己的 reducer。

## `artifact`、`approval`、`handoff` 为什么默认也不强绑定状态

首版的重点是先把事件 schema 稳住，而不是过早把业务 UI 设计死。  
这几类事件已经有 helpers 和字段，但真正的产品语义还需要结合你的场景收敛。

## 用户可以自定义事件吗

可以。  
你并不一定非要用内置 helpers，`runtime.emit()` 接受任意 `AguiRuntimeEvent`：

```ts
runtime.emit({
  type: 'agent.streaming.delta',
  nodeId: 'agent:writer',
  message: '新的 token 到达'
});
```

如果你想把这类自定义事件映射成特定状态，就在 `createAguiRuntime({ reducer })` 里处理。

## `applyEvent` 是做什么的

`applyEvent` 是 runtime 内部真正执行事件归约的函数，外部 API 暴露成了 `runtime.emit`。  
大多数使用者并不需要直接关心它，只要记住：

- 发事件用 `runtime.emit`
- 自定义语义用 `reducer`

下一页继续看 [Reducer 扩展](/runtime/reducer)。
