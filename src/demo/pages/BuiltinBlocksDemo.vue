<script setup lang="ts">
import {
  MarkdownRenderer,
  agentStarted,
  agentThinking,
  approvalRequested,
  approvalResolved,
  artifactCreated,
  createAguiRuntime,
  runFinished,
  runStarted,
  toolFinished,
  toolStarted,
  type AguiComponentMap
} from '../../index';
import DemoRunBoard from '../components/DemoRunBoard.vue';

const markdownFont = '400 16px "Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif';
const runtime = createAguiRuntime();

const aguiComponents: AguiComponentMap = {
  DemoRunBoard: {
    component: DemoRunBoard,
    minHeight: 140
  }
};

const source = `
# Agentdown 内置块总览

和运行态最相关的内置块是这 4 个：

- \`:::vue-component\`
- \`:::artifact\`
- \`:::approval\`
- \`:::timeline\`

基础渲染块是这 6 个：

- \`text\`
- \`code\`
- \`mermaid\`
- \`math\`
- \`html\`
- \`thought\`

---

## 1. text

这就是普通文本段落，默认优先走 pretext。

## 2. thought

:::thought
这是一个可折叠的 thought block。

- 适合放思考过程
- 里面继续写 markdown 也可以
:::

## 3. code

\`\`\`ts
const runtime = createAguiRuntime();
runtime.emit(runStarted({ nodeId: 'run:demo' }));
\`\`\`

## 4. mermaid

\`\`\`mermaid
flowchart LR
  User --> Markdown
  Markdown --> Runtime
  Runtime --> UI
\`\`\`

## 5. math

$$
E = mc^2
$$

## 6. html

> 列表、表格、引用等复杂结构会回退成 html block。

| Block | 用途 |
| --- | --- |
| artifact | 展示产物 |
| approval | 展示审批 |
| timeline | 展示事件流 |

## 7. agui

:::vue-component DemoRunBoard {"ref":"run:demo"}

## 8. artifact

:::artifact ref="run:demo" title="Artifact 示例"

## 9. approval

:::approval ref="approval:demo" title="Approval 示例"

## 10. timeline

这个是可选块，不一定非要在主界面里出现。

:::timeline title="Timeline（可选）" limit=6
`;

runtime.emit(runStarted({
  nodeId: 'run:demo',
  title: 'Demo Run',
  message: '用于演示内置 block'
}));

runtime.emit(agentStarted({
  nodeId: 'agent:writer',
  parentId: 'run:demo',
  title: 'Writer Agent',
  message: '整理一个最小总览页'
}));

runtime.emit(agentThinking({
  nodeId: 'agent:writer',
  parentId: 'run:demo',
  title: 'Writer Agent',
  message: '把内置 block 放到同一个 markdown 里'
}));

runtime.emit(toolStarted({
  nodeId: 'tool:search',
  parentId: 'agent:writer',
  toolName: 'knowledge.search',
  title: '示例工具',
  message: '读取当前库里的能力'
}));

runtime.emit(toolFinished({
  nodeId: 'tool:search',
  parentId: 'agent:writer',
  toolName: 'knowledge.search',
  title: '示例工具',
  message: '读取完成'
}));

runtime.emit(artifactCreated({
  nodeId: 'run:demo',
  title: 'Demo Run',
  message: '这里展示 artifact.created 对应的默认卡片',
  artifactId: 'artifact:demo-report',
  artifactKind: 'report',
  label: 'demo-report.md',
  href: 'https://example.com/demo-report'
}));

runtime.emit(approvalRequested({
  nodeId: 'approval:demo',
  parentId: 'run:demo',
  title: 'Approval Demo',
  message: '这里展示 approval.requested / approval.resolved 的默认卡片',
  approvalId: 'approval-001'
}));

runtime.emit(approvalResolved({
  nodeId: 'approval:demo',
  parentId: 'run:demo',
  title: 'Approval Demo',
  message: '审批通过',
  approvalId: 'approval-001',
  decision: 'approved'
}));

runtime.emit(runFinished({
  nodeId: 'run:demo',
  title: 'Demo Run',
  message: '示例数据已准备好'
}));
</script>

<template>
  <section class="demo-page">
    <MarkdownRenderer
      :source="source"
      :agui-runtime="runtime"
      :agui-components="aguiComponents"
      :font="markdownFont"
      :line-height="26"
    />
  </section>
</template>

<style scoped>
.demo-page {
  max-width: 920px;
  margin: 0 auto;
  padding: 32px 24px 80px;
}
</style>
