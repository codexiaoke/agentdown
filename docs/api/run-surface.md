---
title: RunSurface 与 Chat Workspace
description: RunSurface、AgentChatWorkspace、ArchiveSurface 的主要 props、插槽和滚动行为。
---

# RunSurface 与 Chat Workspace

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

## `AgentChatWorkspace`

`AgentChatWorkspace` 是更上层的聊天页面组件，本质上是：

```text
RunSurface + AgentChatComposer + follow-bottom scroll UX + floating panel + file preview pane
```

如果你要做完整聊天页，通常优先从这里开始，而不是自己拼一层布局。

### 最小用法

```vue
<AgentChatWorkspace
  :runtime="session.runtime"
  :surface="session.surface"
  v-model="prompt"
  :busy="session.busy"
  :awaiting-human-input="session.awaitingHumanInput"
  :transport-error="session.transportError"
  @send="(payload) => session.send(payload.input)"
/>
```

### 主要 props

| Prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `runtime` | `AgentRuntime` | 必填 | 当前聊天工作区绑定的 runtime |
| `surface` | `RunSurfaceOptions` | `{}` | 直接透传给内部 `RunSurface` |
| `modelValue` | `string` | `''` | 输入框当前文本 |
| `uploads` | `AgentChatPendingAttachment[]` | `[]` | 当前待发送附件 |
| `busy` | `boolean` | `false` | 请求中；会锁输入区并驱动默认 loading tail |
| `awaitingHumanInput` | `boolean` | `false` | 等待人工确认时禁用输入 |
| `transportError` | `string` | `''` | 顶部 notice 错误文案 |
| `placeholder` | `string` | 内置默认 | 输入框 placeholder |
| `suggestions` | `string[]` | `[]` | 空态提示集 |
| `uploadFile` | `AgentChatUploadResolver` | - | 文件上传解析回调，最少返回 `fileId` |
| `accept` | `string` | `''` | 透传给文件选择器的 accept |
| `multiple` | `boolean` | `true` | 是否允许一次选择多个文件 |
| `panelOpen` | `boolean` | `false` | 右侧浮动面板是否展开 |
| `panelTitle` | `string` | `''` | 右侧浮动面板标题 |
| `panelWidth` | `number \| string` | `320` | 右侧浮动面板宽度 |
| `filePreviewStrategy` | `'panel' \| 'overlay'` | `'panel'` | 文件 / artifact 预览是走右侧工作区预览，还是走 overlay |
| `filePreviewPanelWidth` | `number \| string` | `clamp(520px, 44%, 860px)` | 右侧文件预览栏宽度 |
| `autoScroll` | `boolean` | `true` | 是否自动跟随到底部 |
| `initialScrollToBottom` | `boolean` | `true` | 首次挂载 / 回放恢复时是否直接同步到底部 |
| `initialScrollReveal` | `'immediate' \| 'after-sync'` | `'after-sync'` | 首次定位时何时显示滚动区 |
| `initialScrollSyncDelays` | `number[]` | `[80, 180, 360]` | 首次定位的额外同步延迟 |
| `showScrollToBottomButton` | `boolean` | `true` | 是否显示默认悬浮回底按钮 |

### 默认行为

- 首次挂载、刷新或回放恢复时，会尽量直接停在底部，而不是先渲染顶部再滚下来
- 用户手动滚离底部之后，不会再被强制拉回到底部
- 脱离底部期间如果有新内容进入，会出现悬浮回底按钮和未读提示点
- 请求已经发出但对话区还没追加新内容时，默认 `conversation-tail` 会显示 3 个 loading dots
- 在 `AgentChatWorkspace` 里点击内置附件卡片和 artifact 卡片时，默认会打开右侧预览栏
- 图片、Markdown、JSON 和常见文本文件会直接在线预览；不支持的类型会保留新窗口打开
- `@send` 收到的 `payload.input` 已经把文本与附件合并好了，可以直接传给 `session.send(payload.input)`

### 插槽

| Slot | 说明 |
| --- | --- |
| `header` | 聊天区顶部自定义区域 |
| `notice` | 顶部 notice，默认显示 transport error / awaiting human input |
| `empty` | 空会话态 |
| `conversation-tail` | 覆写默认 loading dots |
| `scroll-to-bottom` | 覆写悬浮回底按钮；插槽参数包含 `visible`、`unread`、`followBottom`、`scrollToBottom` |
| `composer` | 直接替换整个输入区 |
| `upload-trigger-icon` | 覆写上传按钮图标 |
| `attachment` | 覆写附件渲染 |
| `send-icon` | 覆写发送按钮图标 |
| `disclaimer` | 覆写底部 AI 提示 |
| `panel-header` / `panel` / `panel-footer` | 右侧浮动面板 |

### 文件预览

`AgentChatWorkspace` 的内置附件卡片和 artifact 卡片，会自动读取工作区上下文：

- 默认 `filePreviewStrategy="panel"` 时，预览会在右侧工作区展开
- 当你传 `filePreviewStrategy="overlay"` 时，会退回 overlay / lightbox 行为
- `filePreviewPanelWidth` 可以直接调右侧预览栏宽度

```vue
<AgentChatWorkspace
  :runtime="session.runtime"
  :surface="session.surface"
  file-preview-strategy="panel"
  file-preview-panel-width="clamp(560px, 46%, 920px)"
  @send="(payload) => session.send(payload.input)"
/>
```

### 暴露的 ref API

```ts
import { ref } from 'vue';
import type { AgentChatWorkspaceExposed } from 'agentdown';

const workspaceRef = ref<AgentChatWorkspaceExposed | null>(null);

workspaceRef.value?.scrollToBottom('smooth');
workspaceRef.value?.scheduleScrollToBottom();
workspaceRef.value?.scheduleInitialBottomSync();
```

暴露状态：

- `followBottom`
- `showScrollToBottom`
- `scrollToBottomHasUnread`

## `AgentdownRenderArchiveSurface`

`AgentdownRenderArchiveSurface` 用来直接把一份 archive / records JSON 恢复成可渲染的聊天界面。

### 最小用法

```vue
<AgentdownRenderArchiveSurface :input="archive" />
```

### 主要 props

| Prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `input` | `string \| AgentdownRenderArchive \| AgentdownRenderRecord[]` | 必填 | archive JSON、records 数组或其字符串形式 |
| `adapter` | `AgentdownRecordsAdapter` | 内置默认 | 当后端 records 结构不是内置推荐格式时使用 |
| `runtime` | `AgentRuntime` | 内部新建 | 可选复用一个已有 runtime |
| `resetOnChange` | `boolean` | `true` | 输入变化时是否先清空 runtime |

### 相关组合式 API

- `useAgentdownRenderArchive()`
- `restoreAgentdownRenderArchive()`
- `defineAgentdownRecordsAdapter()`

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
