<script setup lang="ts">
import {
  cmd,
  createAgentRuntime,
  DefaultMarkdownThoughtBlock,
  MarkdownRenderer,
  RunSurface
} from '../../index';
import BuiltinAguiCard from '../components/BuiltinAguiCard.vue';

const markdownFont = '400 16px "Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif';
const aguiComponents = {
  DemoBuiltinCard: BuiltinAguiCard
};
const runtime = createAgentRuntime();

const narrativeSource = `
轻内容部分会优先保持 markdown 自然排版，适合解释、思考和流式文本展示。

### text

这就是普通文本段落，默认优先走 pretext，适合长文本和持续 append 的输出。

### thought

:::thought
这里可以放 Agent 的补充思路或阶段性说明。

- 默认折叠
- 里面继续写 markdown 也可以
:::

### code

\`\`\`ts
const bridge = createBridge({
  runtime,
  protocol,
  assemblers: { markdown: createMarkdownAssembler() }
});
\`\`\`

### mermaid

\`\`\`mermaid
flowchart LR
  User --> Markdown
  Markdown --> Runtime
  Runtime --> UI
\`\`\`

### math

$$
E = mc^2
$$

### html

> 列表、表格、引用等复杂结构会回退成 html block。

| Block | 用途 |
| --- | --- |
| artifact | 展示产物 |
| approval | 展示审批 |
| attachment | 展示附件 |
`;

const agentUiSource = `
这部分更接近 Agent UI 本身，重点是把工具、审批、产物和自定义业务组件直接嵌进 markdown。

### agui

:::vue-component DemoBuiltinCard {"title":"天气工具组件","summary":"这个区域不是纯文本，而是一个真实的 Vue 组件。","detail":"在运行时你可以继续往里接 runtime、intent 或者业务状态，不需要再手动拼 DOM。","buttonText":"展开看看"}

### artifact

:::artifact title="日报产物" artifact-id="artifact:daily-report" kind="report" label="daily-report.md" href="https://example.com/demo-report"

### approval

:::approval title="上线审批" approval-id="approval:release-001" status="pending" message="等待负责人确认后再继续发布"

### attachment

:::attachment title="用户上传文件" attachment-id="file:proposal" kind="file" label="proposal.pdf" size-text="2.4 MB" message="这是一份由用户上传的 PDF，可以和文本一起组成同一条 message。"

### branch

:::branch title="修订分支" branch-id="branch:revision-2" source-run-id="run:main" target-run-id="run:revision-2" status="running" label="revision-2" message="当用户点了“需修改”后，可以显式展示当前运行已经派生出一个新分支。"

### handoff

:::handoff title="人工复核交接" handoff-id="handoff:legal-review" target-type="team" assignee="法务团队" status="pending" message="handoff 不强绑具体后端协议，只关心“交给谁、当前状态是什么”。"

> \`timeline\` 更适合跟 runtime history 连起来展示，所以在聊天运行页里演示会更自然。
`;

/**
 * thought 头部状态演示数据，专门用来展示“正在思考”和“已思考”的默认样式。
 */
const thoughtSamples = [
  {
    id: 'thinking',
    status: 'thinking' as const,
    lines: [
      '先快速定位这次 SQL 报错是不是类型不匹配。',
      '再确认参数是从哪一层被当成字符串传进来的。'
    ]
  },
  {
    id: 'done',
    status: 'done' as const,
    durationMs: 7_200,
    lines: [
      '问题已经定位清楚：数据库字段是 smallint，但查询参数传成了字符串。',
      '下一步只需要把 status 入参改成数字类型，或者在 SQL 层做显式类型转换。'
    ]
  }
];

/**
 * 预置一段运行态内容，演示默认 tool renderer 也可以直接使用。
 */
function seedRuntimePreview() {
  const now = Date.now();

  runtime.reset();
  runtime.apply([
    cmd.message.text({
      id: 'block:user:builtin',
      role: 'user',
      text: '帮我查一下北京天气',
      groupId: 'turn:user:builtin',
      at: now
    }),
    ...cmd.tool.start({
      id: 'tool:builtin:searching',
      title: '查询天气',
      groupId: 'turn:assistant:builtin',
      at: now + 1
    }),
    ...cmd.tool.start({
      id: 'tool:builtin:summary',
      title: '整理天气摘要',
      groupId: 'turn:assistant:builtin',
      at: now + 2
    }),
    ...cmd.tool.finish({
      id: 'tool:builtin:summary',
      title: '整理天气摘要',
      at: now + 3,
      result: '北京今日晴朗，体感舒适。'
    }),
    ...cmd.tool.start({
      id: 'tool:builtin:failing',
      title: '同步团队日报',
      groupId: 'turn:assistant:builtin',
      at: now + 4
    }),
    ...cmd.tool.finish({
      id: 'tool:builtin:failing',
      title: '同步团队日报',
      at: now + 5,
      status: 'error',
      message: '日报系统暂时不可用。'
    })
  ]);
}

