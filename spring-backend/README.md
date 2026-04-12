# spring-backend

基于 `Spring Boot 3.5.13 + Spring AI DeepSeek` 的独立后端示例。

当前这版已经切到一套不依赖 LangChain4j 的真实流式链路，核心能力包括：

- 正式 SSE 入口：`POST /api/stream/springai`
- 兼容迁移入口：`POST /api/stream/langchain`
- 直接调用 `DeepSeekApi.chatCompletionStream(...)` 获取真实流式 chunk
- 使用真实 `Open-Meteo` 天气工具
- 支持工具调用前的 HITL 暂停与恢复
- 通过 `SSE` 持续输出文本、工具、审批、完成等事件

## 环境变量

最少需要配置：

```bash
export DEEPSEEK_API_KEY="你的 DeepSeek API Key"
```

可选配置：

```bash
export DEEPSEEK_BASE_URL="https://api.deepseek.com/v1"
export DEEPSEEK_MODEL="deepseek-chat"
export DEEPSEEK_TEMPERATURE="0.3"
export DEEPSEEK_MAX_TOKENS="1024"
export DEEPSEEK_COMPLETIONS_PATH="/chat/completions"
export SERVER_PORT="8080"
```

## 运行

你可以直接用 IDEA 的 Spring Boot 运行配置启动 `com.xiaoke.springbackend.SpringBackendApplication`。

如果你想命令行运行，也可以用 IDEA 自带 Maven：

```bash
'/Applications/IntelliJ IDEA.app/Contents/plugins/maven/lib/maven3/bin/mvn' spring-boot:run
```

## 请求示例

普通流式对话：

```bash
curl -N -X POST 'http://127.0.0.1:8080/api/stream/springai' \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "帮我查一下北京天气，并说明工具调用过程。"
  }'
```

同一个 session 继续发问：

```bash
curl -N -X POST 'http://127.0.0.1:8080/api/stream/springai' \
  -H 'Content-Type: application/json' \
  -d '{
    "session_id": "上一次 SSE 返回的 session_id",
    "message": "那上海呢？"
  }'
```

开启 HITL，先暂停等待审批：

```bash
curl -N -X POST 'http://127.0.0.1:8080/api/stream/springai' \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "帮我查一下北京天气",
    "mode": "hitl"
  }'
```

恢复一个已暂停的审批：

```bash
curl -N -X POST 'http://127.0.0.1:8080/api/stream/springai' \
  -H 'Content-Type: application/json' \
  -d '{
    "session_id": "上一次 SSE 返回的 session_id",
    "mode": "hitl",
    "springai_resume": {
      "decisions": [
        {
          "type": "approve"
        }
      ]
    }
  }'
```

## SSE 事件

当前会输出这些事件：

- `session.created`
- `session.resumed`
- `run.started`
- `response.started`
- `response.delta`
- `approval.required`
- `approval.resolved`
- `tool.started`
- `tool.completed`
- `tool.error`
- `response.completed`
- `run.completed`
- `done`
- `error`

每条 `data` 都是 JSON 字符串，事件体里会包含：

- `metadata.framework`
- `metadata.session_id`
- `metadata.run_id`
- `metadata.turn_id`
- `metadata.message_id`

## 测试

当前已经补了一套严格单测，覆盖：

- 文本流输出
- 流式 tool call 片段聚合
- HITL 暂停
- approve / edit / reject 恢复
- 工具失败后继续收尾

运行：

```bash
'/Applications/IntelliJ IDEA.app/Contents/plugins/maven/lib/maven3/bin/mvn' test
```
