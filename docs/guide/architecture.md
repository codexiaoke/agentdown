---
title: 内部架构边界
description: Agentdown 核心模块的职责、依赖方向和扩展约束。
---

# 内部架构边界

Agentdown 的稳定主链是：

```text
raw packet -> transport -> protocol -> bridge -> assembler -> runtime -> surface
```

每一层只处理一种变化来源，新增能力时应优先扩展现有边界，不在相邻层重复维护状态。

## 模块职责

| 模块 | 职责 | 不负责 |
| --- | --- | --- |
| `core` | Markdown 解析、受控组件指令、结构化 Markdown block | 会话状态、网络连接 |
| `runtime` | 命令、节点、surface block、流式组装、事件消费 | Vue 组件、框架专用事件判断 |
| `adapters` | 把框架原生事件映射成 RuntimeCommand | 重新定义 runtime 状态模型 |
| `persisted` | 校验 archive、把 records 恢复成 RuntimeCommand | 保存数据库、重放原始 SSE |
| `recovery` | 描述后端事件归档、跟踪 SSE 游标和重复事件 | 在浏览器持久化会话、替代后端事件日志 |
| `surface` | 定义 RunSurface 的渲染和交互契约 | 消费网络事件 |
| `components` | Vue 页面组件和 block renderer | 解析框架原生 packet |
| `devtools` | 观察、记录、比较和回放 runtime 行为 | 修改业务协议语义 |

## 依赖方向

```text
components -> surface -> runtime
     |           |         ^
     v           v         |
    core      persisted ---+

adapters -> runtime
recovery -> runtime types
devtools -> runtime
```

约束：

- `runtime` 不导入 Vue 组件或具体 Agent 框架。
- `core` 不读取会话、transport 或 adapter 状态。
- `adapters/shared` 只承载各框架行为完全一致的机制。
- 框架事件字段、默认 id 和 HITL 语义保留在对应 adapter 内。
- Vue 组件通过 runtime/surface 类型读取状态，不直接判断 Agno、LangChain 等原始事件。

## 稳定身份模型

| 标识 | 作用域 |
| --- | --- |
| `conversationId` | 整段会话 |
| `turnId` | 一次用户输入及其后续执行 |
| `messageId` | 某一角色的一条逻辑消息 |
| `groupId` | Surface 上连续渲染的一组 block |
| `block.id` | 单个渲染块 |
| `node.id` | run、tool、approval 等运行态实体 |

存档恢复必须让 metadata 和生成的 RuntimeCommand 使用同一个 `conversationId`。

## 受控组件和 AG-UI

`:::vue-component` 产生的是 Agentdown `component` block，通过 `componentRegistry` 挂载本地 Vue 组件。

它不是标准 AG-UI 协议。未来增加 AG-UI 支持时，应作为新的 protocol/adapter 接入，再映射到现有 RuntimeCommand，不复用 `component` 的命名空间表达传输协议。

## 公共 API 原则

- 每项能力只保留一个正式名称，不提供无实际迁移需求的别名。
- 页面接入优先公开高阶 `use*ChatSession()`。
- 自定义框架扩展公开 adapter、protocol、transport 和 RuntimeCommand。
- `src/index.ts` 只导出调用方需要组合或标注类型的入口。
- 纯内部诊断、合并和状态辅助函数默认不导出。

## 变更检查

内部架构改动完成后至少执行：

```bash
npm test
npm run typecheck
npm run build
npm run docs:build
npm run pack:check
```

涉及 FastAPI 或 Spring 示例时，再分别执行 backend compile 和 Maven tests。