seedRuntimePreview();
</script>

<template>
  <section class="demo-page">
    <header class="demo-page__header">
      <h1>内置块预览</h1>
      <p>把 narrative block 和 Agent UI block 分开展示，页面风格和对话 demo 保持一致。</p>
    </header>

    <div class="demo-page__chips">
      <span>text</span>
      <span>thought</span>
      <span>code</span>
      <span>mermaid</span>
      <span>math</span>
      <span>html</span>
      <span>agui</span>
      <span>artifact</span>
      <span>approval</span>
      <span>attachment</span>
      <span>branch</span>
      <span>handoff</span>
      <span>tool(default)</span>
    </div>

    <section class="demo-section">
      <div class="demo-section__head">
        <span>Section 01</span>
        <h2>基础 narrative block</h2>
        <p>适合长文本、结构化说明和默认折叠的思考内容。</p>
      </div>

      <MarkdownRenderer
        :source="narrativeSource"
        :font="markdownFont"
        :line-height="26"
      />

      <div class="demo-thought-gallery">
        <div class="demo-thought-gallery__head">
          <strong>thought 状态示例</strong>
          <p>这里直接展示默认 thought 组件的进行中和完成态，方便观察闪光动画和耗时文案。</p>
        </div>

        <DefaultMarkdownThoughtBlock
          v-for="sample in thoughtSamples"
          :key="sample.id"
          :status="sample.status"
          :duration-ms="sample.durationMs"
        >
          <p
            v-for="(line, index) in sample.lines"
            :key="`${sample.id}:${index}`"
            class="demo-thought-gallery__line"
          >
            {{ line }}
          </p>
        </DefaultMarkdownThoughtBlock>
      </div>
    </section>

    <section class="demo-section">
      <div class="demo-section__head">
        <span>Section 02</span>
        <h2>Agent UI block</h2>
        <p>适合审批、产物、业务组件和非纯文本的交互展示。</p>
      </div>

      <MarkdownRenderer
        :source="agentUiSource"
        :font="markdownFont"
        :line-height="26"
        :agui-components="aguiComponents"
      />
    </section>

    <section class="demo-section">
      <div class="demo-section__head">
        <span>Section 03</span>
        <h2>默认 Tool Renderer</h2>
        <p>即使你还没注册业务组件，tool block 现在也会先有一个开箱即用的默认极简状态行。</p>
      </div>

      <RunSurface :runtime="runtime" />
    </section>
  </section>
</template>

<style scoped>
.demo-page {
  max-width: 860px;
  margin: 0 auto;
  padding: 44px 24px 88px;
}

.demo-page__header h1,
.demo-page__header p,
.demo-section__head h2,
.demo-section__head p {
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

.demo-section {
  margin-top: 34px;
  padding-top: 30px;
  border-top: 1px solid #e2e8f0;
}

.demo-section__head {
  margin-bottom: 20px;
}

.demo-section__head span {
  display: inline-block;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.demo-section__head h2 {
  margin-top: 8px;
  font-size: 20px;
  letter-spacing: -0.04em;
}

.demo-section__head p {
  margin-top: 8px;
  color: #64748b;
  line-height: 1.8;
}

.demo-thought-gallery {
  margin-top: 24px;
  display: grid;
  gap: 18px;
}

.demo-thought-gallery__head strong,
.demo-thought-gallery__head p {
  margin: 0;
}

.demo-thought-gallery__head p {
  margin-top: 6px;
  color: #64748b;
  line-height: 1.75;
}

.demo-thought-gallery__line {
  margin: 0 0 10px;
}

.demo-thought-gallery__line:last-child {
  margin-bottom: 0;
}

@media (max-width: 720px) {
  .demo-page {
    padding: 24px 16px 56px;
  }
}
</style>
