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
| `messageActions` | `RunSurfaceMessageActionsMap` | assistant 默认开启 | 配置消息末尾的复制、重试、重新生成等动作 |
| `approvalActions` | `RunSurfaceApprovalActionsOptions \| false` | 默认开启 | 配置 approval 卡片内部的批准、拒绝、需修改等动作 |

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

## Draft Devtools

如果你想直接看到“为什么这段内容还没 stable”，可以把 `RunSurfaceDraftOverlay` 挂在页面上：

```vue
<script setup lang="ts">
import {
  RunSurface,
  RunSurfaceDraftOverlay
} from 'agentdown';

defineProps<{
  runtime: AgentRuntime;
}>();
</script>

<template>
  <RunSurface :runtime="runtime" />

  <RunSurfaceDraftOverlay
    :runtime="runtime"
    title="Draft Devtools"
    :initially-open="true"
    :max-items="5"
  />
</template>
```

这个 overlay 会直接显示：

- 当前有多少个 draft block
- 每个 draft block 的 `data-draft-*` 元数据
- “为什么它还没 stable”的中文解释
- 可复制的 JSON 调试快照

适合的场景：

- 调试流式 table / code / html 为什么迟迟不稳定
- 和后端联调时确认当前尾部到底属于哪种语法草稿
- 收集最小复现信息，方便提 issue 或回归测试

### 程序化诊断

如果你不想显示 overlay，也可以直接用 devtools helper 读取诊断结果：

```ts
import { resolveRunSurfaceDraftDiagnostics } from 'agentdown';

// 直接把 runtime snapshot 整理成可展示、可导出的诊断结构。
const diagnostics = resolveRunSurfaceDraftDiagnostics(snapshot, {
  slot: 'main',
  previewChars: 120
});

console.log(diagnostics.summary.draftBlockCount);
console.log(diagnostics.diagnostics);
```

返回结果里会包含：

- `summary`
  当前 slot 下的 draft 汇总计数
- `diagnostics`
  每个 draft block 的详细解释、内容摘要和 DOM 属性快照

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

## message actions

`messageActions` 用来给 assistant / user / system 消息尾部挂操作按钮：

```ts
const surface = {
  messageActions: {
    assistant: {
      enabled: true,
      showWhileRunning: true,
      actions: [
        'copy',
        'interrupt',
        'resume',
        'retry',
        'regenerate'
      ],
      builtinHandlers: {
        interrupt: async () => {
          // 这里接你自己的暂停逻辑
        }
      }
    }
  }
};
```

内置消息动作 key：

- `copy`
- `regenerate`
- `retry`
- `resume`
- `interrupt`
- `like`
- `dislike`
- `share`

默认点击后会发出 `message.action` intent。  
如果你传了 `builtinHandlers`，就可以把这些按钮接到真实业务。

## approval actions

approval 卡片现在也可以直接挂动作：

```ts
const surface = {
  approvalActions: {
    enabled: true,
    builtinHandlers: {
      approve: async ({ runtime, block }) => {
        runtime.apply(cmd.approval.update({
          id: block.id,
          title: '是否发送客户邮件',
          status: 'approved'
        }));
      }
    }
  }
};
```

内置 approval 动作 key：

- `approve`
- `reject`
- `changes_requested`
- `submit`
- `retry`
- `resume`
- `interrupt`

默认 approval 卡片在 `RunSurface` 内点击按钮时会发出 `approval.action` intent。  
如果当前 approval 还是 `pending`，默认会显示 `approve / reject / changes_requested` 这三个动作。

## 相关导出

包入口还导出了这些默认实现，方便你做包裹式覆写：

- `DefaultRunSurfaceAssistantShell`
- `DefaultRunSurfaceUserBubble`
- `DefaultRunSurfaceToolRenderer`

如果你只想在默认样式外包一层自己的容器、埋点或主题色，优先复用这些组件会最省事。
