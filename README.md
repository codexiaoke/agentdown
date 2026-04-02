# vue-pretext-markdown

`vue-pretext-markdown` 是一个面向 Vue 3 的 Markdown 渲染库骨架，目标是把 `markdown-it` 的结构化解析能力和 `@chenglou/pretext` 的高性能文本布局能力结合起来，服务 AI 长文本、流式输出和 Agentic UI 场景。

## 当前首版包含什么

- `Vue 3 + Vite + TypeScript` 的 npm 库工程
- `MarkdownRenderer` 组件
- `@chenglou/pretext` 纯文本段落/标题布局
- `markdown-it` 解析链路
- `:::thought` 折叠块
- `:::vue-component ComponentName {...}` AGUI 组件注入
- `Shiki` 代码高亮
- `KaTeX` 块级公式渲染
- 本地 demo 页面

## 安装

```bash
npm install vue-pretext-markdown
```

```ts
import { MarkdownRenderer } from 'vue-pretext-markdown';
import 'vue-pretext-markdown/style.css';
import 'katex/dist/katex.min.css';
```

## 使用

```vue
<script setup lang="ts">
import { MarkdownRenderer } from 'vue-pretext-markdown';
import 'vue-pretext-markdown/style.css';
import 'katex/dist/katex.min.css';

const source = `
# Hello

:::thought
这是可以折叠的思考过程。
:::

:::vue-component ApprovalCard {"id": 1, "status": "pending"}
`;

const aguiComponents = {
  ApprovalCard: {
    component: ApprovalCard,
    minHeight: 96
  }
};
</script>

<template>
  <MarkdownRenderer
    :source="source"
    :agui-components="aguiComponents"
  />
</template>
```

## AGUI 语法

```md
:::vue-component ApprovalCard {"id": 1, "status": "pending"}
```

也支持简单的 key-value 形式：

```md
:::vue-component ApprovalCard id=1 status="pending"
```

## 设计约束

- 纯文本段落和标题优先走 `pretext`
- 含有复杂行内标记的块会先回退到 HTML 渲染
- 复杂块元素如列表、引用、表格目前也先回退到 HTML 渲染
- AGUI 当前首版支持块级组件注入

## 开发

```bash
npm install
npm run dev
```

## 后续路线

1. 把更多 Markdown block 和 inline token 接入精细化布局树。
2. 增加流式输出优化和增量布局。
3. 引入虚拟滚动和更完整的主题系统。
4. 补齐测试、文档站和 CI 发布流程。
