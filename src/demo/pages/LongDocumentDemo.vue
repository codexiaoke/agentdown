<script setup lang="ts">
import { MarkdownRenderer } from '../../index';
import BuiltinAguiCard from '../components/BuiltinAguiCard.vue';

/**
 * 长文档 demo 页面里展示的语法标签。
 */
const syntaxChips = [
  'h1-h6',
  'setext',
  'paragraph',
  'inline',
  'blockquote',
  'list',
  'hr',
  'table',
  'code',
  'mermaid',
  'math',
  'html',
  'thought',
  'agui',
  'artifact',
  'approval',
  'attachment',
  'branch',
  'handoff',
  'timeline'
];

/**
 * markdown 文本块使用的展示字体。
 */
const markdownFont = '400 16px "Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif';

/**
 * 提供给 `:::vue-component` 指令使用的组件映射表。
 */
const aguiComponents = {
  DemoBuiltinCard: BuiltinAguiCard
};

/**
 * 长文档头图资源。
 */
const heroImageSrc = '/long-document-hero.svg';

/**
 * 生成一段适合测试长文滚动和 pretext 排版的纯文本段落。
 */
function createLongPlainParagraph(index: number): string {
  return [
    `第 ${index} 段用于测试长文档阅读体验。`,
    '这一段故意保持纯文本，不混入链接、强调或图片，方便 text block 继续走 pretext 布局主链。',
    '当页面里同时存在长段落、表格、代码块、Mermaid 和 AGUI 卡片时，我们希望浏览器仍然保持顺滑，而不是因为单一大块内容频繁重排而卡顿。',
    '这也是 Agentdown 在 V1 里优先做 streaming draft、stable block、lazy mount 和 slabization 的原因。'
  ].join('');
}

/**
 * 生成一组重复章节，专门拉长页面以便观察长文滚动表现。
 */
function createLongReadingSections(): string {
  return Array.from({ length: 8 }, (_, index) => {
    const sectionNumber = index + 1;

    return [
      `## 长文阅读章节 ${String(sectionNumber).padStart(2, '0')}`,
      '',
      createLongPlainParagraph(sectionNumber * 2 - 1),
      '',
      createLongPlainParagraph(sectionNumber * 2),
      '',
      '> 这一小段引用用于打断阅读节奏，也方便观察复杂 HTML block 混在长文本里的间距表现。',
      '',
      `- 章节 ${sectionNumber} 要点一：保持滚动顺滑`,
      `- 章节 ${sectionNumber} 要点二：长文和组件混排`,
      `- 章节 ${sectionNumber} 要点三：让 markdown 既能读也能交互`,
      '',
      '---',
      ''
    ].join('\n');
  }).join('\n');
}

/**
 * 组装整页长文档 markdown 内容。
 */
