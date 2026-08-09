# Agentdown 独立消费者示例

这里的三个 Vue 应用分别验证三个公开入口，且都连接真实 DeepSeek 后端：

- `vue-ag-ui`：只使用标准 AG-UI。
- `vue-a2ui`：只使用 transport-neutral A2UI Runtime 与普通 JSON HTTP。
- `vue-ag-ui-a2ui`：显式组合 AG-UI 与 A2UI。

先在仓库根目录执行 `npm run build` 和 `npm run backend:dev`，再进入任一示例执行 `npm install && npm run dev`。这些应用都有自己的 `package.json`，用于展示二次开发项目实际需要的依赖边界。

发布前执行 `npm run test:package-consumer`：它会真实生成 npm tarball，在临时目录解包，并只从 tarball 构建全部三个消费者。
