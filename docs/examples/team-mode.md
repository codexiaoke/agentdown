---
title: Team Mode 示例
description: 用 Agentdown 表达 leader、agent1、agent2、tool 的协作流程。
---

# Team Mode 示例

这是一个更接近真实 agent 协作的例子：一个 leader 接收请求，然后分配给两个 agent 并行执行，最后分别收敛。

## 对应的 markdown

```md
# 团队工作模式

用户先发来一个复杂请求，leader 需要拆成多个子任务。

:::vue-component DemoRunBoard {"ref":"run:team"}

:::vue-component DemoAgentNodeCard {"ref":"agent:leader"}

:::vue-component DemoAgentNodeCard {"ref":"agent:retriever"}

:::vue-component DemoAgentNodeCard {"ref":"agent:writer"}
```

## 对应的事件流

```ts
runtime.emit(runStarted({
  nodeId: 'run:team',
  title: '团队任务运行',
  message: '等待 leader 调度'
}));

runtime.emit(agentStarted({
  nodeId: 'agent:leader',
  parentId: 'run:team',
  kind: 'leader',
  title: 'Team Leader',
  message: '正在分配子任务'
}));

runtime.emit(agentAssigned({
  nodeId: 'agent:retriever',
  parentId: 'agent:leader',
  title: 'Research Agent',
  message: '负责检索事实材料'
}));

runtime.emit(agentAssigned({
  nodeId: 'agent:writer',
  parentId: 'agent:leader',
  title: 'Writer Agent',
  message: '负责整合输出'
}));

runtime.emit(agentStarted({
  nodeId: 'agent:retriever',
  parentId: 'agent:leader',
  title: 'Research Agent'
}));

runtime.emit(toolStarted({
  nodeId: 'tool:search',
  parentId: 'agent:retriever',
  toolName: 'web.search',
  title: '搜索资料'
}));

runtime.emit(toolFinished({
  nodeId: 'tool:search',
  parentId: 'agent:retriever',
  toolName: 'web.search',
  message: '检索完成'
}));

runtime.emit(agentFinished({
  nodeId: 'agent:retriever',
  parentId: 'agent:leader',
  title: 'Research Agent'
}));

runtime.emit(agentStarted({
  nodeId: 'agent:writer',
  parentId: 'agent:leader',
  title: 'Writer Agent',
  message: '整合检索结果'
}));

runtime.emit(agentFinished({
  nodeId: 'agent:writer',
  parentId: 'agent:leader',
  title: 'Writer Agent'
}));

runtime.emit(teamFinished({
  nodeId: 'agent:leader',
  parentId: 'run:team',
  kind: 'leader',
  title: 'Team Leader',
  message: '全部子任务完成'
}));

runtime.emit(runFinished({
  nodeId: 'run:team',
  title: '团队任务运行'
}));
```

## 这一套模型的价值

- 内容层仍然是 markdown，方便解释过程
- 状态层是 runtime tree，方便做 board、timeline、graph
- 同一份 `ref` 既能驱动主区域卡片，也能驱动侧边栏摘要

## 推荐的 UI 布局

- 主列：markdown 叙事 + 关键 AGUI 卡片
- 右侧：当前 run、活跃节点、最近事件
- 底部或弹层：tool logs、artifact、approval

## 从这里继续往前走

如果你下一步要做：

- timeline：重点关注事件顺序和 `at`
- artifact panel：重点关注 `artifact.created`
- approval flow：重点关注 `approval.requested / approval.resolved`
- team graph：重点关注 `parentId` 和 `children()`
