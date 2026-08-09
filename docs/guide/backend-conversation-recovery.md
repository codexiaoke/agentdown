---
title: 后端会话恢复与断线续传
description: 后端权威会话、事件游标、请求幂等和前端恢复契约。
---

# 后端会话恢复与断线续传

Agentdown 的会话真相在后端。浏览器只保存当前连接需要的临时状态，不把 IndexedDB、runtime snapshot 或组件状态当作权威存储。

```text
页面加载 -> GET 后端事件归档 -> adapter 恢复 runtime
        -> POST SSE 携带 request id + cursor
        -> 断流后用同一 request id + 最新 cursor 重连
        -> 后端只补缺失事件 -> 前端按 SSE id 去重
```

## 统一 HTTP 契约

FastAPI 与 Spring 示例后端使用相同字段：

- `session_id`：后端会话 id。
- `client_request_id`：一次发送或 HITL 恢复操作的稳定幂等键。
- `after_cursor`：前端已经应用的最后游标。
- `Idempotency-Key`：可替代 `client_request_id` 的请求头。
- `Last-Event-ID`：可替代 `after_cursor` 的 SSE 标准请求头。

每条 SSE 都带 `id: {conversation_id}:{cursor}`。游标在同一会话内严格递增；客户端断开不会取消后端生产任务。

同一幂等键与相同请求体重连时，后端复用已有运行。相同幂等键承载不同请求时返回 `409 Conflict`；非法游标返回 `422 Unprocessable Entity`。

## 会话归档

刷新时请求：

```http
GET /api/v1/conversations/{conversation_id}
```

响应格式固定为 `agentdown.conversation/v1`：

```json
{
  "format": "agentdown.conversation/v1",
  "conversation_id": "session:weather",
  "provider_id": "springai",
  "latest_cursor": 12,
  "status": "completed",
  "updated_at": "2026-08-09T05:00:00Z",
  "events": [
    {
      "cursor": 12,
      "event_id": "session:weather:12",
      "request_id": "request:send-1",
      "event": "done",
      "data": { "event": "done", "data": {} },
      "created_at": "2026-08-09T05:00:00Z"
    }
  ]
}
```

这里保存框架原始事件，而不是浏览器渲染结果。恢复时仍由 Agno、LangChain、AutoGen、CrewAI 或 Spring AI adapter 解释事件，避免后端与前端各维护一套渲染语义。

## 前端接入

`use*ChatSession()` 会自动生成 `client_request_id`、推进 `eventCursor`、重连时携带游标，并过滤重复 SSE `id`。

```ts
const session = useSpringAiChatSession({
  source: '/api/stream/springai',
  conversationId: 'session:weather',
  reconnect: {
    retries: 4
  }
})

await session.loadConversation(async (conversationId) => {
  const response = await fetch(`/api/v1/conversations/${encodeURIComponent(conversationId)}`)

  if (!response.ok) {
    throw new Error(`恢复会话失败：${response.status}`)
  }

  return response.json()
})
```

页面可以直接读取：

- `session.eventCursor`：已经应用的后端游标。
- `session.clientRequestId`：当前操作的幂等键。
- `session.connectionState`：`idle / recovering / connecting / reconnecting / recovered / failed`。
- `session.restoreConversation(archive)`：直接恢复已获取的后端事件归档。

归档中如果存在 `approval.required`、interrupt 或 handoff，adapter 会恢复对应待处理卡片；随后提交决策会创建新的幂等操作，并继续沿用同一后端会话。

## 存储实现边界

仓库里的 FastAPI 和 Spring 实现是进程内参考存储，已经具备后端权威、幂等运行、断线后继续生产和按游标补发的完整语义，但服务重启后数据会消失。

线上部署应把事件日志和运行索引替换成 PostgreSQL/Redis 等持久化实现，并保留这里定义的 HTTP 契约。前端不需要随存储实现变化。
