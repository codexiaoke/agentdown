# Agentdown FastAPI Backend

这是一个真实的 FastAPI SSE backend，不再包含 demo/mock 流。

它提供了这些真实流式接口：

- `/api/stream/agno`
- `/api/stream/langchain`
- `/api/stream/autogen`
- `/api/stream/crewai`

其中：

- 所有 endpoint 都是 `DeepSeek + 真 Agent + 真工具调用`
- 会直接返回各自框架原生事件风格，不再套一层统一协议
- `lookup_weather` 会真的请求公开天气 API

## 运行

先复制环境变量模板：

```bash
cp backend/.env.example backend/.env
```

然后填写 `backend/.env` 里的 `DEEPSEEK_API_KEY`。

```bash
python3 backend/run.py
```

或者：

```bash
uv run --project backend uvicorn app.main:app --app-dir backend --reload --port 8000
```

上面两种启动方式都会自动读取 `backend/.env`。

启动后可以先访问：

```bash
curl http://127.0.0.1:8000/api/health
```

## 发送一个 SSE 请求

```bash
curl -N \
  -X POST http://127.0.0.1:8000/api/stream/agno \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "帮我查一下北京天气，并说明工具调用过程。"
  }'
```

如果你要测试真实框架模式，需要自己额外安装对应依赖，并设置 `DeepSeek` 环境变量：

```bash
DEEPSEEK_API_KEY=your_key
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

推荐直接安装真实框架依赖组：

```bash
uv sync --project backend --extra frameworks
```

然后直接请求你要联调的框架 endpoint：

```json
{
  "message": "帮我查一下上海天气"
}
```

建议天气这类带工具调用的 agent 保持 `DEEPSEEK_MODEL=deepseek-chat`，因为 `deepseek-reasoner` 并不适合这里的工具调用主链。

如果真实框架运行失败，当前 endpoint 会直接返回错误事件。

## 推荐前端接法

如果你要做官方 adapter：

- `/api/stream/agno` 对应 `createAgnoAdapter()`
- `/api/stream/langchain` 对应 `createLangChainAdapter()`
- `/api/stream/autogen` 对应 `createAutoGenAdapter()`
- `/api/stream/crewai` 对应 `createCrewAIAdapter()`

这样前端 adapter 可以直接对着真实框架 SSE 联调。
