---
title: RunSurface 定制
description: 覆写 renderers、messageShells、messageActions 和性能配置。
---

# RunSurface 定制

`RunSurface` 是把 runtime 渲染成聊天界面的入口。

它负责两件事：

1. 按 message / group 把 block 组织成聊天结构
2. 把不同 block 交给对应 renderer 或默认组件

## 最常改的几个点

| 配置 | 用途 |
| --- | --- |
| `renderers` | 覆写某个 block renderer 对应的组件 |
| `messageShells` | 覆写 user / assistant 消息壳子 |
| `messageActions` | 控制复制、重试、点赞等消息操作栏 |
| `draftPlaceholder` | 某条消息还没稳定输出前显示的 loading UI |
| `approvalActions` | 配置 approval 卡片内部动作 |
| `handoffActions` | 配置 handoff 卡片内部动作 |
| `performance` | group window、lazy mount、text slab 等性能策略 |

## 覆写工具卡片

```vue
<script setup lang="ts">
import { RunSurface } from 'agentdown';
import WeatherToolCard from './WeatherToolCard.vue';

defineProps<{
  runtime: any;
  surface: any;
}>();
</script>

<template>
  <RunSurface
    :runtime="runtime"
    v-bind="surface"
    :renderers="{
      ...surface.renderers,
      'tool.weather': WeatherToolCard
    }"
  />
</template>
```

## 覆写消息壳子

如果你想把 user / assistant 外观完全接进自己的设计系统，优先改 `messageShells`。

```ts
import CustomUserBubble from './CustomUserBubble.vue';
import CustomAssistantShell from './CustomAssistantShell.vue';

const surface = {
  messageShells: {
    user: CustomUserBubble,
    assistant: CustomAssistantShell
  }
};
```

## 定制消息操作栏

你可以按角色控制消息操作栏。

```ts
const surface = {
  messageActions: {
    assistant: {
      enabled: true,
      showOnDraft: false,
      showWhileRunning: false,
      actions: ['copy', 'regenerate', 'like', 'dislike', 'share']
    }
  }
};
```

## 定制 loading 占位

```ts
import MessageLoadingBubble from './MessageLoadingBubble.vue';

const surface = {
  draftPlaceholder: {
    component: MessageLoadingBubble,
    props: {
      label: '助手正在思考'
    }
  }
};
```

这个占位一般只在“当前消息还没有稳定内容”时显示。

## 内置 Markdown 组件也能覆写

`RunSurface` 渲染文本 block 时，底层还是会走 Markdown 组件体系，所以这些也可以换：

- `text`
- `html`
- `code`
- `mermaid`
- `math`
- `thought`
- `artifact`
- `approval`
- `handoff`

如果你想接自己的设计系统，不需要从零重写整条链，通常只覆写对应组件就够了。

## 性能配置

`RunSurface` 默认已经带了基础优化，但长聊天记录通常还会继续调这些：

```ts
const surface = {
  performance: {
    groupWindow: 80,
    groupWindowStep: 40,
    lazyMount: true,
    lazyMountMargin: '720px 0px',
    textSlabChars: 1600
  }
};
```

最常见的理解方式是：

- `groupWindow`: 一次挂载多少个 message group
- `groupWindowStep`: 滚动到底部时每次再加多少组
- `lazyMount`: 重型 block 先延迟挂载
- `textSlabChars`: 大段文本先切成较小渲染片段

## 一个建议

优先改 `surface`，不要急着改 protocol。

很多“看起来需要改协议”的需求，其实只是：

- 工具卡片换个组件
- user / assistant 外观换掉
- loading 换掉
- 消息操作栏开关调整

这些都属于 `RunSurface` 层。
