<script setup lang="ts">
import {
  cmd,
  createAgentRuntime,
  DefaultMarkdownApprovalBlock,
  DefaultMarkdownArtifactBlock,
  DefaultMarkdownAttachmentBlock,
  DefaultMarkdownBranchBlock,
  DefaultMarkdownErrorBlock,
  DefaultMarkdownHandoffBlock,
  DefaultMarkdownThoughtBlock,
  DefaultMarkdownTimelineBlock,
  DefaultRunSurfaceAssistantShell,
  DefaultRunSurfaceToolRenderer,
  DefaultRunSurfaceUserBubble,
  MarkdownRenderer,
  RunSurface
} from '../../index';
import BuiltinAguiCard from '../components/BuiltinAguiCard.vue';

const markdownFont = '400 16px "Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif';
const aguiComponents = {
  DemoBuiltinCard: BuiltinAguiCard
};
const shellPreviewRuntime = createAgentRuntime();
const previewImage = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" viewBox="0 0 720 420">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#eff6ff" />
        <stop offset="100%" stop-color="#dbeafe" />
      </linearGradient>
    </defs>
    <rect width="720" height="420" rx="28" fill="url(#bg)" />
    <circle cx="164" cy="148" r="62" fill="#93c5fd" opacity="0.45" />
    <circle cx="560" cy="112" r="44" fill="#60a5fa" opacity="0.35" />
    <rect x="92" y="234" width="536" height="90" rx="22" fill="#ffffff" opacity="0.92" />
    <rect x="124" y="258" width="206" height="18" rx="9" fill="#bfdbfe" />
    <rect x="124" y="290" width="332" height="14" rx="7" fill="#dbeafe" />
  </svg>
`)}`;
const demoJsonUrl = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({
  city: '北京',
  condition: '阴天',
  tempC: 18.5,
  humidity: 12
}, null, 2))}`;

const overrideExample = `<RunSurface
  :runtime="runtime"
  :builtin-components="{
    thought: MyThoughtBlock,
    approval: MyApprovalBlock,
    attachment: MyAttachmentBlock
  }"
  :renderers="{
    tool: {
      component: DefaultRunSurfaceToolRenderer,
      props: {
        icon: MyToolIcon
      }
    },
    'tool.weather': WeatherToolCard
  }"
  :message-shells="{
    assistant: MyAssistantShell,
    user: MyUserBubble
  }"
  :message-actions="{
    assistant: {
      builtinHandlers: {
        regenerate: handleRegenerate
      }
    }
  }"
