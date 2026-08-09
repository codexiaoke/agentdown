# AG-UI + A2UI Vue 消费者

这个应用显式使用 `agentdown/ag-ui-a2ui`。首次请求会发送 A2UI capabilities，后端真实调用 DeepSeek，并通过 AG-UI `CUSTOM name=a2ui` 返回经过校验的 Surface；action/error 继续走标准 RunAgentInput。

```bash
npm run backend:dev
cd examples/vue-ag-ui-a2ui
npm install
npm run dev
```

可通过 `VITE_AGENTDOWN_API_BASE` 覆盖后端地址。
