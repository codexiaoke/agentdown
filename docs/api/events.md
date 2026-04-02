---
title: 事件 Helpers
description: Agentdown 核心事件 helpers、输入字段与推荐使用方式。
---

# 事件 Helpers

Agentdown 在包入口导出了当前首版推荐使用的核心事件 helpers。

## 基础 helpers

```ts
runStarted()
runFinished()
userMessageCreated()
agentAssigned()
agentStarted()
agentThinking()
agentBlocked()
agentFinished()
teamFinished()
toolStarted()
toolFinished()
artifactCreated()
approvalRequested()
approvalResolved()
handoffCreated()
nodeError()
```

## 共享输入字段

大多数 helpers 都继承了这组基础字段：

| 字段 | 说明 |
| --- | --- |
| `nodeId` | 当前事件作用的节点 id |
| `parentId` | 当前节点的父节点 id |
| `title` | 展示标题 |
| `message` | 展示文案 |
| `meta` | 扩展信息 |
| `at` | 事件时间戳，未传时 runtime 自动补 |

## 特殊事件字段

### 工具事件

`toolStarted()` 和 `toolFinished()` 额外需要：

| 字段 | 说明 |
| --- | --- |
| `toolName` | 工具名，例如 `web.search` |

### artifact 事件

`artifactCreated()` 额外支持：

| 字段 | 说明 |
| --- | --- |
| `artifactId` | 产物 id |
| `artifactKind` | `file / diff / report / image / json / table` |
| `label` | 产物标签 |
| `href` | 产物链接或文件地址 |

### approval 事件

`approvalRequested()` 与 `approvalResolved()` 额外支持：

| 字段 | 说明 |
| --- | --- |
| `approvalId` | 审批项 id |
| `decision` | `approved / rejected / changes_requested` |

### handoff 事件

`handoffCreated()` 额外支持：

| 字段 | 说明 |
| --- | --- |
| `target` | 交接目标，例如 `human`、`agent:writer`、`team:review` |

## 推荐实践

- 如果这个事件已经有官方 helper，优先直接用 helper
- 如果这个事件是你业务特有的，再自己发自定义事件
- 需要做 UI 语义映射时，不要在组件里硬编码，优先放进 reducer

## 自定义事件示例

```ts
runtime.emit({
  type: 'agent.streaming.delta',
  nodeId: 'agent:writer',
  parentId: 'run:copy',
  message: '收到新的文本分片',
  meta: {
    deltaLength: 42
  }
});
```

## 类型导出

包入口还导出了首版常用的事件类型，方便你给 reducer、组件和事件日志补上精确类型：

- `CoreAguiEvent`
- `CoreAguiEventType`
- `RunStartedEvent`
- `AgentStartedEvent`
- `ToolStartedEvent`
- `ArtifactCreatedEvent`
- `ApprovalRequestedEvent`
- `ApprovalResolvedEvent`
- `HandoffCreatedEvent`
- `NodeErrorEvent`
