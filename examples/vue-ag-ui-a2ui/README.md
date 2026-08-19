# 统一 Chat Vue 消费者

这个应用使用主入口 `useAgentChat()` 连接 `/api/stream/chat`。首次请求会发送 A2UI capabilities，后端真实调用 DeepSeek，并在同一个标准 AG-UI 流中选择普通文字、前端组件或经过校验的 A2UI Surface；action/error 继续走标准 RunAgentInput。

```bash
npm run backend:dev
cd examples/vue-ag-ui-a2ui
npm install
npm run dev
```

可通过 `VITE_AGENTDOWN_API_BASE` 覆盖后端地址。