/>;
`;

const markdownBlockCatalog = [
  {
    key: 'text',
    component: 'DefaultMarkdownTextBlock',
    hook: 'builtinComponents.text',
    scope: 'MarkdownRenderer / RunSurface',
    note: '标题、段落、列表里的轻文本都走这一层，默认是 pretext 文本块。'
  },
  {
    key: 'code',
    component: 'DefaultMarkdownCodeBlock',
    hook: 'builtinComponents.code',
    scope: 'MarkdownRenderer / RunSurface',
    note: '负责代码块、语言角标、复制按钮和代码容器样式。'
  },
  {
    key: 'mermaid',
    component: 'DefaultMarkdownMermaidBlock',
    hook: 'builtinComponents.mermaid',
    scope: 'MarkdownRenderer / RunSurface',
    note: '负责 Mermaid 图表块。'
  },
  {
    key: 'math',
    component: 'DefaultMarkdownMathBlock',
    hook: 'builtinComponents.math',
    scope: 'MarkdownRenderer / RunSurface',
    note: '负责 KaTeX 数学公式。'
  },
  {
    key: 'thought',
    component: 'DefaultMarkdownThoughtBlock',
    hook: 'builtinComponents.thought',
    scope: 'MarkdownRenderer / RunSurface',
    note: '负责“正在思考 / 已思考”的折叠块和状态头部。'
  },
  {
    key: 'html',
    component: 'DefaultMarkdownHtmlBlock',
    hook: 'builtinComponents.html',
    scope: 'MarkdownRenderer / RunSurface',
    note: '当 markdown 需要回退原生 HTML 时走这层。'
  },
  {
    key: 'agui',
    component: 'DefaultMarkdownAguiBlock',
    hook: 'builtinComponents.agui',
    scope: 'MarkdownRenderer / RunSurface',
    note: '负责包裹嵌入式 Vue 业务组件。'
  },
  {
    key: 'artifact',
    component: 'DefaultMarkdownArtifactBlock',
    hook: 'builtinComponents.artifact',
    scope: 'MarkdownRenderer / RunSurface',
    note: '文件、报告、diff、json 等产物卡片。'
  },
  {
    key: 'error',
    component: 'DefaultMarkdownErrorBlock',
    hook: 'builtinComponents.error',
    scope: 'MarkdownRenderer / RunSurface',
    note: '统一的错误展示卡片。'
  },
  {
    key: 'approval',
    component: 'DefaultMarkdownApprovalBlock',
    hook: 'builtinComponents.approval',
    scope: 'MarkdownRenderer / RunSurface',
    note: '审批卡片；在 RunSurface 里还能挂内置动作。'
  },
  {
    key: 'attachment',
    component: 'DefaultMarkdownAttachmentBlock',
    hook: 'builtinComponents.attachment',
    scope: 'MarkdownRenderer / RunSurface',
    note: '用户附件和中间文件卡片。'
  },
  {
    key: 'branch',
    component: 'DefaultMarkdownBranchBlock',
    hook: 'builtinComponents.branch',
    scope: 'MarkdownRenderer / RunSurface',
    note: '分支 / 修订链路卡片。'
  },
  {
    key: 'handoff',
    component: 'DefaultMarkdownHandoffBlock',
    hook: 'builtinComponents.handoff',
    scope: 'MarkdownRenderer / RunSurface',
    note: '人工或多 agent 交接卡片。'
  },
  {
    key: 'timeline',
    component: 'DefaultMarkdownTimelineBlock',
    hook: 'builtinComponents.timeline',
    scope: 'MarkdownRenderer / RunSurface',
    note: '时间线占位块，通常和 runtime history 联动。'
  }
];

const runSurfaceCatalog = [
  {
    key: 'tool',
    component: 'DefaultRunSurfaceToolRenderer',
    hook: 'renderers.tool',
    scope: 'RunSurface',
    note: '所有没被业务 renderer 覆盖的工具块，都会先走这个默认工具状态行。'
  },
  {
    key: 'assistant-shell',
    component: 'DefaultRunSurfaceAssistantShell',
    hook: 'messageShells.assistant',
    scope: 'RunSurface',
    note: '负责 assistant 消息容器宽度、panel/plain 模式和 draft 外壳。'
  },
  {
    key: 'user-shell',
    component: 'DefaultRunSurfaceUserBubble',
    hook: 'messageShells.user',
    scope: 'RunSurface',
    note: '负责用户消息气泡和 panel bare 模式。'
  },
  {
    key: 'message-actions',
    component: 'DefaultRunSurfaceMessageActions',
    hook: 'messageActions.assistant',
    scope: 'RunSurface',
    note: '最终回答后的复制、重新生成、喜欢、不喜欢、分享动作栏。'
  }
];

const structureSamples = [
  {
    key: 'text',
    title: 'text',
    hook: 'builtinComponents.text',
    description: '默认的标题与段落会走 pretext 文本块。',
    source: `### 这是一段标题\n\n这里是一段普通文本，会优先走 pretext，而不是 fallback 成 HTML。拖动页面宽度时，它的排版也会跟着变化。`
  },
  {
    key: 'code',
    title: 'code',
    hook: 'builtinComponents.code',
    description: '代码块、语言标签和复制按钮都在这个组件里。',
    source: '```ts\nconst framework = "agentdown";\nconst status = "ready";\nconsole.log(framework, status);\n```'
  },
  {
    key: 'mermaid',
    title: 'mermaid',
    hook: 'builtinComponents.mermaid',
    description: '流程图和节点样式可以在这里统一改。',
    source: '```mermaid\nflowchart LR\n  User --> RunSurface\n  RunSurface --> Renderer\n  Renderer --> UI\n```'
  },
  {
    key: 'math',
    title: 'math',
    hook: 'builtinComponents.math',
    description: '公式块由 KaTeX 渲染。',
    source: '$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$'
  },
  {
    key: 'html',
    title: 'html',
    hook: 'builtinComponents.html',
    description: '原生 HTML 内容会回退到 html block。',
    source: '<div class="builtin-html-fallback"><strong>HTML fallback</strong><p>这块不是 pretext，而是原样走 html block。</p></div>'
  },
  {
    key: 'agui',
    title: 'agui',
    hook: 'builtinComponents.agui',
    description: '嵌入业务组件时，最终包裹层走的就是这个组件。',
    source: ':::vue-component DemoBuiltinCard {"title":"业务 AGUI 卡片","summary":"这里就是一个真实 Vue 组件的挂载位置。","detail":"后面你可以直接把这里替换成更漂亮的壳子。","buttonText":"展开看看"}'
  }
];

