import { defineConfig } from 'vitepress';

const fallbackOwner = 'codexiaoke';
const fallbackRepo = 'agentdown';
const repository = process.env.GITHUB_REPOSITORY ?? `${fallbackOwner}/${fallbackRepo}`;
const [repoOwner = fallbackOwner, repoName = fallbackRepo] = repository.split('/');
const repositoryUrl = `https://github.com/${repoOwner}/${repoName}`;
const docsBase = process.env.DOCS_BASE ?? (process.env.GITHUB_ACTIONS === 'true' ? `/${repoName}/` : '/');

export default defineConfig({
  title: 'Agentdown',
  description: '面向 Vue 3 的 agent-native markdown UI runtime 文档站',
  lang: 'zh-CN',
  base: docsBase,
  cleanUrls: true,
  lastUpdated: true,
  appearance: false,
  head: [
    ['meta', { name: 'theme-color', content: '#f8fafc' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Agentdown' }],
    ['meta', { property: 'og:description', content: '把 agent run 变成可阅读、可回放、可干预的前端协议。' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${docsBase}agentdown-mark.svg` }]
  ],
  themeConfig: {
    logo: '/agentdown-mark.svg',
    siteTitle: 'Agentdown',
    nav: [
      { text: '快速开始', link: '/guide/getting-started' },
      { text: 'Markdown', link: '/guide/markdown-rendering' },
      { text: 'Runtime', link: '/runtime/overview' },
      { text: 'API', link: '/api/renderer' },
      { text: '示例', link: '/examples/team-mode' },
      { text: 'GitHub', link: repositoryUrl }
    ],
    sidebar: {
      '/guide/': [
        {
          text: '开始',
          items: [
            { text: '快速开始', link: '/guide/getting-started' },
            { text: 'Markdown 渲染', link: '/guide/markdown-rendering' },
            { text: '组件覆写', link: '/guide/component-overrides' }
          ]
        }
      ],
      '/runtime/': [
        {
          text: 'AGUI Runtime',
          items: [
            { text: '概览', link: '/runtime/overview' },
            { text: '协议与事件', link: '/runtime/protocol' },
            { text: 'Reducer 扩展', link: '/runtime/reducer' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'API 参考',
          items: [
            { text: 'MarkdownRenderer', link: '/api/renderer' },
            { text: 'Runtime 与 Hooks', link: '/api/runtime' },
            { text: '事件 Helpers', link: '/api/events' },
            { text: '核心类型', link: '/api/types' }
          ]
        }
      ],
      '/examples/': [
        {
          text: '示例',
          items: [{ text: 'Team Mode', link: '/examples/team-mode' }]
        }
      ],
      '/reference/': [
        {
          text: '参考',
          items: [
            { text: 'V1 产品设计', link: '/reference/v1-design' },
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
