---
title: FastAPI Backend
description: 使用仓库内置测试 backend 联调统一 Chat 与各协议适配层。
---

# FastAPI Backend

仓库里的 `backend/` 是前端库的测试与参考后端，不是 Agentdown 的生产服务端要求。它会真实调用模型与框架，而不是返回硬编码页面数据。

它的定位是：

- 真实 DeepSeek 模型
- 真实 Agent 框架
- 真实工具调用
- 真实 SSE 输出

## 当前 endpoint

| 路径 | 框架 | 默认定位 |
| --- | --- | --- |
| `/api/stream/chat` | Agentdown Chat | 一个 AG-UI 流按语义返回文字、前端组件或 A2UI |
| `/api/stream/agno` | Agno | 聊天 + requirement / approval |
| `/api/stream/langchain` | LangChain | interrupt / review |
| `/api/stream/autogen` | AutoGen | handoff / 人机接力 |
| `/api/stream/crewai` | CrewAI | 官方 SSE chunk + 工具展示 + `CrewOutput` |
| `/api/v1/conversations/{conversation_id}` | 通用 | 后端权威原始事件归档 |
| `/api/v1/conversations/{conversation_id}/events` | 通用 | 按 request id 与游标只读续接已有运行 |

## 设计原则

- 后端直接返回官方风格事件
- 不再额外包一层 Agentdown 专属后端协议
- 前端适配层直接消费这些事件
- 页面刷新读取后端事件归档；运行中的会话通过 GET 事件接口续接，不重复 POST prompt

## 环境变量

先复制：

```bash
cp backend/.env.example backend/.env
```

至少需要：

```dotenv
DEEPSEEK_API_KEY=your_key
```

常见可选项：

```dotenv
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
AGENTDOWN_REDIS_URL=redis://127.0.0.1:6379/0
```

## 启动

```bash
python3 backend/run.py
```

或者：

```bash
uv run --project backend uvicorn app.main:app --app-dir backend --reload --port 8000
```

## 健康检查

```bash
curl http://127.0.0.1:8000/api/health
```

## smoke 脚本

当前已经内置：

```bash
npm run backend:smoke:langchain
npm run backend:smoke:crewai
```

推荐联调顺序：

1. 先起 backend
2. 先跑 smoke 脚本
3. 再打开前端 demo 页面

这样可以先确认“事件真的出来了”，再确认“前端是不是映射对了”。

## CrewAI 的说明

当前内置 backend 对 CrewAI 的默认定位是：

- 真实文本流
- 真实工具调用
- 最终 `CrewOutput`

它不是当前版本里主打“操作级审批”的框架入口。