function createLongDocumentSource(): string {
  return `
# Agentdown 长文档总览 Demo

这是一个专门用于查看“长文阅读 + 复杂 markdown + Agentdown 扩展块”混排效果的页面。  
这一页会尽量覆盖 **当前支持的常用 Markdown 语法**，以及 \`thought / agui / artifact / approval / attachment / branch / handoff / timeline\` 这些扩展块。

![Agentdown Long Demo](${heroImageSrc})

> 这一页不是只为了好看，它更像一份“渲染能力体检表”。  
> 你可以用它检查标题层级、段落排版、复杂 HTML 回退、表格、代码块、图表、公式和 AGUI 卡片在同一篇长文里的表现。

## 目录预览

1. 标题层级
2. 行内语法
3. 引用、列表、分割线
4. 表格与代码
5. Mermaid、数学公式、原生 HTML
6. Agentdown 扩展块
7. 长文阅读测试

---

## 标题层级

### ATX Heading

#### 四级标题示例

##### 五级标题示例

###### 六级标题示例

Setext 一级标题
=============

Setext 二级标题
-------------

这一段是一个普通纯文本段落，用来确认标题之后的默认排版间距是否自然，尤其是在长文档阅读时，标题和正文之间不应该显得拥挤或失衡。

## 行内语法

这一段会故意混入 **粗体**、*斜体*、~~删除线~~、[链接](https://github.com/codexiaoke/agentdown)、\`inline code\` 和一张行内图片。前面这些常见 inline 语义仍然可以继续走 pretext，只有图片这类复杂结构才会把整段带回 HTML block。

如果你继续写第二段纯文本，它依旧会稳定落在 text block 的路径，这种拆分方式可以同时兼顾阅读性能和富文本表达。

## 引用、列表与分割线

> 一级引用说明当前正在演示 blockquote。
>
> > 这里是二级引用，用来检查嵌套引用的缩进与边框表现。
>
> 引用内部同样可以继续书写内容。

- 无序列表第一项
- 无序列表第二项
  - 嵌套子项 A
  - 嵌套子项 B，里面还可以带 \`inline code\`
- 无序列表第三项

1. 有序列表第一项
2. 有序列表第二项
3. 有序列表第三项

---

## 表格

| 语法 | 说明 | 当前在 Agentdown 中的落点 |
| :--- | :--- | :--- |
| heading | 标题层级 | 纯文本 heading 会优先走 text block |
| paragraph | 段落 | 纯文本段落优先走 text block |
| list | 列表 | 当前统一回退成 html block |
| blockquote | 引用 | 当前统一回退成 html block |
| table | 表格 | 当前统一回退成 html block |
| code fence | 代码块 | 单独走 code block |
| mermaid fence | 图表 | 单独走 mermaid block |
| math block | 公式 | 单独走 math block |

## 代码块

\`\`\`ts
import { createBridge, createMarkdownAssembler } from 'agentdown';

const bridge = createBridge({
  runtime,
  protocol,
  assemblers: {
    markdown: createMarkdownAssembler()
  }
});
\`\`\`

\`\`\`bash
pnpm install
pnpm run dev
pnpm run build
\`\`\`

\`\`\`json
{
  "event": "ToolCompleted",
  "id": "tool:weather",
  "content": {
    "city": "北京",
    "condition": "晴",
    "tempC": 26
  }
}
\`\`\`

    const legacyIndentedCode = true;
    console.log('indented code block still works');

## Mermaid 图表

\`\`\`mermaid
flowchart TD
  User["User Message"] --> Protocol["Protocol Mapping"]
  Protocol --> Bridge["Bridge Batch + Flush"]
  Bridge --> Assembler["Markdown Assembler"]
  Assembler --> Runtime["Runtime Snapshot"]
  Runtime --> Surface["RunSurface / MarkdownRenderer"]
\`\`\`

## 数学公式

$$
f(x) = \\int_{-\\infty}^{\\infty} \\hat{f}(\\xi) e^{2 \\pi i \\xi x} d\\xi
$$

## 原生 HTML

<details open>
  <summary>展开查看原生 HTML 片段</summary>
  <p>这里故意使用原生 <code>details</code> 和 <code>summary</code>，用于演示 html block 的兜底能力。</p>
  <p>你也可以在这里放 <kbd>Cmd</kbd> + <kbd>K</kbd> 这类标签，或者任何业务需要的静态 HTML。</p>
</details>

<div style="margin-top: 16px; padding: 16px 18px; border: 1px solid #e2e8f0; border-radius: 16px; background: linear-gradient(180deg, #ffffff, #f8fafc);">
  <strong style="display:block; margin-bottom: 8px;">HTML Block Note</strong>
  <p style="margin: 0; line-height: 1.8;">当前这块内容直接以原生 HTML 的形式进入渲染链，适合处理 markdown-it token 难以优雅抽象的结构。</p>
</div>

## Agentdown 扩展块

### Thought

:::thought
这里是 \`:::thought\` 指令，它本质上不是普通 markdown 文档语法，而是 Agentdown 的扩展 block。

- 可以折叠
- 可以继续嵌套 markdown
- 适合放思考过程、阶段说明或中间分析

\`\`\`ts
const idea = '先把复杂结构收敛成 block，再交给 Vue 渲染';
\`\`\`
:::

### AGUI Component

:::vue-component DemoBuiltinCard {"title":"内嵌 AGUI 组件","summary":"这个卡片直接嵌在长文档中，不需要你再手动拼模板。","detail":"你可以继续把它升级成真正的工具调用卡片、审批面板、文件预览或者任何业务组件。","buttonText":"展开组件"}

### Artifact

:::artifact title="季度分析报告" artifact-id="artifact:q2-report" kind="report" label="q2-report.md" href="https://example.com/q2-report" message="这里模拟一份可以继续打开或下载的产物。"

### Approval

:::approval title="是否发布到生产环境" approval-id="approval:release-long-doc" status="pending" message="这是一条演示用审批块，用来确认审批卡片在长文档里的视觉表现。"

### Attachment

:::attachment title="客户补充附件" attachment-id="file:release-notes" kind="file" label="release-notes.pdf" size-text="860 KB" message="用户输入也可以是结构化附件，不必退回成一段纯文本描述。"

### Branch

:::branch title="修订分支" branch-id="branch:release-revision" source-run-id="run:release-main" target-run-id="run:release-revision" status="running" label="release-revision" message="当审批意见要求修改时，可以在长文和聊天页面里都用同一类 branch block 表达。"

### Handoff

:::handoff title="人工交接" handoff-id="handoff:release-review" target-type="team" assignee="发布团队" status="pending" message="handoff block 用来表达当前工作已经交给谁继续处理。"

### Timeline

:::timeline title="运行时间线占位" limit="6" empty-text="这里是 timeline 的静态演示位，真正的运行时间线更适合放在 RunSurface 里。"

## 长文阅读测试

${createLongReadingSections()}

## 最后一节

如果你滚到了这里，说明这页已经足够长，可以拿来测试：

- 长文滚动是否顺滑
- 标题层级是否清晰
- text block 与 html/code/mermaid/math/agui 混排是否自然
- 默认样式在真实阅读场景下是否克制

这也是这页存在的意义：它不只是“语法大全”，而是 Agentdown 当前文档型阅读体验的综合测试页。
`.trim();
}

