---
title: 配置与扩展
description: 用应用级实例、子树 Provider 和组件 props 管理 Runtime、Renderer 与诊断默认值。
---

# 配置与扩展

推荐从一个应用级实例开始。它让 Vue plugin、Runtime 可靠性策略和诊断出口使用同一份配置：

```ts
import { createApp } from 'vue';
import { createAgentdown } from 'agentdown';
import App from './App.vue';

const agentdown = createAgentdown({
  runtime: {
    limits: {
      maxNodes: 5_000,
      maxBlocks: 10_000,
      maxHistoryEntries: 2_000
    }
  },
  markdown: {
    performance: {
      mode: 'window',
      virtualize: true
    }
  },
  surface: {
    performance: {
      groupWindow: 60,
      lazyMount: true
    }
  },
  diagnostics: {
    handlers: [event => telemetry.capture('agentdown', event)]
  }
});

const runtime = agentdown.createRuntime();
createApp(App).use(agentdown.plugin).mount('#app');
```

`createAgentdown()` 会在安装前校验配置。`createRuntime(overrides)` 的实例级参数会覆盖应用默认值，
但仍保留结构化诊断出口。

## 分层优先级

配置从低到高按以下顺序合并：

1. `createAgentdown()` / `createAgentdownPlugin()` 的应用默认值
2. `AgentdownProvider` 的子树默认值
3. `MarkdownRenderer` / `RunSurface` 的组件 props

对象注册表和性能对象按字段合并；Markdown `plugins` 在更高层提供时完整替换，避免同一个
markdown-it 插件被重复注册。诊断 handlers 则按层级追加，让应用级监控不会被业务子树静默覆盖。

```vue
<AgentdownProvider
  :config="{
    surface: {
      renderers: billingRenderers,
      messageActions: billingMessageActions
    }
  }"
>
  <RunSurface
    :runtime="runtime"
    :performance="{ groupWindow: 30 }"
  />
</AgentdownProvider>
```

## 可配置范围

| 配置段 | 作用 |
| --- | --- |
| `theme` | 语义 token、组件 token 和 CSS 变量 |
| `runtime` | 节点、block、intent、history 容量和 listener error hook |
| `markdown` | 性能、HTML sanitizer、受控组件、内置组件和 markdown-it plugins |
| `surface` | 性能、业务 renderer、消息 shell、动作、审批和 handoff 默认值 |
| `diagnostics` | 可接 Sentry、OpenTelemetry 或宿主日志系统的结构化事件 handlers |

组件 props 永远保留，因此同一个应用可以在聊天页使用 typing 模式，在长报告页使用 window 模式，
也可以只在某个业务子树注册私有 renderer。

## 启动诊断

`inspectConfig()` 返回不包含组件实现和函数源码的摘要，可安全放入启动日志或问题报告：

```ts
console.info(agentdown.inspectConfig());
```

摘要包含实际 Runtime 上限、Markdown plugin/组件数量、Surface renderer 数量和诊断 handler
数量。Runtime listener 与 A2UI 处理错误会通过 `AgentdownDiagnostic` 上报；单个诊断 handler
失败会被隔离，不会中断 UI。

## A2UI 配置边界

A2UI 是可选入口，Catalog、协议版本、安全策略和业务 execution state 继续由
`A2UiSurface` props 或 `useAgUiA2UiChatSession({ a2uiRenderer })` 管理。它们不放进核心
`AgentdownConfig`，这样只使用 Markdown/Runtime 的项目不会被迫安装 A2UI peer dependency。

仓库 FastAPI 只负责示例和端到端测试；前端配置不会假设会话、幂等或业务 action 存储在浏览器中。
