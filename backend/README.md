# Agentdown FastAPI Backend

这个 `backend/` 目录提供的是一个真实的 FastAPI SSE backend，用来和前端适配层直接联调。

它不是 mock，也不是 demo 文本流，而是：

- `DeepSeek` 大模型
- 真实 Agent 框架
- 真实工具调用
- 原始框架事件直接透出

当前提供这些 endpoint：

- `/api/stream/agno`
- `/api/stream/langchain`
- `/api/stream/autogen`
- `/api/stream/crewai`

## 设计原则

- 后端直接返回各框架官方事件风格
- 不再包一层“Agentdown 统一后端协议”
- 前端通过官方 adapter 直接消费这些事件

也就是说，推荐前端入口分别是：

- `defineAgnoPreset()` / `createAgnoProtocol()`
- `defineLangChainPreset()` / `createLangChainProtocol()`
- `defineAutoGenPreset()` / `createAutoGenProtocol()`
- `defineCrewAIPreset()` / `createCrewAIProtocol()`

其中 CrewAI 前端如果直接消费 SSE 文本，还要配合：

- `parseCrewAISseMessage()`

## 框架能力矩阵

| 框架 | 真实流式文本 | 工具调用 | 内置暂停继续 | 备注 |
| --- | --- | --- | --- | --- |
| Agno | 支持 | 支持 | 支持 | 更适合做 requirement / approval 类场景 |
| LangChain | 支持 | 支持 | 支持 | 更适合做 interrupt / approval 类场景 |
| AutoGen | 支持 | 支持 | 支持 | 当前主打官方 handoff 人机交互 |
| CrewAI | 支持 | 支持 | 不默认提供 | 当前 endpoint 主打官方 SSE chunk 与 `CrewOutput`，不默认暴露操作级审批 |

## 环境准备

先复制环境变量模板：

```bash
cp backend/.env.example backend/.env
```

至少需要填写：

```env
DEEPSEEK_API_KEY=your_key
```

可选项：

```env
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

建议带工具调用的场景优先使用 `deepseek-chat`。

## 安装真实框架依赖

如果你要联调真实 Agno、LangChain、AutoGen、CrewAI，请安装 frameworks 依赖组：

```bash
uv sync --project backend --extra frameworks
```

## 启动

最简单的方式：

```bash
python3 backend/run.py
```

或者：

```bash
uv run --project backend uvicorn app.main:app --app-dir backend --reload --port 8000
```

这两种方式都会自动读取 `backend/.env`。

## 健康检查

```bash
curl http://127.0.0.1:8000/api/health
```

## 请求示例

### Agno

```bash
curl -N \
  -X POST http://127.0.0.1:8000/api/stream/agno \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "帮我查一下北京天气，并说明工具调用过程。"
  }'
```

### LangChain

```bash
curl -N \
  -X POST http://127.0.0.1:8000/api/stream/langchain \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "帮我查一下北京天气，并说明工具调用过程。"
  }'
```

如果你想快速确认“真实 LangChain 后端 + DeepSeek + 天气工具 + SSE”整条链是否已经接通，可以直接跑：

```bash
npm run backend:smoke:langchain
```

它会自动校验这些关键点：

- 收到根 `on_chain_start`
- 收到 `on_tool_start`
- 收到 `on_tool_end`
- 收到根 `on_chain_end`
- 收到真实 assistant 流式文本

也可以覆写目标地址和 prompt：

```bash
uv run --project backend python backend/scripts/smoke_langchain.py \
  --base-url http://127.0.0.1:8000 \
  --prompt "帮我查一下北京天气，并说明工具调用过程。"
```

### AutoGen

```bash
curl -N \
  -X POST http://127.0.0.1:8000/api/stream/autogen \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "帮我查一下北京天气，并说明工具调用过程。"
  }'
```

### CrewAI

```bash
curl -N \
  -X POST http://127.0.0.1:8000/api/stream/crewai \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "帮我查一下北京天气，并说明工具调用过程。"
  }'
```

如果你想快速确认“真实 CrewAI 后端 + DeepSeek + 天气工具 + SSE”整条链是否已经接通，可以直接跑：

```bash
npm run backend:smoke:crewai
```

## 推荐前端联调路径

最推荐的接法是：

1. 启动这个 FastAPI backend
2. 在前端用 `defineAgnoPreset()` 或其他框架 preset 创建 session
3. 用 `createSseTransport()` 直接请求对应 endpoint
4. 用 `RunSurface` 渲染 runtime

如果你想自定义工具卡片：

- 用 `defineAgnoToolComponents()` / `defineLangChainToolComponents()` 等 helper

如果你想在某个原始 SSE 事件到来时额外插入自定义组件：

- 用 `defineAgnoEventComponents()` / `defineLangChainEventComponents()` 等 helper
- 再用 `composeProtocols()` 叠加到主协议上

## 出错时会发生什么

如果真实框架运行失败，当前 endpoint 会直接返回错误事件。  
前端 adapter 会把它映射成 runtime error / run finish，方便你在 UI 里直接展示。