/**
 * 当前长文档 demo 的 markdown 内容。
 */
const source = createLongDocumentSource();
</script>

<template>
  <section class="demo-page">
    <header class="demo-page__header">
      <h1>长文档 Markdown Demo</h1>
      <p>一页覆盖当前支持的常用 Markdown + Agentdown 扩展语法，同时拉长内容，方便测试真实阅读和混排效果。</p>
    </header>

    <div class="demo-page__chips">
      <span
        v-for="chip in syntaxChips"
        :key="chip"
      >
        {{ chip }}
      </span>
    </div>

    <section class="demo-page__document">
      <p class="demo-page__warning">
        这一页为了演示原生 HTML，显式开启了 <code>allowUnsafeHtml</code>。这只适合本地可信内容，不适合直接渲染用户输入。
      </p>

      <p class="demo-page__note">
        当前标题、普通段落以及包含粗体、斜体、删除线、链接、行内代码的常见 inline 文本，都会继续走 <code>@chenglou/pretext</code>。这一页还显式开启了长文档 <code>text slab + viewport virtualize</code>，避免一次性把所有 block 都挂进 DOM。
      </p>

      <MarkdownRenderer
        :source="source"
        :font="markdownFont"
        :line-height="26"
        :allow-unsafe-html="true"
        :agui-components="aguiComponents"
        :performance="{
          mode: 'window',
          textSlabChars: 1200,
          virtualize: true,
          virtualizeMargin: '1400px 0px'
        }"
      />
    </section>
  </section>
</template>

<style scoped>
.demo-page {
  max-width: 980px;
  margin: 0 auto;
  padding: 44px 24px 96px;
}

.demo-page__header h1,
.demo-page__header p {
  margin: 0;
}

.demo-page__header h1 {
  font-size: 30px;
  letter-spacing: -0.05em;
}

.demo-page__header p {
  margin-top: 10px;
  color: #64748b;
  line-height: 1.8;
}

.demo-page__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.demo-page__chips span {
  border-radius: 999px;
  padding: 6px 10px;
  background: #eef2f7;
  color: #475569;
  font-size: 12px;
}

.demo-page__document {
  margin-top: 26px;
  border: 1px solid #e5e7eb;
  border-radius: 24px;
  padding: 28px 24px 36px;
  background: #ffffff;
}

.demo-page__warning {
  margin: 0 0 20px;
  border: 1px solid #fcd34d;
  border-radius: 16px;
  padding: 12px 14px;
  background: #fffbeb;
  color: #92400e;
  line-height: 1.8;
}

.demo-page__warning code {
  border: 1px solid rgba(146, 64, 14, 0.16);
  border-radius: 8px;
  padding: 0.1rem 0.34rem;
  background: rgba(255, 255, 255, 0.68);
}

.demo-page__note {
  margin: 0 0 20px;
  border: 1px solid #dbeafe;
  border-radius: 16px;
  padding: 12px 14px;
  background: #f8fbff;
  color: #1e3a8a;
  line-height: 1.8;
}

.demo-page__note code {
  border: 1px solid rgba(30, 58, 138, 0.12);
  border-radius: 8px;
  padding: 0.1rem 0.34rem;
  background: rgba(255, 255, 255, 0.7);
}

@media (max-width: 720px) {
  .demo-page {
    padding: 24px 16px 56px;
  }

  .demo-page__document {
    border-radius: 18px;
    padding: 20px 16px 28px;
  }
}
</style>
