import { defineConfig } from 'vitepress';

const fallbackOwner = 'codexiaoke';
const fallbackRepo = 'agentdown';
const repository = process.env.GITHUB_REPOSITORY ?? `${fallbackOwner}/${fallbackRepo}`;
const [repoOwner = fallbackOwner, repoName = fallbackRepo] = repository.split('/');
const repositoryUrl = `https://github.com/${repoOwner}/${repoName}`;
const docsBase = process.env.DOCS_BASE ?? (process.env.GITHUB_ACTIONS === 'true' ? `/${repoName}/` : '/');

export default defineConfig({
  title: 'Agentdown',
  description: '面向流式输出的 Agent Markdown UI Runtime 文档站',
  lang: 'zh-CN',
  base: docsBase,
  cleanUrls: true,
  lastUpdated: true,
  appearance: false,
  head: [
    ['meta', { name: 'theme-color', content: '#f8fafc' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Agentdown' }],
    ['meta', { property: 'og:description', content: '把 raw packet 映射成可交互、可持续更新的 Agent UI。' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${docsBase}agentdown-mark.svg` }]
  ],
  themeConfig: {
    logo: '/agentdown-mark.svg',
    siteTitle: 'Agentdown',
    nav: [
      { text: '快速开始', link: '/guide/getting-started' },
      { text: '适配器', link: '/guide/framework-adapters' },
      { text: 'Markdown', link: '/guide/markdown-rendering' },
      { text: 'Runtime', link: '/runtime/overview' },
      { text: '性能', link: '/guide/performance' },
      { text: 'API', link: '/api/run-surface' },
      { text: 'GitHub', link: repositoryUrl }
    ],
    sidebar: {
      '/guide/': [
        {
          text: '开始',
          items: [
            { text: '快速开始', link: '/guide/getting-started' },
            { text: '官方框架适配', link: '/guide/framework-adapters' },
            { text: '框架能力矩阵', link: '/guide/framework-capability-matrix' },
            { text: '自定义 Framework', link: '/guide/custom-framework' },
            { text: 'Agno 深入接入', link: '/guide/agno-adapter' },
            { text: 'Markdown 渲染', link: '/guide/markdown-rendering' },
            { text: '性能优化', link: '/guide/performance' },
            { text: '组件覆写', link: '/guide/component-overrides' }
          ]
        }
      ],
      '/runtime/': [
        {
          text: 'Runtime',
          items: [
            { text: '概览', link: '/runtime/overview' },
            { text: '协议与事件', link: '/runtime/protocol' },
            { text: 'Streaming 组装', link: '/runtime/reducer' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'API 参考',
          items: [
            { text: 'RunSurface', link: '/api/run-surface' },
            { text: 'MarkdownRenderer', link: '/api/renderer' },
            { text: 'Runtime 与 Bridge', link: '/api/runtime' },
            { text: '协议辅助函数', link: '/api/events' },
            { text: '核心类型', link: '/api/types' }
          ]
        }
      ],
      '/examples/': [
        {
          text: '示例',
          items: [{ text: 'SSE 天气示例', link: '/examples/team-mode' }]
        }
      ],
      '/reference/': [
        {
          text: '参考',
          items: [
            { text: 'V1 产品设计', link: '/reference/v1-design' },
            { text: 'V2 产品设计', link: '/reference/v2-design' },
            { text: 'Adapter Kit 2.0 RFC', link: '/reference/adapter-kit-2-rfc' },
            { text: 'FAQ', link: '/reference/faq' },
            { text: '发布清单', link: '/reference/release' },
            { text: '路线图', link: '/reference/roadmap' }
          ]
        }
      ]
    },
    socialLinks: [{ icon: 'github', link: repositoryUrl }],
    search: {
      provider: 'local'
    },
    outline: {
      level: [2, 3],
      label: '本页导航'
    },
    docFooter: {
      prev: '上一页',
      next: '下一页'
    },
    editLink: {
      pattern: `${repositoryUrl}/edit/main/docs/:path`,
      text: '在 GitHub 上编辑此页'
    },
    lastUpdatedText: '最后更新',
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright (c) 2026 xiaoke'
    }
  }
});
