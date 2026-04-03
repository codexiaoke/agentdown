---
title: Reducer 扩展
description: 用自定义 reducer 把 Agentdown 的事件流映射成适合你业务的状态语义。
---

# Reducer 扩展

默认 runtime 已经帮你处理了一批常见事件语义，但真正落到业务里时，你通常还是会想扩展自己的状态。

## 一个最常见的例子

把 `agent.blocked` 映射成 `waiting_tool`：

```ts
import { createAguiRuntime, type AgentNodeState } from 'agentdown';

const runtime = createAguiRuntime({
  reducer: ({ event, previousState }) => {
    if (event.type === 'agent.blocked') {
      return {
        patch: {
          kind: previousState?.kind ?? 'agent',
          status: 'waiting_tool',
          message: event.message ?? '等待下游工具返回'
        }
      };
    }
  }
});
```

## reducer 能拿到什么

`reducer` 的入参包含：

- `event`: 当前进入归约器的事件
- `at`: 归一化后的事件时间
- `previousState`: 当前节点之前的状态
- `defaultPatch`: 内置规则已经计算好的默认补丁

这意味着你可以做三种事情：

1. 在默认行为上补字段
2. 覆盖默认行为
3. 对某些事件完全不处理，继续走默认规则

## 追加默认 patch

```ts
const runtime = createAguiRuntime({
  reducer: ({ event }) => {
    if (event.type === 'tool.finished') {
      return {
        meta: {
          source: 'runtime',
          category: 'tool'
        }
      };
    }
  }
});
```

这种写法会和默认 patch 合并。

## 完全替换默认 patch

```ts
const runtime = createAguiRuntime({
  reducer: ({ event }) => {
    if (event.type === 'agent.started') {
      return {
        replaceDefault: true,
        patch: {
          kind: 'agent',
          status: 'running',
          title: event.title ?? '自定义 Agent'
        }
      };
    }
  }
});
```

当你设置 `replaceDefault: true` 时，内置规则就不会再参与这次合并。

## reducer 适合做什么

- 把业务事件映射成你的 UI 状态
- 给节点补充 `meta`
- 做 status 归一化
- 把多种事件折叠成更少的展示状态

## reducer 不适合做什么

- 发网络请求
- 写副作用很多的逻辑
- 把它当成完整状态管理框架

它更像是“事件进来之后，如何把节点状态补好”的薄层转换器。

## 一个 team mode 的思路

对于 team mode，你通常会这样约定：

- `run.started` 对应整个任务
- `agent.started` + `kind: 'leader'` 对应总控
- `agent.assigned` 对应 leader 下发任务
- `agent.started` 对应子 agent 真正开始
- `team.finished` 对应一个 team 分支收尾

这样 runtime 的树结构就会天然长出来，侧边栏、卡片、拓扑视图都可以共用这一份数据。
