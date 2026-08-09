# 独立 A2UI Vue 消费者

这个应用只从 `agentdown/a2ui` 使用 A2UI Runtime。它通过普通 JSON POST 连接 `/api/examples/a2ui`，真实调用 DeepSeek；没有 AG-UI event 或 RunAgentInput。Surface action/error 会以标准 A2UI client message 回传。

```bash
npm run backend:dev
cd examples/vue-a2ui
npm install
npm run dev
```

可通过 `VITE_AGENTDOWN_API_BASE` 覆盖后端地址。