const thoughtSamples = [
  {
    key: 'idle',
    title: 'idle',
    status: 'idle' as const,
    copy: [
      '这是未显式进入 thinking 状态时的默认文案。',
      '适合只想展示“思考过程”，不强调运行时动画的场景。'
    ]
  },
  {
    key: 'thinking',
    title: 'thinking',
    status: 'thinking' as const,
    copy: [
      '这里会显示“正在思考”，并带头部闪光动画。',
      '适合真正的中间态输出。'
    ]
  },
  {
    key: 'done',
    title: 'done',
    status: 'done' as const,
    durationMs: 7200,
    copy: [
      '完成后会切到“已思考（用时 7.2 秒）”这类文案。',
      '这一层也很适合继续精修层次和留白。'
    ]
  }
];

const artifactSamples = [
  {
    key: 'report',
    title: '日报产物',
    artifactKind: 'report' as const,
    label: 'daily-report.md',
    artifactId: 'artifact:daily-report',
    message: '典型的文本报告产物。',
    href: 'https://example.com/daily-report'
  },
  {
    key: 'json',
    title: '结构化结果',
    artifactKind: 'json' as const,
    label: 'weather-result.json',
    artifactId: 'artifact:weather-json',
    message: '适合展示结构化 JSON 或函数返回结果。',
    href: demoJsonUrl
  },
  {
    key: 'image',
    title: '图像产物',
    artifactKind: 'image' as const,
    label: 'hero-preview.png',
    artifactId: 'artifact:hero-image',
    message: '图片类产物也会复用同一个 artifact 组件。',
    href: previewImage
  }
];

const approvalSamples = [
  {
    key: 'pending',
    title: '上线审批',
    status: 'pending' as const,
    message: '等待审批人确认。'
  },
  {
    key: 'approved',
    title: '上线审批',
    status: 'approved' as const,
    message: '审批已通过。'
  },
  {
    key: 'rejected',
    title: '上线审批',
    status: 'rejected' as const,
    message: '审批已拒绝。'
  },
  {
    key: 'changes_requested',
    title: '上线审批',
    status: 'changes_requested' as const,
    message: '审批人要求先修改。'
  }
];

const attachmentSamples = [
  {
    key: 'file',
    title: 'proposal.pdf',
    attachmentKind: 'file' as const,
    label: 'proposal.pdf',
    attachmentId: 'file:proposal',
    mimeType: 'application/pdf',
    sizeText: '2.4 MB',
    status: 'uploaded',
    message: '标准文件附件。'
  },
  {
    key: 'image',
    title: 'release-preview.png',
    attachmentKind: 'image' as const,
    label: 'release-preview.png',
    attachmentId: 'file:preview',
    mimeType: 'image/png',
    sizeText: '184 KB',
    status: 'synced',
    previewSrc: previewImage,
    message: '图片附件会显示缩略图。'
  },
  {
    key: 'json',
    title: 'params.json',
    attachmentKind: 'json' as const,
    label: 'params.json',
    attachmentId: 'file:params',
    mimeType: 'application/json',
    sizeText: '3 KB',
    status: 'validated',
    message: '结构化输入也可以走附件卡片。',
    href: demoJsonUrl
  }
];

const branchSamples = [
  {
    key: 'pending',
    status: 'pending',
    title: '修订分支',
    message: '分支已创建，等待开始执行。'
  },
  {
    key: 'running',
    status: 'running',
    title: '修订分支',
    message: '当前正在这个分支里继续处理。'
  },
  {
    key: 'done',
    status: 'done',
    title: '修订分支',
    message: '这个修订分支已经完成。'
  },
  {
    key: 'merged',
    status: 'merged',
    title: '修订分支',
    message: '结果已经回合并主分支。'
  },
  {
    key: 'rejected',
    status: 'rejected',
    title: '修订分支',
    message: '这个分支链路被放弃。'
  }
];

