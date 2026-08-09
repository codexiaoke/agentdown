# 纯 AG-UI Vue 消费者

这个应用只从 `agentdown/ag-ui` 使用 `useAgUiChatSession()`。它连接 FastAPI 的 `/api/examples/agui`，该端点真实调用 DeepSeek 并只发送标准 AG-UI lifecycle/text events，不包含 A2UI 扩展。

```bash
npm run backend:dev
cd examples/vue-ag-ui
npm install
npm run dev
```

可通过 `VITE_AGENTDOWN_API_BASE` 覆盖后端地址。
