---
title: Streaming 组装
description: 理解 stream.open / delta / close、assembler 和批量 flush 在 Agentdown 里的职责。
---

# Streaming 组装

流式输出最难的地方，不是“怎么把 token 拼起来”，而是“什么时候该渲染、什么时候该先忍住”。

Agentdown 把这件事放进 assembler 里处理。

## 基础命令

```ts
cmd.stream.open({
  streamId: 'stream:answer',
  slot: 'main',
  assembler: 'markdown'
})

cmd.stream.delta('stream:answer', '我来为你查询天气')
cmd.stream.close('stream:answer')
```

## 当前内置 assembler

- `createMarkdownAssembler()`
- `createPlainTextAssembler()`

## `createPlainTextAssembler()`

纯文本 assembler 的策略最直接：

1. `open` 时创建一个 `draft` block
2. `delta` 时不断追加 `content`
3. `close` 时把它标记成 `stable`

适合：

- 简单 token 流
- 结构稳定的普通文本
- 不需要 markdown 解析的输出

## `createMarkdownAssembler()`

markdown assembler 会先维护一个尾部草稿：

1. `open` 时插入一个 `draft` markdown block
2. `delta` 时持续更新草稿内容
3. 只把“已经结构稳定的前缀”解析成 stable block，并插到当前 draft 之前
4. 尚未稳定的尾巴继续保留为单个 draft
5. `close` 时再 finalize 剩余尾部

这样做的原因是：

- table 需要表头完整后再渲染
- fenced code block 需要结束 fence 后再稳定
- Mermaid、公式、复杂 HTML 也更适合在结构闭合后渲染
- 普通段落、列表、blockquote、setext heading 这类结构也会尽量在边界明确后再稳定提交

## 为什么需要 `draft` / `stable`

这是为了让 UI 在“尽快响应”和“不要提前乱码”之间有一个更自然的平衡。

- `draft` block 适合尾部进行中内容
- `stable` block 适合已经闭合、可安全展示的内容

当前 draft 还会根据尾部内容自动切换展示模式：

- `text`
- `preview`
- `hidden`

这样列表、blockquote、表格表头、未闭合代码块等场景会更自然。

## Bridge 的批量 flush 做什么

`createBridge()` 不会强制每来一个 token 就立刻触发一次 runtime 更新。  
它可以把多条命令攒在一起，再统一 flush，减少渲染抖动。

## 自定义 assembler 适合什么场景

如果你的后端不是普通 markdown token，而是更结构化的片段流，例如：

- JSON patch
- 表格行流
- 代码解释器输出
- 富文本 AST 片段

那你可以自己实现 `StreamAssembler`，把它们变成更适合前端消费的 block 更新。
