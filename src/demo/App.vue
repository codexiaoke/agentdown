<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type Component } from 'vue';
import BuiltinBlocksDemo from './pages/BuiltinBlocksDemo.vue';
import SseWeatherDemo from './pages/SseWeatherDemo.vue';

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
    description: '把 text / thought / code / agui / artifact / approval / timeline 走一遍。',
    component: BuiltinBlocksDemo
  },
  {
    path: '/sse-weather',
    title: 'SSE 天气示例',
    description: '演示后端 SSE JSON 如何映射到 runtime，再驱动自定义组件。',
    component: SseWeatherDemo
  }
];

function normalizeHash(hash: string): string {
  const normalized = hash.replace(/^#/, '') || routes[0]?.path || '/blocks';
  return routes.some(route => route.path === normalized) ? normalized : routes[0]?.path || '/blocks';
}

const currentPath = ref(routes[0]?.path || '/blocks');

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
