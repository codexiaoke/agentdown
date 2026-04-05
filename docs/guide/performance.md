---
title: 性能优化
description: 理解 Agentdown 在长文本、长会话和重型组件场景下的内置性能策略，以及如何观测和调优。
---

# 性能优化

Agentdown 不是把性能当成事后补丁，而是把它当成主链设计的一部分。

它默认假设你会遇到这些场景：

- assistant 持续流式输出长文本
- markdown 里混有表格、代码块、Mermaid、图片等重型 block
- 工具卡片、artifact、approval 等组件和文本混排
- 对话历史很长
- 长文档一次性渲染容易卡

## 文本性能主链

### 1. pretext 负责常见文本路径

当前标题、普通段落，以及包含粗体、斜体、删除线、链接、行内代码的常见 inline 富文本，都会优先走 `@chenglou/pretext`。

这意味着：

- 常见阅读文本不必走整段 `innerHTML`
- 宽度变化时的布局路径更稳定
- 大段文本滚动和更新时更容易收敛

### 2. streaming draft/stable 稳定化

Agentdown 不会强迫每个 token 一到就立刻把所有 markdown 结构渲染出来。  
对于还没闭合的结构，会优先保留在 draft，等结构稳定后再变成 stable block。

这对下面这些内容特别重要：

- table
- fenced code block
- math
- 一些需要完整上下文才能稳定显示的复杂 markdown

### 3. text slabization

对于非常长的文本块，可以把一个超长 block 拆成多个较小的 text slab，减少一次 patch 影响的范围。

```vue
<MarkdownRenderer
  :source="source"
  :performance="{
    // 超长段落会被切成更小的 text slab。
    textSlabChars: 1200
  }"
/>
```

### 4. viewport virtualize

对离视口很远的 block 做窗口化，只保留当前可见范围附近的真实挂载。

```vue
<MarkdownRenderer
  :source="source"
  :performance="{
    // 先对超长文本做分段。
    textSlabChars: 1200,
    // 只保留视口附近的真实挂载 block。
    virtualize: true,
    // 视口上下各预热一段距离，减少滚动时闪现。
    virtualizeMargin: '1400px 0px'
  }"
/>
```

## RunSurface 性能主链

### 1. group windowing

聊天界面不是一次把所有 group 都挂载出来，而是先渲染一个窗口。

```vue
<RunSurface
  :runtime="runtime"
  :performance="{
    // 先只渲染一部分消息 group。
    groupWindow: 80,
    // 用户继续浏览时，再按批次展开更多 group。
    groupWindowStep: 40
  }"
/>
```

### 2. heavy block lazy mount

对工具卡片、artifact、approval、复杂 markdown block 等成本更高的内容，可以延迟挂载。

```vue
<RunSurface
  :runtime="runtime"
  :performance="{
    // 重型 block 延迟到接近视口时再挂载。
    lazyMount: true,
    lazyMountMargin: '720px 0px'
  }"
/>
```

### 3. 长会话下的文本 slab

`RunSurface` 内部也支持 `textSlabChars`，用于收敛大段消息的渲染压力。

```vue
<RunSurface
  :runtime="runtime"
  :performance="{
    // 把超长消息拆成更小的文本片段。
    textSlabChars: 1600
  }"
/>
```

## 推荐配置

### Markdown 长文档

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

## 如何验证优化有没有生效

### 1. 用 `@telemetry`

`MarkdownRenderer` 会抛出实时遥测：

```vue
<MarkdownRenderer
  :source="source"
  :performance="{
    // 这是当前推荐的长文配置。
    textSlabChars: 1200,
    virtualize: true,
    virtualizeMargin: '1400px 0px'
  }"
  @telemetry="snapshot => {
    // 这里最适合观察“真实挂载数量 / 总 block 数量”的变化。
    console.log(snapshot.mountedBlockCount, snapshot.renderableBlockCount);
  }"
/>
```

你最关心的通常是：

- `renderableBlockCount`
- `mountedBlockCount`
- `mountedStartIndex`
- `mountedEndIndex`
- `viewportSyncPasses`
- `windowRangeChangeCount`

### 2. 用内置性能实验室

demo 里已经提供“性能实验室”页面，支持：

- 生成大文档和超大文档
- 切换性能预设
- 导出 benchmark JSON
- 复制 baseline / diff
- 做滚动巡检

这对真实优化很重要，因为你可以拿 JSON 前后对比，而不是只靠体感。

### 3. 用 Chrome DevTools

推荐再配合看：

- Performance 面板
- Main 线程耗时
- Recalculate Style / Layout
- Memory 的趋势变化

## 当前参考数据

以下数据来自当前仓库内置性能实验室、优化预设、Chrome 146、macOS 的一组参考采样：

### 大文档

- `84,610` 字符
- `963` 个 renderable block
- 首轮稳定耗时约 `124ms ~ 151ms`
- 常驻挂载 block 约 `24`
- 滚动巡检峰值挂载 block 约 `51 ~ 55`

### 超大文档

- `169,870` 字符
- `1,923` 个 renderable block
- 首轮稳定耗时约 `223ms ~ 280ms`
- 常驻挂载 block 约 `24`
- 滚动巡检峰值挂载 block 约 `53 ~ 56`

这些数字不是保证值，但说明当前：

- 窗口化确实生效了
- 常驻 DOM 规模被明显压住了
- 长文档渲染已经具备可观测、可调优的基础

## 为什么 JS Heap 会波动

浏览器的 JS Heap 本来就会随着：

- GC 回收
- DevTools 开关
- 当前页面滚动位置
- 图片、Mermaid、代码高亮等资源释放与重新创建

发生变化。

所以 Agentdown 性能实验室不会只看单次瞬时值，而是尽量用多次采样的中位数去看趋势。

## 调优建议

### 如果页面是长文阅读

- 优先开 `virtualize`
- 把 `textSlabChars` 收敛到 `800 ~ 1600`
- 不要让所有 block 一次性真实挂载

### 如果页面是聊天界面

- 优先开 `groupWindow`
- 重型 block 开 `lazyMount`
- assistant 长消息保留 `textSlabChars`

### 如果页面混有很多工具卡片

- 把工具卡片保持为独立 block
- 不要把复杂结构塞回一整段 markdown/HTML
- 让工具卡片走 `renderer` 和 `data` 更新

## 相关文档

- [RunSurface](/api/run-surface)
- [MarkdownRenderer](/api/renderer)
- [Runtime 概览](/runtime/overview)
