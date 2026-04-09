<script setup lang="ts">
import { computed, ref } from 'vue';
import { MarkdownRenderer } from '../../index';
import { parseMarkdown } from '../../core/parseMarkdown';

const markdownFont = '400 16px "Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif';
const previewWidth = ref(680);

const pretextOnlySource = `
# 这是 h1 标题

## 这是 h2 标题

### 这是 h3 标题

这是一段普通正文，它会走 pretext。这里故意放一点更长的中文内容，让你在拖动下面宽度时，更容易看到重新排版后的行分布变化。

这一段同时包含 **粗体**、*斜体*、~~删除线~~、[链接](https://example.com) 和 \`inline code\`，这些都仍然属于 text block，所以也会继续走 pretext 的 rich text 布局链。

中英文混排也会走 pretext：Agentdown uses pretext for headings and paragraph text, so this line should also keep smooth wrapping when the container width changes.

#### h4 也一样

##### h5 也一样

###### h6 也一样

最后再来一段普通正文，专门用来观察窄宽度下的换行效果。因为这里没有列表、表格、代码块、mermaid 和 html，所以这一整块内容都会命中 pretext。
`;

/**
 * 用更直观的文案告诉用户当前预览区宽度。
 */
const previewWidthLabel = computed(() => `${previewWidth.value}px`);

/**
 * 直接解析当前 demo 源码，方便在页面上证明这些块的类型确实是 text。
 * 宽度变化只会触发 pretext 重新 layout，不会改变这里的 block 结果。
 */
const parsedBlocks = computed(() => {
  return parseMarkdown(pretextOnlySource, {
    allowUnsafeHtml: false
  });
});

/**
 * 汇总当前 demo 中命中 text block 的数量。
 */
const parsedBlockSummary = computed(() => {
  const textCount = parsedBlocks.value.filter((block) => block.kind === 'text').length;
  const htmlCount = parsedBlocks.value.filter((block) => block.kind === 'html').length;

  return {
    total: parsedBlocks.value.length,
    textCount,
    htmlCount
  };
});
</script>

<template>
  <section class="demo-page">
    <header class="demo-page__header">
      <h1>Pretext 命中演示</h1>
      <p>这个页面只放会命中 pretext 的内容：标题、普通段落，以及段落里的粗体、斜体、删除线、链接、行内代码。</p>
    </header>

    <div class="demo-page__chips">
      <span>h1-h6</span>
      <span>paragraph</span>
      <span>strong</span>
      <span>em</span>
      <span>del</span>
      <span>link</span>
      <span>inline code</span>
    </div>

    <section class="demo-panel">
      <div class="demo-panel__head">
        <div>
          <span>Section 01</span>
          <h2>只包含 text block</h2>
          <p>下面这一整块没有列表、表格、代码块或 html fallback，所以渲染时都会走内置的 <code>PretextTextBlock</code>。</p>
        </div>

        <label class="demo-panel__slider">
          <span>预览宽度：{{ previewWidthLabel }}</span>
          <input
            v-model="previewWidth"
            type="range"
            min="320"
            max="860"
            step="10"
          >
        </label>
      </div>

      <div class="demo-panel__stats">
        <strong>解析结果：</strong>
        <span>总 block {{ parsedBlockSummary.total }}</span>
        <span>text {{ parsedBlockSummary.textCount }}</span>
        <span>html {{ parsedBlockSummary.htmlCount }}</span>
      </div>

      <div class="demo-panel__block-kinds">
        <div
          v-for="block in parsedBlocks"
          :key="block.id"
          class="demo-panel__block-chip"
        >
          <strong>{{ block.id }}</strong>
          <span>{{ block.kind }}</span>
          <span v-if="block.kind === 'text'">{{ block.tag }}</span>
        </div>
      </div>

      <div class="demo-panel__frame">
        <div
          class="demo-panel__preview"
          :style="{ width: `${previewWidth}px` }"
        >
          <MarkdownRenderer
            :source="pretextOnlySource"
            :font="markdownFont"
            :line-height="26"
          />
        </div>
      </div>
    </section>

    <section class="demo-note">
      <h2>不在这个页面里的内容</h2>
      <p>代码块、表格、列表、mermaid、math、html block、artifact、approval、attachment 这些都不会走 pretext，它们会走各自独立的 block renderer。</p>
    </section>
  </section>
</template>

<style scoped>
.demo-page {
  max-width: 980px;
  margin: 0 auto;
  padding: 44px 24px 88px;
}

.demo-page__header h1,
.demo-page__header p,
.demo-panel__head h2,
.demo-panel__head p,
.demo-note h2,
.demo-note p {
  margin: 0;
}

.demo-page__header h1 {
  font-size: 28px;
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

.demo-panel,
.demo-note {
  margin-top: 26px;
  border: 1px solid #e2e8f0;
  border-radius: 24px;
  padding: 24px;
  background: #ffffff;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.05);
}

.demo-panel__head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 18px;
}

.demo-panel__head span,
.demo-note h2 {
  color: #64748b;
}

.demo-panel__head span {
  display: inline-block;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.demo-panel__head h2,
.demo-note h2 {
  font-size: 22px;
  letter-spacing: -0.04em;
}

.demo-panel__head p,
.demo-note p {
  margin-top: 10px;
  color: #475569;
  line-height: 1.8;
}

.demo-panel__slider {
  display: flex;
  min-width: min(100%, 280px);
  flex-direction: column;
  gap: 8px;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
}

.demo-panel__slider input {
  width: 100%;
}

.demo-panel__frame {
  overflow: auto;
  margin-top: 22px;
  border-radius: 20px;
  padding: 20px;
  background:
    linear-gradient(180deg, #f8fafc, #ffffff);
  box-shadow: inset 0 0 0 1px rgba(226, 232, 240, 0.9);
}

.demo-panel__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
  color: #334155;
  font-size: 13px;
}

.demo-panel__stats strong {
  font-size: 13px;
}

.demo-panel__block-kinds {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}

.demo-panel__block-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  padding: 8px 12px;
  background: #f8fafc;
  box-shadow: inset 0 0 0 1px #e2e8f0;
  color: #475569;
  font-size: 12px;
}

.demo-panel__block-chip strong {
  color: #0f172a;
  font-weight: 600;
}

.demo-panel__preview {
  min-width: 320px;
  max-width: 100%;
}

.demo-note code {
  border-radius: 8px;
  padding: 2px 6px;
  background: #e2e8f0;
  font-family:
    "SFMono-Regular",
    "JetBrains Mono",
    "Fira Code",
    monospace;
  font-size: 0.9em;
}

@media (max-width: 720px) {
  .demo-page {
    padding-inline: 16px;
  }

  .demo-panel,
  .demo-note {
    padding: 18px;
    border-radius: 18px;
  }
}
</style>