const handoffSamples = [
  {
    key: 'pending',
    status: 'pending',
    title: '人工复核',
    message: '等待人工或团队接手。',
    targetType: 'team',
    assignee: 'QA 团队'
  },
  {
    key: 'accepted',
    status: 'accepted',
    title: '人工复核',
    message: '对方已经接收这次交接。',
    targetType: 'human',
    assignee: '值班同学'
  },
  {
    key: 'completed',
    status: 'completed',
    title: '人工复核',
    message: '交接已经处理完成。',
    targetType: 'agent',
    assignee: 'review-agent'
  },
  {
    key: 'declined',
    status: 'declined',
    title: '人工复核',
    message: '这次交接被拒绝。',
    targetType: 'team',
    assignee: '法务团队'
  }
];

const toolSamples = [
  {
    key: 'pending',
    title: 'lookup_weather',
    status: 'pending',
    note: '默认是统一的小工具图标；运行态不显示状态文字，只保留图标呼吸和整块扫光。'
  },
  {
    key: 'done',
    title: 'lookup_weather',
    status: 'done',
    note: '成功态也不显示状态词，只保留安静终态图标。'
  },
  {
    key: 'rejected',
    title: 'lookup_weather',
    status: 'rejected',
    note: '审批拒绝后会切到已拒绝终态。'
  },
  {
    key: 'error',
    title: 'lookup_weather',
    status: 'error',
    note: '失败态会保留统一结构，只收紧颜色语义。'
  },
  {
    key: 'cancelled',
    title: 'lookup_weather',
    status: 'cancelled',
    note: '取消态会退回更弱的灰色终态。'
  }
];

function seedShellPreviewRuntime() {
  const now = Date.now();
  const conversationId = 'session:demo:builtin-gallery';
  const turnId = 'turn:demo:builtin-gallery:1';

  shellPreviewRuntime.reset();
  shellPreviewRuntime.apply([
    cmd.message.text({
      id: 'block:user:builtin-gallery:1',
      role: 'user',
      text: '帮我把默认 shell 和动作栏都展示出来。',
      conversationId,
      turnId,
      messageId: 'message:user:builtin-gallery:1',
      groupId: 'group:user:builtin-gallery:1',
      at: now
    }),
    cmd.message.text({
      id: 'block:assistant:builtin-gallery:1',
      role: 'assistant',
      text: '这一条会展示默认 assistant shell 和最终回答后的 message actions。',
      conversationId,
      turnId,
      messageId: 'message:assistant:builtin-gallery:1',
      groupId: 'group:assistant:builtin-gallery:1',
      at: now + 1
    }),
    ...cmd.tool.start({
      id: 'tool:builtin-gallery:1',
      title: '整理发布清单',
      conversationId,
      turnId,
      messageId: 'message:assistant:builtin-gallery:2',
      groupId: 'group:assistant:builtin-gallery:2',
      at: now + 2
    }),
    ...cmd.tool.finish({
      id: 'tool:builtin-gallery:1',
      title: '整理发布清单',
      conversationId,
      turnId,
      messageId: 'message:assistant:builtin-gallery:2',
      groupId: 'group:assistant:builtin-gallery:2',
      at: now + 3,
      result: {
        items: 6
      }
    }),
    cmd.message.insert({
      id: 'block:assistant:builtin-gallery:approval',
      role: 'assistant',
      type: 'approval',
      renderer: 'approval',
      conversationId,
      turnId,
      messageId: 'message:assistant:builtin-gallery:3',
      groupId: 'group:assistant:builtin-gallery:3',
      at: now + 4,
      data: {
        kind: 'approval',
        title: '上线审批',
        approvalId: 'approval:demo:release',
        status: 'pending',
        message: '默认 approval 组件在 RunSurface 里会直接挂出批准 / 拒绝 / 需修改动作。'
      }
    }),
    cmd.message.handoff({
      id: 'block:assistant:builtin-gallery:handoff',
      role: 'assistant',
      title: '人工复核交接',
      handoffId: 'handoff:demo:review',
      status: 'pending',
      targetType: 'team',
      assignee: 'QA 团队',
      message: 'handoffActions 开启后，这里会挂默认继续动作。',
      conversationId,
      turnId,
      messageId: 'message:assistant:builtin-gallery:4',
      groupId: 'group:assistant:builtin-gallery:4',
      at: now + 5
    })
  ]);
}

