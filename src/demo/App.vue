<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type Component } from 'vue';
import BuiltinBlocksDemo from './pages/BuiltinBlocksDemo.vue';
import DevtoolsDemo from './pages/DevtoolsDemo.vue';
import DevtoolsReplayDemo from './pages/DevtoolsReplayDemo.vue';
import DraftOverlayDemo from './pages/DraftOverlayDemo.vue';
import HumanLoopDemo from './pages/HumanLoopDemo.vue';
import LongDocumentDemo from './pages/LongDocumentDemo.vue';
import PerformanceLabDemo from './pages/PerformanceLabDemo.vue';
import PretextDemo from './pages/PretextDemo.vue';
import ProtocolHelpersDemo from './pages/ProtocolHelpersDemo.vue';
import ReplayTranscriptDemo from './pages/ReplayTranscriptDemo.vue';
import SseAutoGenDemo from './pages/SseAutoGenDemo.vue';
import SseCrewAIDemo from './pages/SseCrewAIDemo.vue';
import SseLangChainDemo from './pages/SseLangChainDemo.vue';
import SseSpringAiDemo from './pages/SseSpringAiDemo.vue';
import SseWeatherDemo from './pages/SseWeatherDemo.vue';
import StreamingBenchmarkDemo from './pages/StreamingBenchmarkDemo.vue';
import StreamingMarkdownDemo from './pages/StreamingMarkdownDemo.vue';
import UserFileDemo from './pages/UserFileDemo.vue';

/**
 * demo 路由的最小描述结构。
 */
interface DemoRoute {
  path: string;
  title: string;
  description: string;
  component: Component;
}

const routes: DemoRoute[] = [
  {
    path: '/blocks',
    title: '内置块总览',
    description: '把 text / thought / code / agui / artifact / approval / attachment / branch / handoff 走一遍。',
    component: BuiltinBlocksDemo
  },
  {
    path: '/long-document',
    title: '长文档总览',
    description: '一页覆盖常用 Markdown 和 Agentdown 扩展语法，并测试长文阅读效果。',
    component: LongDocumentDemo
  },
  {
    path: '/pretext',
    title: 'Pretext 演示',
    description: '只展示会命中 pretext 的标题、段落和行内样式，拖动宽度直接看排版变化。',
    component: PretextDemo
  },
  {
    path: '/performance-lab',
    title: '性能实验室',
    description: '切换基线和优化方案，直接观察 DOM、挂载块数与滚动窗口变化。',
    component: PerformanceLabDemo
  },
  {
    path: '/streaming-benchmark',
    title: '流式性能基准',
    description: '针对长文档流式输出跑真实 RunSurface 基准，页面和脚本都能直接取结果。',
    component: StreamingBenchmarkDemo
  },
  {
    path: '/devtools',
    title: 'Devtools 调试页',
    description: '本地事件流演示 events / trace / effects / diff 四类日志，不依赖真实后端。',
    component: DevtoolsDemo
  },
  {
    path: '/devtools-replay',
    title: 'Replay Debugger',
    description: '按 reproduction packet 逐步回放 runtime，直接定位当前事件影响了哪些 block。',
    component: DevtoolsReplayDemo
  },
  {
    path: '/draft-overlay',
    title: 'Draft Overlay',
    description: '单独观察代码块和表格从 draft 到 stable 的过程，专门看 RunSurfaceDraftOverlay。',
    component: DraftOverlayDemo
  },
  {
    path: '/sse-weather',
    title: 'Agno 真实 SSE',
    description: '直接请求真实 /api/stream/agno，并展示 useAgnoChatSession()、draft overlay 和 Agent Devtools。',
    component: SseWeatherDemo
  },
  {
    path: '/sse-autogen',
    title: 'AutoGen 真实 SSE',
    description: '直接请求真实 /api/stream/autogen，演示官方 handoff 暂停与人工继续。',
    component: SseAutoGenDemo
  },
  {
    path: '/sse-langchain',
    title: 'LangChain 真实 SSE',
    description: '直接请求真实 /api/stream/langchain，支持 Spring Boot / FastAPI 切换，并演示官方 HITL approve / edit / reject。',
    component: SseLangChainDemo
  },
  {
    path: '/sse-springai',
    title: 'Spring AI 真实 SSE',
    description: '直接请求真实 /api/stream/springai，演示 approval 的 approve / edit / reject，以及 useSpringAiChatSession() 的接入方式。',
    component: SseSpringAiDemo
  },
  {
    path: '/sse-crewai',
    title: 'CrewAI 真实 SSE',
    description: '直接请求真实 /api/stream/crewai，演示官方 SSE chunk、工具调用和最终 CrewOutput 渲染。',
    component: SseCrewAIDemo
  },
  {
    path: '/protocol-helpers',
    title: '高阶 Helper',
    description: '演示 helper protocol factory，统一管理 content.replace、artifact.upsert、approval.update。',
    component: ProtocolHelpersDemo
  },
  {
    path: '/human-loop',
    title: 'Human-In-The-Loop',
    description: '用户附件、审批动作、branch、handoff 和 runtime intent 的完整联动示例。',
    component: HumanLoopDemo
  },
  {
    path: '/replay-transcript',
    title: 'Replay / Transcript',
    description: '演示 useAgentSession 怎么把 session、transcript 和 replay 收成一个入口。',
    component: ReplayTranscriptDemo
  },
  {
    path: '/streaming-markdown',
    title: '流式 Markdown',
    description: '演示 useAsyncIterableBridge 接本地 token 流，并附带 draft overlay + Agent Devtools 观察协议与稳定化过程。',
    component: StreamingMarkdownDemo
  },
  {
    path: '/user-file',
    title: '用户上传文件',
    description: '演示用户消息也可以挂 attachment block，而不只是纯文本。',
    component: UserFileDemo
  }
];

