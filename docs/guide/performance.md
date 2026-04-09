---
title: 性能优化
description: 理解 Agentdown 在长文本、长会话和重型组件场景下的默认优化策略。
---

# 性能优化

Agentdown 从一开始就把性能当成主链能力，而不是事后补丁。

它默认假设你会遇到这些场景：

- assistant 持续流式输出长文本
- markdown 里混有表格、代码块、Mermaid、图片等重型 block
- 工具卡片、artifact、approval 等组件和文本混排
- 对话历史很长
- 长文档一次性渲染容易卡

## 文本性能主链

### 1. pretext 负责常见文本路径

常见标题、段落和 inline 富文本会优先走 `@chenglou/pretext`。

这能带来三件事：

- 宽度变化时布局更稳
- 长文本更新成本更低
- 阅读型内容滚动更顺

### 2. draft / stable 稳定化

流式 markdown 不会“每个 token 一到就全部重算并落地”。

对于还没闭合的结构，Agentdown 会先保留在 draft：

- table
- fenced code block
- math
- 某些复杂 HTML / markdown 结构

等结构稳定后再进入 stable。

### 3. text slab

超长文本会被拆成更小的片段，减少一次更新影响的范围。

```vue
<MarkdownRenderer
  :source="source"
  :performance="{
    textSlabChars: 1200
  }"
/>
```

### 4. markdown windowing

对离视口很远的 block 做窗口化，只保留附近真实挂载。

```vue
<MarkdownRenderer
  :source="source"
  :performance="{
    textSlabChars: 1200,
    virtualize: true,
    virtualizeMargin: '1400px 0px'
  }"
/>
```

## RunSurface 性能主链

### 1. group windowing

聊天界面不会一次把所有 group 都挂出来。

```vue
<RunSurface
  :runtime="runtime"
  :performance="{
    groupWindow: 80,
    groupWindowStep: 40
  }"
/>
```

### 2. heavy block lazy mount

工具卡片、artifact、Mermaid、复杂代码块这些重型内容，可以接近视口时再挂载。

```vue
<RunSurface
  :runtime="runtime"
  :performance="{
    lazyMount: true,
    lazyMountMargin: '720px 0px'
  }"
/>
```

### 3. 长会话文本 slab

聊天消息本身也支持 `textSlabChars`。

```vue
<RunSurface
  :runtime="runtime"
  :performance="{
    textSlabChars: 1600
  }"
/>
```

## 推荐配置

### 长文档阅读

```ts
{
  textSlabChars: 1200,
  virtualize: true,
  virtualizeMargin: '1400px 0px'
}
```

### 聊天式运行界面

```ts
{
  groupWindow: 80,
  groupWindowStep: 40,
  lazyMount: true,
  lazyMountMargin: '720px 0px',
  textSlabChars: 1600
}
```

## 怎么验证优化有没有生效

### `MarkdownRenderer` 的 `@telemetry`

```vue
<MarkdownRenderer
  :source="source"
  :performance="{
    textSlabChars: 1200,
    virtualize: true,
    virtualizeMargin: '1400px 0px'
  }"
  @telemetry="snapshot => {
    console.log(snapshot.mountedBlockCount, snapshot.renderableBlockCount);
  }"
/>
```

最值得关注的是：

- `renderableBlockCount`
- `mountedBlockCount`
- `viewportSyncPasses`
- `windowRangeChangeCount`

### 内置性能实验室 demo

仓库里的 demo 已经提供性能实验室，可以直接看：

- DOM 数量
- 挂载 block 数
- 首轮渲染时间
- 滚动巡检结果

## 一个建议

先用默认值，真的遇到长文本或长会话再调。

Agentdown 的默认配置已经覆盖了多数中等规模页面，不需要一上来就把所有性能开关都拧满。