seedShellPreviewRuntime();
</script>

<template>
  <section class="demo-page">
    <header class="demo-page__header">
      <h1>内置组件展厅</h1>
      <p>这页专门用来看 Agentdown 默认 UI 长什么样。后面我们可以直接对着这页，一个组件一个组件地改。</p>
    </header>

    <section class="demo-section demo-section--intro">
      <div class="demo-section__head">
        <span>Section 01</span>
        <h2>可以替换，但入口分层</h2>
        <p>`builtinComponents`、`renderers`、`messageShells`、`messageActions` 分别管不同层，不是所有默认 UI 都在同一个配置里替换。</p>
      </div>

      <div class="replace-guide">
        <div class="replace-guide__panel">
          <strong>最常用的替换方式</strong>
          <pre><code>{{ overrideExample }}</code></pre>
        </div>

        <div class="replace-guide__panel">
          <strong>结论</strong>
          <p>绝大多数你现在看见的默认 UI 都能换掉。</p>
          <p>其中 markdown 块走 `builtinComponents`，tool 走 `renderers`，assistant/user 外壳走 `messageShells`，最终回答后的图标栏走 `messageActions`。</p>
        </div>
      </div>
    </section>

    <section class="demo-section">
      <div class="demo-section__head">
        <span>Section 02</span>
        <h2>目前内置组件清单</h2>
        <p>先把默认内置层和各自的替换入口全部列出来，避免改样式时找不到挂点。</p>
      </div>

      <div class="catalog-group">
        <h3>Markdown 内置块</h3>

        <div class="catalog-grid">
          <article
            v-for="item in markdownBlockCatalog"
            :key="item.key"
            class="catalog-card"
          >
            <div class="catalog-card__head">
              <strong>{{ item.key }}</strong>
              <span>{{ item.scope }}</span>
            </div>

            <code>{{ item.component }}</code>
            <code>{{ item.hook }}</code>
            <p>{{ item.note }}</p>
          </article>
        </div>
      </div>

      <div class="catalog-group">
        <h3>RunSurface 默认层</h3>

        <div class="catalog-grid">
          <article
            v-for="item in runSurfaceCatalog"
            :key="item.key"
            class="catalog-card"
          >
            <div class="catalog-card__head">
              <strong>{{ item.key }}</strong>
              <span>{{ item.scope }}</span>
            </div>

            <code>{{ item.component }}</code>
            <code>{{ item.hook }}</code>
            <p>{{ item.note }}</p>
          </article>
        </div>
      </div>
    </section>

    <section class="demo-section">
      <div class="demo-section__head">
        <span>Section 03</span>
        <h2>文本与结构块</h2>
        <p>这些块主要通过 `MarkdownRenderer` 进入页面，所以这里直接用真实 markdown 样本来展示默认效果。</p>
      </div>

      <div class="showcase-grid">
        <article
          v-for="sample in structureSamples"
          :key="sample.key"
          class="showcase-card"
        >
          <div class="showcase-card__head">
            <div>
              <strong>{{ sample.title }}</strong>
              <p>{{ sample.description }}</p>
            </div>

            <code>{{ sample.hook }}</code>
          </div>

          <MarkdownRenderer
            :source="sample.source"
            :font="markdownFont"
            :line-height="26"
            :agui-components="aguiComponents"
          />
        </article>
      </div>
    </section>

    <section class="demo-section">
      <div class="demo-section__head">
        <span>Section 04</span>
        <h2>thought 状态面</h2>
        <p>thought 比较特殊，除了内容区以外还有标题文案、闪光动画和耗时状态，所以单独拉出来看。</p>
      </div>

      <div class="showcase-grid showcase-grid--compact">
        <article
          v-for="sample in thoughtSamples"
          :key="sample.key"
          class="showcase-card"
        >
          <div class="showcase-card__head">
            <div>
              <strong>{{ sample.title }}</strong>
              <p>{{ sample.status }}</p>
            </div>

            <code>builtinComponents.thought</code>
          </div>

          <DefaultMarkdownThoughtBlock
            :status="sample.status"
            :duration-ms="sample.durationMs"
          >
            <p
              v-for="(line, index) in sample.copy"
              :key="`${sample.key}:${index}`"
              class="thought-line"
            >
              {{ line }}
            </p>
          </DefaultMarkdownThoughtBlock>
        </article>
      </div>
    </section>

    <section class="demo-section">
      <div class="demo-section__head">
        <span>Section 05</span>
        <h2>卡片类组件与状态</h2>
        <p>审批、附件、分支、交接、tool 这些最容易被嫌丑，也最需要把状态面一起摊开看。</p>
      </div>

      <div class="showcase-subsection">
        <h3>artifact</h3>

        <div class="showcase-grid showcase-grid--compact">
          <article
            v-for="sample in artifactSamples"
            :key="sample.key"
            class="showcase-card"
          >
            <div class="showcase-card__head">
              <strong>{{ sample.artifactKind }}</strong>
              <code>builtinComponents.artifact</code>
            </div>

            <DefaultMarkdownArtifactBlock
              :title="sample.title"
              :artifact-kind="sample.artifactKind"
              :label="sample.label"
              :artifact-id="sample.artifactId"
              :message="sample.message"
              :href="sample.href || ''"
            />
          </article>
        </div>
      </div>

      <div class="showcase-subsection">
        <h3>error</h3>

        <div class="showcase-grid showcase-grid--compact">
          <article class="showcase-card">
            <div class="showcase-card__head">
              <strong>error</strong>
              <code>builtinComponents.error</code>
            </div>

            <DefaultMarkdownErrorBlock
              title="请求失败"
              message="后端暂时不可用，请稍后重试。"
              code="HTTP_502"
              ref-id="run:error:demo"
            />
          </article>
        </div>
      </div>

      <div class="showcase-subsection">
        <h3>approval</h3>

        <div class="showcase-grid showcase-grid--compact">
          <article
            v-for="sample in approvalSamples"
            :key="sample.key"
            class="showcase-card"
          >
            <div class="showcase-card__head">
              <strong>{{ sample.status }}</strong>
              <code>builtinComponents.approval</code>
            </div>

            <DefaultMarkdownApprovalBlock
              :title="sample.title"
              :message="sample.message"
              :status="sample.status"
              :approval-id="`approval:${sample.key}`"
            />
          </article>
        </div>
      </div>

      <div class="showcase-subsection">
        <h3>attachment</h3>

        <div class="showcase-grid showcase-grid--compact">
          <article
            v-for="sample in attachmentSamples"
            :key="sample.key"
            class="showcase-card"
          >
            <div class="showcase-card__head">
              <strong>{{ sample.attachmentKind }}</strong>
              <code>builtinComponents.attachment</code>
            </div>

            <DefaultMarkdownAttachmentBlock
              :title="sample.title"
              :attachment-kind="sample.attachmentKind"
              :label="sample.label"
              :attachment-id="sample.attachmentId"
              :mime-type="sample.mimeType"
              :size-text="sample.sizeText"
              :status="sample.status"
              :preview-src="sample.previewSrc || ''"
              :message="sample.message"
            />
          </article>
        </div>
      </div>

      <div class="showcase-subsection">
        <h3>branch</h3>

        <div class="showcase-grid showcase-grid--compact">
          <article
            v-for="sample in branchSamples"
            :key="sample.key"
            class="showcase-card"
          >
            <div class="showcase-card__head">
              <strong>{{ sample.status }}</strong>
              <code>builtinComponents.branch</code>
            </div>

            <DefaultMarkdownBranchBlock
              :title="sample.title"
              :message="sample.message"
              :status="sample.status"
              branch-id="branch:demo:revision-2"
              source-run-id="run:main"
              target-run-id="run:revision-2"
              label="revision-2"
            />
          </article>
        </div>
      </div>

      <div class="showcase-subsection">
        <h3>handoff</h3>

        <div class="showcase-grid showcase-grid--compact">
          <article
            v-for="sample in handoffSamples"
            :key="sample.key"
            class="showcase-card"
          >
            <div class="showcase-card__head">
              <strong>{{ sample.status }}</strong>
              <code>builtinComponents.handoff</code>
            </div>

            <DefaultMarkdownHandoffBlock
              :title="sample.title"
              :message="sample.message"
              :status="sample.status"
              :target-type="sample.targetType"
              :assignee="sample.assignee"
              :handoff-id="`handoff:${sample.key}`"
            />
          </article>
        </div>
      </div>

      <div class="showcase-subsection">
        <h3>timeline</h3>

        <div class="showcase-grid showcase-grid--compact">
          <article class="showcase-card">
            <div class="showcase-card__head">
              <strong>timeline</strong>
              <code>builtinComponents.timeline</code>
            </div>

            <DefaultMarkdownTimelineBlock
              title="运行时间线"
              :limit="8"
              empty-text="当前 demo 里先展示 timeline 的默认空态。"
            />
          </article>
        </div>
      </div>

      <div class="showcase-subsection">
        <h3>tool</h3>

        <div class="showcase-grid showcase-grid--compact">
          <article
            v-for="sample in toolSamples"
            :key="sample.key"
            class="showcase-card"
          >
            <div class="showcase-card__head">
              <div>
                <strong>{{ sample.status }}</strong>
                <p>{{ sample.note }}</p>
              </div>

              <code>renderers.tool</code>
            </div>

            <DefaultRunSurfaceToolRenderer
              :title="sample.title"
              :status="sample.status"
            />
          </article>
        </div>
      </div>
    </section>

    <section class="demo-section">
      <div class="demo-section__head">
        <span>Section 06</span>
        <h2>RunSurface 外壳</h2>
        <p>assistant shell 和 user bubble 不属于 markdown block，而是消息级的包裹层，所以要单独看。</p>
      </div>

      <div class="showcase-grid showcase-grid--compact">
        <article class="showcase-card">
          <div class="showcase-card__head">
            <strong>assistant shell · plain</strong>
            <code>messageShells.assistant</code>
          </div>

          <DefaultRunSurfaceAssistantShell>
            <div class="shell-mock shell-mock--plain">
              这类普通 assistant 文本会走 plain 宽度。
            </div>
          </DefaultRunSurfaceAssistantShell>
        </article>

        <article class="showcase-card">
          <div class="showcase-card__head">
            <strong>assistant shell · panel</strong>
            <code>messageShells.assistant</code>
          </div>

          <DefaultRunSurfaceAssistantShell block-kind="approval">
            <div class="shell-mock shell-mock--panel">
              approval / attachment / code 这类块会走 panel 模式。
            </div>
          </DefaultRunSurfaceAssistantShell>
        </article>

        <article class="showcase-card">
          <div class="showcase-card__head">
            <strong>user bubble · bubble</strong>
            <code>messageShells.user</code>
          </div>

          <DefaultRunSurfaceUserBubble>
            <div class="shell-mock shell-mock--bubble">
              默认用户文本消息会包成气泡。
            </div>
          </DefaultRunSurfaceUserBubble>
        </article>

        <article class="showcase-card">
          <div class="showcase-card__head">
            <strong>user bubble · bare</strong>
            <code>messageShells.user</code>
          </div>

          <DefaultRunSurfaceUserBubble block-kind="approval">
            <div class="shell-mock shell-mock--bare">
              用户如果发的是 panel 类块，会走 bare 容器，不再强包气泡。
            </div>
          </DefaultRunSurfaceUserBubble>
        </article>
      </div>
    </section>

    <section class="demo-section">
      <div class="demo-section__head">
        <span>Section 07</span>
        <h2>真实 RunSurface 预览</h2>
        <p>这一段会把默认 assistant shell、user bubble、message actions、tool、approval actions、handoff actions 一起走一遍。</p>
      </div>

      <div class="runtime-preview">
        <RunSurface
          :runtime="shellPreviewRuntime"
          :handoff-actions="{ enabled: true }"
        />
      </div>
    </section>
  </section>
