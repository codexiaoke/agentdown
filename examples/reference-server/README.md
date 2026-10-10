# 无模型参考后端

这个 Node 服务用于验证共享 Session 与 Vue / React 的完整流程，不调用模型，也不执行真实保存或发布操作。任务按固定步骤产生文本、步骤、工具、两项独立审批和最终报告。拒绝审批会跳过对应演示操作，任务仍可完成。

```sh
node examples/reference-server/server.mjs
node --test examples/reference-server/server.test.mjs
```

默认监听 `http://localhost:8010`，可以用 `PORT` 修改端口。测试通过导出的 `createReferenceServer({ stepDelay })` 使用随机本地端口；它返回标准 Node HTTP Server。

## HTTP 契约

| 请求 | 结果 |
| --- | --- |
| `GET /health` | 状态、协议名和已实现能力 |
| `POST /api/operations` | 接收 Core 的 `AdapterOperation`，返回 `AdapterReceipt` |
| `POST /api/operations`，`Accept: text/event-stream` | 同一次提交响应直接承载事件，不需第二次提交 |
| `GET /api/executions/:executionId/events?cursor=N` | 从已提交 cursor **之后**补发，然后继续观察实时事件 |
| `GET /api/operations/:operationId` | 返回 `{ status: 'accepted', operationId, receipt }`；未知操作返回 `404` |

操作字段与 `packages/core/src/types.ts` 一致。身份使用非空可打印 ASCII 字符串，最长 200 字符。

```json
{
  "operationId": "operation-001",
  "attemptId": "attempt-001",
  "conversationId": "conversation-001",
  "executionId": "execution-001",
  "turnId": "turn-001",
  "action": { "type": "send", "input": { "text": "帮我整理调研报告" } },
  "cursors": {}
}
```

JSON receipt：

```json
{
  "confirmation": "backend",
  "remoteId": "operation-001",
  "subscription": { "streamId": "execution-001", "executionId": "execution-001" }
}
```

POST SSE 在响应头提供 `X-Agentdown-Execution-Id`、`X-Agentdown-Operation-Id` 和 `X-Agentdown-Confirmation: backend`。握手立即完成，业务通过后续事件继续。事件 `data` 为 Core 的 `EventEnvelope`：

```json
{
  "streamId": "execution-001",
  "eventId": "1",
  "cursor": "1",
  "executionId": "execution-001",
  "event": { "type": "operation.accepted", "operationId": "operation-001", "remoteId": "operation-001" }
}
```

`streamId` 始终等于 executionId，重连不变。eventId 与 cursor 是该逻辑流内从 1 开始的递增十进制字符串。cursor 0 表示从头读取，指定 cursor 的事件本身不会重发；不接受负数、无效或超前 cursor。也可用 `Last-Event-ID` 恢复。终态事件提交后关闭流；普通客户端断线不改变后端任务状态。

审批响应是该适配器的 JSON 业务契约：

```json
{ "type": "respond", "interactionId": "execution-001:approval:save", "response": { "approved": true } }
```

两个审批必须分别提交，点击一个不会决定另一个。只有服务端 `interaction.resolved` 事件才确认决定。`cancelExecution` 由服务端提交 `cancelled` 终态，关闭连接本身不取消。`regenerate` 使用原 turn 的输入和新的 executionId。

## 故障与幂等验证

同一 operationId 的 `conversationId / executionId / turnId / action / interactionRevision` 经过规范 JSON 指纹固定；attemptId 和 cursor 可以随新投递改变。重复操作返回已接受结果，不重复创建 Run、文本或审批决定。相同 operationId 改变业务载荷返回 `409 idempotencyConflict`。审批操作可携带 `interactionRevision`，版本不匹配时返回冲突且不提交决定。不同操作重复决定已确认审批返回 `409 conflict`。

首次提交增加 `X-Agentdown-Drop-Ack: true` 时，服务端接受后立即断开响应，模拟结果不确定。任务继续执行，可以查询该 operationId，再用原业务载荷重投。重复投递不会再次触发这个故障。

## 保留与运行范围

事件和已接受操作只保存在**当前进程内存**，进程运行期间不裁剪。服务重启后查询为未知，旧 cursor 无法恢复；浏览器 Session 存档不会恢复服务端数据。这里没有账号授权、数据库、模型、真实工具执行或生产限流，CORS 为本地双框架示例开放。HTTP JSON body 默认上限为 64 KiB，过慢的观察连接在写入队列达到上限时关闭，运行任务仍继续。

测试覆盖一请求一任务、冻结载荷与重投、双审批、cursor 补发、丢失确认后对账、断线与明确取消、无效 cursor 不产生副作用，以及重新生成的身份边界。
