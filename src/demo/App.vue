<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type Component } from 'vue';
import BuiltinBlocksDemo from './pages/BuiltinBlocksDemo.vue';
import LongDocumentDemo from './pages/LongDocumentDemo.vue';
import PerformanceLabDemo from './pages/PerformanceLabDemo.vue';
import ProtocolHelpersDemo from './pages/ProtocolHelpersDemo.vue';
import ReplayTranscriptDemo from './pages/ReplayTranscriptDemo.vue';
import SseWeatherDemo from './pages/SseWeatherDemo.vue';
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
    description: '把 text / thought / code / agui / artifact / approval 走一遍。',
    component: BuiltinBlocksDemo
  },
  {
    path: '/long-document',
    title: '长文档总览',
    description: '一页覆盖常用 Markdown 和 Agentdown 扩展语法，并测试长文阅读效果。',
    component: LongDocumentDemo
  },
  {
    path: '/performance-lab',
    title: '性能实验室',
    description: '切换基线和优化方案，直接观察 DOM、挂载块数与滚动窗口变化。',
    component: PerformanceLabDemo
  },
  {
    path: '/sse-weather',
    title: 'Agno 真实 SSE',
    description: '直接请求真实 /api/stream/agno，并用官方事件适配层映射成聊天内容和工具组件。',
    component: SseWeatherDemo
  },
  {
    path: '/protocol-helpers',
    title: '高阶 Helper',
    description: '演示 helper protocol factory，统一管理 content.replace、artifact.upsert、approval.update。',
    component: ProtocolHelpersDemo
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
    description: '演示 useAsyncIterableBridge 接本地 token 流，code/table 只在结构完整后稳定渲染。',
    component: StreamingMarkdownDemo
  },
  {
    path: '/user-file',
    title: '用户上传文件',
    description: '演示用户消息也可以是 artifact block，而不只是纯文本。',
    component: UserFileDemo
  }
];

/**
 * 把 hash 规范化成已存在的 demo 路由路径。
 */
function normalizeHash(hash: string): string {
  const normalized = hash.replace(/^#/, '') || routes[0]?.path || '/blocks';
  return routes.some(route => route.path === normalized) ? normalized : routes[0]?.path || '/blocks';
}

const currentPath = ref(routes[0]?.path || '/blocks');

/**
 * 根据当前地址栏 hash 同步页面路由状态。
 */
function syncRoute() {
  const normalized = normalizeHash(window.location.hash);
  currentPath.value = normalized;

  if (window.location.hash !== `#${normalized}`) {
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