/**
 * 把 hash 规范化成已存在的 demo 路由路径。
 */
function normalizeHash(hash: string): string {
  const normalized = hash.replace(/^#/, '') || routes[0]?.path || '/blocks';
  const normalizedPath = normalized.split('?')[0] ?? normalized;

  return routes.some(route => route.path === normalizedPath)
    ? normalizedPath
    : routes[0]?.path || '/blocks';
}

const currentPath = ref(routes[0]?.path || '/blocks');

/**
 * 根据当前地址栏 hash 同步页面路由状态。
 */
function syncRoute() {
  const normalized = normalizeHash(window.location.hash);
  currentPath.value = normalized;
  const currentHash = window.location.hash.replace(/^#/, '');
  const currentHashPath = currentHash.split('?')[0] ?? currentHash;

  if (currentHashPath !== normalized) {
    window.location.hash = normalized;
  }
}

const fallbackRoute = routes[0]!;
const currentRoute = computed<DemoRoute>(() =>
  routes.find(route => route.path === currentPath.value) ?? fallbackRoute
);

onMounted(() => {
  syncRoute();
  window.addEventListener('hashchange', syncRoute);
});

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', syncRoute);
});
</script>

<template>
  <div class="demo-shell">
    <aside class="demo-sidebar">
      <div class="demo-sidebar__head">
        <span class="demo-sidebar__eyebrow">Agentdown Demo</span>
        <h1>示例路由</h1>
        <p>把 demo 拆成多页，后面可以继续往里加，不用把所有内容塞在一个页面里。</p>
      </div>

      <nav class="demo-nav">
        <a
          v-for="route in routes"
          :key="route.path"
          class="demo-nav__item"
          :class="{ 'demo-nav__item--active': route.path === currentRoute.path }"
          :href="`#${route.path}`"
        >
          <strong>{{ route.title }}</strong>
          <span>{{ route.description }}</span>
        </a>
      </nav>
    </aside>

    <main class="demo-main">
      <component :is="currentRoute.component" />
    </main>
  </div>
</template>

<style scoped>
.demo-shell {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  min-height: 100vh;
  background: #f8fafc;
  color: #0f172a;
  font-family:
    "Avenir Next",
    "PingFang SC",
    "Microsoft YaHei",
    sans-serif;
}

.demo-sidebar {
  border-right: 1px solid #e5e7eb;
  padding: 28px 20px;
  background: #ffffff;
}

.demo-sidebar__head h1,
.demo-sidebar__head p {
  margin: 0;
}

.demo-sidebar__eyebrow {
  display: inline-block;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.demo-sidebar__head h1 {
  margin-top: 8px;
  font-size: 24px;
  letter-spacing: -0.04em;
}

.demo-sidebar__head p {
  margin-top: 10px;
  color: #475569;
  font-size: 14px;
  line-height: 1.8;
}

.demo-nav {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 28px;
}

.demo-nav__item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 14px;
  color: inherit;
  text-decoration: none;
  background: #ffffff;
}

.demo-nav__item strong {
  font-size: 14px;
}

.demo-nav__item span {
  color: #64748b;
  font-size: 12px;
  line-height: 1.7;
}

.demo-nav__item--active {
  border-color: #bfdbfe;
  background: #eff6ff;
}

.demo-main {
  min-width: 0;
}

@media (max-width: 960px) {
  .demo-shell {
    grid-template-columns: 1fr;
  }

  .demo-sidebar {
    border-right: 0;
    border-bottom: 1px solid #e5e7eb;
  }
}
</style>
