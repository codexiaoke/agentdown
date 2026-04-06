---
title: RunSurface
description: RunSurface 的 props、性能选项、默认 renderer 和聊天式分组规则。
---

# RunSurface

`RunSurface` 是 Agentdown V1 面向产品界面的主渲染入口。  
它负责把 runtime 里的 `SurfaceBlock[]` 渲染成聊天式消息流、工具卡片流或你自己的 AGUI 页面。

如果说 `MarkdownRenderer` 负责叙事层，`RunSurface` 就负责运行态界面层。

## 最小用法

```vue
<script setup lang="ts">
import { RunSurface } from 'agentdown';

defineProps<{
  runtime: AgentRuntime;
}>();
</script>

<template>
  <RunSurface :runtime="runtime" />
</template>
```

## Props

| Prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `runtime` | `AgentRuntime` | 必填 | 当前要消费的 runtime |
| `slot` | `string` | `'main'` | 只渲染指定 slot 下的 block |
| `lineHeight` | `number` | `26` | text/pretext 渲染时的默认行高 |
| `font` | `string` | `400 16px "Helvetica Neue"` | text/pretext 渲染时的默认字体描述 |
| `emptyText` | `string` | `'等待新的运行输出...'` | 没有 block 时的空状态文案 |
| `performance` | `RunSurfacePerformanceOptions` | `{}` | 长会话和重型 block 的性能配置 |
| `aguiComponents` | `AguiComponentMap` | `{}` | 传给 markdown / draft 预览的 AGUI 组件映射表 |
| `builtinComponents` | `MarkdownBuiltinComponentOverrides` | `{}` | 覆写内置 markdown block 渲染器 |
| `renderers` | `RunSurfaceRendererMap` | `{}` | 覆写 surface renderer，例如工具卡片 |
| `draftPlaceholder` | `RunSurfaceDraftPlaceholder` | `false` | 没有可见内容时的草稿 loading 占位 |
| `messageShells` | `RunSurfaceMessageShellMap` | 内置 assistant/user shell | 覆写不同角色的消息外壳 |

## 默认行为

`RunSurface` 内置了几条很重要的默认行为：

- 会按 `groupId + role` 自动把 block 聚合成聊天消息组
- assistant 默认有消息 shell
- user 默认有气泡 shell
- `renderer === 'tool'` 时，默认会落到内置 `tool` 卡片
- draft markdown 会根据 `streamingDraftMode` 决定显示原文、预览还是隐藏
- draft markdown 会把 `streamingDraftKind / streamingDraftStability / streamingDraftMultiline` 一并透给 `block.data`

这意味着你可以先把 runtime 跑通，再逐步替换成自己的设计系统。

## draft 元数据

当一个 block 仍处于流式草稿态时，markdown assembler 可能会把下面这些字段写到 `block.data`：

```ts
interface SurfaceBlockStreamingDraftData {
  streamingDraftMode?: 'text' | 'preview' | 'hidden'
  streamingDraftKind?: 'blank' | 'line' | 'paragraph' | 'blockquote' | 'list' | 'table' | 'fence' | 'math' | 'thought' | 'directive' | 'setext-heading' | 'html'
  streamingDraftStability?: 'line-stable' | 'separator-stable' | 'candidate-stable' | 'close-stable'
  streamingDraftMultiline?: boolean
}
```

这些字段适合用来做：

- 根据草稿结构切换不同 loading / typing UI
- 在调试时判断“为什么这段内容还没进入 stable”
- 给不同语法的 draft 加样式，例如 fence / table / html 的占位态

默认 `RunSurface` 也会把这些值写成 DOM `data-*` 属性：

- `data-draft-mode`
- `data-draft-kind`
- `data-draft-stability`
- `data-draft-multiline`

这样你既可以在 Vue 里读 `block.data`，也可以在 devtools 或样式层直接观察当前草稿状态。

## `performance`

```ts
interface RunSurfacePerformanceOptions {
  groupWindow?: number | false;
  groupWindowStep?: number;
  lazyMount?: boolean;
  lazyMountMargin?: string;
  textSlabChars?: number;
}
```

当前内置的性能策略有 3 类：

### 1. group windowing

- `groupWindow`
  控制初始最多渲染多少个消息 group
- `groupWindowStep`
  控制每次向前展开多少个 group

适合长会话历史，避免一次性挂载所有聊天记录。

### 2. heavy block lazy mount

- `lazyMount`
  是否延迟挂载重型 block
- `lazyMountMargin`
  提前多远开始挂载

适合 Mermaid、复杂代码块、工具卡片、artifact、approval 这类渲染成本更高的 block。

### 3. long text slabization

- `textSlabChars`
  单个超长段落超过阈值后，会被切成更小的渲染 slab

适合长文本持续输出，减少一次 patch 影响的文本范围。

## renderer 覆写

最常见的是覆写工具卡片：

```ts
const surface = {
  renderers: {
    tool: MyToolCard,
    'tool.weather': WeatherToolCard
  }
};
```

其中：

- `tool` 是默认工具 renderer
- 你也可以继续定义更细的业务 renderer，例如 `tool.weather`

## draft placeholder

如果你希望“还没真正显示内容前”先出现一个 loading 占位：

```ts
const surface = {
  draftPlaceholder: {
    component: MessageLoadingBubble
  }
};
```

这个占位只会在“当前 block 还没有任何可见内容”时显示；一旦出现真正内容，就会自动让位。

## message shell

`messageShells` 用来覆写 assistant / user / system 三类消息外壳：

```ts
const surface = {
  messageShells: {
    assistant: MyAssistantShell,
    user: MyUserBubble
  }
};
```

它适合做：

- 对话气泡
- 头像布局
- 消息头部信息
- 不同角色的背景和间距

## 相关导出

包入口还导出了这些默认实现，方便你做包裹式覆写：

- `DefaultRunSurfaceAssistantShell`
- `DefaultRunSurfaceUserBubble`
- `DefaultRunSurfaceToolRenderer`

如果你只想在默认样式外包一层自己的容器、埋点或主题色，优先复用这些组件会最省事。
