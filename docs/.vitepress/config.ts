import { defineConfig } from 'vitepress';

const fallbackOwner = 'codexiaoke';
const fallbackRepo = 'agentdown';
const repository = process.env.GITHUB_REPOSITORY ?? `${fallbackOwner}/${fallbackRepo}`;
const [repoOwner = fallbackOwner, repoName = fallbackRepo] = repository.split('/');
const repositoryUrl = `https://github.com/${repoOwner}/${repoName}`;
const docsBase = process.env.DOCS_BASE ?? (process.env.GITHUB_ACTIONS === 'true' ? `/${repoName}/` : '/');

export default defineConfig({
  title: 'Agentdown',
  description: '面向流式输出的 Agent Markdown UI Runtime',
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
      { text: '指南', link: '/guide/core-concepts' },
      { text: '适配器', link: '/guide/framework-adapters' },
      { text: 'API', link: '/api/runtime' },
      { text: 'GitHub', link: repositoryUrl }
    ],
    sidebar: {
      '/guide/': [
        {
          text: '指南',
          items: [
            { text: '快速开始', link: '/guide/getting-started' },
            { text: '核心概念', link: '/guide/core-concepts' },
            { text: '官方框架适配', link: '/guide/framework-adapters' },
            { text: '自定义协议接入', link: '/guide/custom-framework' },
            { text: 'RunSurface 定制', link: '/guide/run-surface' },
            { text: '流式 Markdown', link: '/guide/streaming-markdown' },
            { text: '性能优化', link: '/guide/performance' },
            { text: 'FastAPI Backend', link: '/guide/backend-fastapi' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'API 参考',
          items: [
            { text: 'Runtime 与 Bridge', link: '/api/runtime' },
            { text: 'RunSurface', link: '/api/run-surface' },
            { text: 'MarkdownRenderer', link: '/api/markdown-renderer' },
            { text: '官方适配器', link: '/api/adapters' }
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
