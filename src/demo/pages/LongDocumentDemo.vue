<script setup lang="ts">
import { MarkdownRenderer } from '../../index';
import BuiltinAguiCard from '../components/BuiltinAguiCard.vue';
import {
  createLongDocumentSource,
  LONG_DOCUMENT_MARKDOWN_FONT,
  LONG_DOCUMENT_SYNTAX_CHIPS
} from '../fixtures/longDocumentFixture';

/**
 * 提供给 `:::vue-component` 指令使用的组件映射表。
 */
const aguiComponents = {
  DemoBuiltinCard: BuiltinAguiCard
};

/**
 * 当前长文档 demo 的 markdown 内容。
 */
const source = createLongDocumentSource({
  readingSectionCount: 8,
  includeRawHtml: true
});
</script>

<template>
  <section class="demo-page">
    <header class="demo-page__header">
      <h1>长文档 Markdown Demo</h1>
      <p>一页覆盖当前支持的常用 Markdown + Agentdown 扩展语法，同时拉长内容，方便测试真实阅读和混排效果。</p>
    </header>

    <div class="demo-page__chips">
      <span
        v-for="chip in LONG_DOCUMENT_SYNTAX_CHIPS"
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
        :font="LONG_DOCUMENT_MARKDOWN_FONT"
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
