<script setup lang="ts">
import DemoApprovalCard from './DemoApprovalCard.vue';
import { MarkdownRenderer } from '../index';

const source = `# Vue Pretext Markdown

这个项目的首版目标，是先把 **Vue 3 + Vite + TypeScript + npm 发布** 的基础能力搭起来。

:::thought
这里可以放 LLM 的思考过程、推理日志，或者任何你希望默认折叠的说明内容。
展开之后，内部仍然继续走 markdown 渲染流程。
:::

## 代码块

\`\`\`ts
export function createMessage(name: string) {
  return \`hello, \${name}\`;
}
\`\`\`

## 数学公式

$$
\\int_0^1 x^2 dx = \\frac{1}{3}
$$

## AGUI

:::vue-component DemoApprovalCard {"id": 42, "status": "pending"}

- 普通列表、引用、表格等复杂块，现在会自动回退到 HTML 渲染。
- 纯文本段落和标题则优先走 pretext 行布局。
`;

const aguiComponents = {
  DemoApprovalCard: {
    component: DemoApprovalCard,
    minHeight: 96
  }
};
</script>

<template>
  <main class="demo-shell">
    <section class="demo-hero">
      <p class="demo-eyebrow">Open Source Library</p>
      <h1>Vue Pretext Markdown</h1>
      <p class="demo-summary">
        一个面向 AI 长文本、流式输出和 Agentic UI 的 Vue 3 Markdown 渲染库骨架。
      </p>
    </section>

    <section class="demo-panel">
      <MarkdownRenderer
        :source="source"
        :agui-components="aguiComponents"
      />
    </section>
  </main>
</template>

<style scoped>
.demo-shell {
  min-height: 100vh;
  padding: 4rem 1.25rem 5rem;
  background:
    radial-gradient(circle at top, rgba(18, 76, 90, 0.16), transparent 32%),
    linear-gradient(180deg, #f2ede0 0%, #f7f5ef 38%, #f4f1e8 100%);
  color: #18212f;
}

.demo-hero,
.demo-panel {
  width: min(960px, 100%);
  margin: 0 auto;
}

.demo-hero {
  margin-bottom: 2rem;
}

.demo-eyebrow {
  margin: 0 0 0.75rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #124c5a;
  font-size: 0.78rem;
  font-weight: 700;
}

.demo-hero h1 {
  margin: 0;
  font-size: clamp(2.7rem, 7vw, 5.5rem);
  line-height: 0.95;
  letter-spacing: -0.05em;
}

.demo-summary {
  width: min(620px, 100%);
  margin: 1rem 0 0;
  font-size: 1.06rem;
  line-height: 1.75;
  color: #40505e;
}

.demo-panel {
  padding: 1.4rem;
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(14px);
  box-shadow: 0 24px 80px rgba(24, 33, 47, 0.08);
}

@media (max-width: 640px) {
  .demo-shell {
    padding-top: 2.25rem;
  }

  .demo-panel {
    padding: 1rem;
    border-radius: 20px;
  }
}
</style>
