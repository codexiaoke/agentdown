---
title: RunSurface
description: RunSurface 的主要 props、消息壳子、renderer 和性能配置。
---

# RunSurface

`RunSurface` 负责把 runtime 里的 block 渲染成聊天式界面。

## 最小用法

```vue
<RunSurface :runtime="runtime" />
```

## 主要 props

| Prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `runtime` | `AgentRuntime` | 必填 | 当前要渲染的 runtime |
| `slot` | `string` | `'main'` | 只渲染指定 slot 下的 block |
| `lineHeight` | `number` | `26` | 文本默认行高 |
| `font` | `string` | 内置默认字体 | 文本默认字体描述 |
| `emptyText` | `string` | `'等待新的运行输出...'` | 空状态文案 |
| `performance` | `RunSurfacePerformanceOptions` | `{}` | group window / lazy mount / text slab |
| `aguiComponents` | `AguiComponentMap` | `{}` | 给 markdown / draft 预览用的 AGUI 组件表 |
| `builtinComponents` | `MarkdownBuiltinComponentOverrides` | `{}` | 覆写内置 markdown block 组件 |
| `renderers` | `RunSurfaceRendererMap` | `{}` | 覆写 surface renderer |
| `draftPlaceholder` | `RunSurfaceDraftPlaceholder` | `false` | 当前消息还没稳定内容时的占位 UI |
| `messageShells` | `RunSurfaceMessageShellMap` | 内置 assistant/user | 覆写消息壳子 |
| `messageActions` | `RunSurfaceMessageActionsMap` | assistant 默认开启 | 配置消息操作栏 |
| `approvalActions` | `RunSurfaceApprovalActionsOptions \| false` | 默认开启 | 配置 approval 卡片动作 |
| `handoffActions` | `RunSurfaceHandoffActionsOptions \| false` | 默认关闭 | 配置 handoff 卡片动作 |

## 默认行为

`RunSurface` 默认会：

- 按 `groupId + role` 自动聚合消息
- 给 assistant 和 user 套默认 message shell
- 给 `tool` 提供基础 renderer
- 对长聊天记录启用基础性能优化

## `renderers`

最常见的是覆写工具卡片。

```ts
const surface = {
  renderers: {
    tool: DefaultToolCard,
    'tool.weather': WeatherToolCard
  }
};
```

## `messageShells`

如果你想完全接入自己的聊天外观，优先改这里。

```ts
const surface = {
  messageShells: {
    user: CustomUserBubble,
    assistant: CustomAssistantShell
  }
};
```

## `messageActions`

用来配置复制、重新生成、点赞、分享这些消息级动作。

```ts
const surface = {
  messageActions: {
    assistant: {
      enabled: true,
      actions: ['copy', 'regenerate', 'like', 'dislike', 'share']
    }
  }
};
```

## `performance`

最常见的字段：

| 字段 | 说明 |
| --- | --- |
| `groupWindow` | 初始挂载多少个消息组 |
| `groupWindowStep` | 继续展开时每次增加多少组 |
| `lazyMount` | 是否延迟挂载重型 block |
| `lazyMountMargin` | 提前多远开始挂载 |
| `textSlabChars` | 超长文本切片阈值 |

## 常见建议

- 想换工具卡片，优先改 `renderers`
- 想换 user / assistant 外观，优先改 `messageShells`
- 想换 loading，优先改 `draftPlaceholder`
- 想调长会话性能，优先改 `performance`