</template>

<style scoped>
.demo-page {
  max-width: 1120px;
  margin: 0 auto;
  padding: 44px 24px 88px;
}

.demo-page__header h1,
.demo-page__header p,
.demo-section__head h2,
.demo-section__head p,
.catalog-group h3,
.showcase-subsection h3 {
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

.demo-section {
  margin-top: 34px;
  padding-top: 30px;
  border-top: 1px solid #e2e8f0;
}

.demo-section--intro {
  margin-top: 26px;
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
  font-size: 22px;
  letter-spacing: -0.04em;
}

.demo-section__head p {
  margin-top: 8px;
  color: #64748b;
  line-height: 1.8;
}

.replace-guide {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.replace-guide__panel,
.catalog-card,
.showcase-card,
.runtime-preview {
  border: 1px solid #e2e8f0;
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.05);
}

.replace-guide__panel {
  padding: 18px 18px 16px;
}

.replace-guide__panel strong {
  display: block;
  font-size: 15px;
}

.replace-guide__panel p {
  margin: 10px 0 0;
  color: #475569;
  line-height: 1.8;
}

.replace-guide__panel pre {
  overflow-x: auto;
  margin: 12px 0 0;
  border-radius: 16px;
  padding: 14px 15px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 13px;
  line-height: 1.7;
}

.replace-guide__panel code,
.catalog-card code,
.showcase-card code {
  font-family:
    'SFMono-Regular',
    'JetBrains Mono',
    'Fira Code',
    'Menlo',
    monospace;
}

.catalog-group + .catalog-group,
.showcase-subsection + .showcase-subsection {
  margin-top: 22px;
}

.catalog-group h3,
.showcase-subsection h3 {
  margin-bottom: 12px;
  font-size: 16px;
}

.catalog-grid,
.showcase-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.showcase-grid--compact {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.catalog-card {
  padding: 16px 16px 14px;
}

.catalog-card__head,
.showcase-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.catalog-card__head strong,
.showcase-card__head strong {
  font-size: 15px;
}

.catalog-card__head span {
  color: #64748b;
  font-size: 12px;
  white-space: nowrap;
}

.catalog-card code,
.showcase-card code {
  display: inline-flex;
  width: fit-content;
  margin-top: 10px;
  border-radius: 999px;
  padding: 5px 9px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
}

.catalog-card p,
.showcase-card__head p {
  margin: 10px 0 0;
  color: #475569;
  line-height: 1.75;
}

.showcase-card {
  padding: 16px;
}

.showcase-card :deep(.agentdown-markdown-root) {
  margin-top: 14px;
}

.showcase-card :deep(.agentdown-run-surface-assistant-shell),
.showcase-card :deep(.agentdown-run-surface-user-bubble) {
  margin-top: 14px;
}

.thought-line {
  margin: 0 0 10px;
}

.thought-line:last-child {
  margin-bottom: 0;
}

.shell-mock {
  border-radius: 18px;
  padding: 16px 18px;
  color: #0f172a;
  line-height: 1.7;
}

.shell-mock--plain {
  background: linear-gradient(180deg, #ffffff, #f8fafc);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.18);
}

.shell-mock--panel {
  background: linear-gradient(180deg, #ffffff, #eff6ff);
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.14);
}

.shell-mock--bubble {
  background: transparent;
}

.shell-mock--bare {
  background: linear-gradient(180deg, #fff7ed, #fffbeb);
  box-shadow: inset 0 0 0 1px rgba(251, 146, 60, 0.15);
}

.runtime-preview {
  padding: 18px;
  background:
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.06), transparent 26%),
    #ffffff;
}

:deep(.builtin-html-fallback) {
  border-radius: 16px;
  padding: 14px 16px;
  background: linear-gradient(180deg, #fff7ed, #ffffff);
  box-shadow: inset 0 0 0 1px rgba(251, 146, 60, 0.18);
}

:deep(.builtin-html-fallback strong) {
  display: block;
  margin-bottom: 6px;
}

:deep(.builtin-html-fallback p) {
  margin: 0;
}

@media (max-width: 1024px) {
  .showcase-grid--compact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 840px) {
  .replace-guide,
  .catalog-grid,
  .showcase-grid,
  .showcase-grid--compact {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 720px) {
  .demo-page {
    padding: 24px 16px 56px;
  }

  .runtime-preview {
    padding: 14px;
  }
}
</style>
