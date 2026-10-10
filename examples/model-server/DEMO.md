# 真实演示操作指南

本地启动和 Render 部署配置已准备好，目前没有已部署的公网真实后端地址。GitHub Pages 的 [next 工作台](https://codexiaoke.github.io/agentdown/next/)仍默认使用浏览器无模型 demo。以下步骤直接连接配置的真实模型。

## 一键部署到 Render

[部署到 Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fcodexiaoke%2Fagentdown%2Ftree%2Frewrite%2Fagentdown-next)

1. 登录 Render，使用上面的入口创建 Blueprint。仓库的 `render.yaml` 指向 `rewrite/agentdown-next` 分支，默认 Free 计划、Node 24，关闭自动部署。
2. 在 Render 的安全环境变量设置中输入 `DEEPSEEK_API_KEY`。它仅供服务端调用模型，不要发到聊天、放进前端构建或填进浏览器令牌框。
3. 部署配置自动生成独立的 `AGENTDOWN_ACCESS_TOKEN`。保留它用于浏览器访问后端；它与模型密钥不同。
4. 等待构建和 `/health` 健康检查通过，打开 Render 实际分配的 HTTPS 域名。默认首页为 Vue，页面导航可切换到 `/react.html`，API 为同域 `/api`。
5. 在“后端连接设置”填写该部署域名加 `/api` 的 URL，并从 Render 复制 `AGENTDOWN_ACCESS_TOKEN` 到访问令牌框，保存设置。令牌只保存在当前标签页的 `sessionStorage`，不进入 Session 存档。
6. 选择示例任务或自己输入请求，再点击“发送任务”。示例按钮只填入输入框，不会直接调用模型。

部署会执行 `npm ci` 和 `npm run build:live`，通过 `npm run start:demo` 启动同一个服务。启动脚本验证真实模式构建标记，拒绝浏览器 fixture 构建，并根据 Render 的 `RENDER_EXTERNAL_URL` 加入精确允许的 origin。模型密钥只在运行服务中使用。

Free 实例可能休眠，首次唤醒需等待；休眠或重启会丢失进程内执行历史，临时磁盘上的报告不作长期存储。

## 本地同域演示

在仓库根目录安装依赖，并确认服务端环境已配置 `DEEPSEEK_API_KEY`：

```sh
npm ci
npm run demo:live
```

此命令先构建真实模式 UI，再启动单个 Node 服务，不启动 Vite：

- Vue：`http://127.0.0.1:8011/`
- React：`http://127.0.0.1:8011/react.html`
- API：`http://127.0.0.1:8011/api`

若环境配置了 `AGENTDOWN_ACCESS_TOKEN`，在页面设置填入本机 API URL 和该令牌。已构建的环境可分别执行：

```sh
npm run build:live
npm run start:demo
```

本地服务默认绑定 `127.0.0.1:8011`，可用 `HOST` 和 `PORT` 调整；公网绑定必须配置独立访问令牌。模型可选设置为 `DEEPSEEK_MODEL` 和 `DEEPSEEK_BASE_URL`。开发热更新仍使用 `npm run dev:live`，对应后端 8011 与 Vite 5174。

## 现场演示流程

1. 先发送普通问题，观察真实模型文本流；此类任务可以直接完成，没有固定审批卡。
2. 请求“写一份 Vue 与 React 选型报告，并保存到服务器”。等待模型发起 `save_report`，界面出现对应人工审批。
3. 批准一项保存：服务端实际写入报告，工具结果交给模型，模型继续回答；界面产物展示实际报告内容。若拒绝，模型收到拒绝结果后继续，不落盘该报告。
4. 在等待审批时断开连接，再恢复，验证补发不会重复文本或决定。断开只停止前端观察，后端任务继续。
5. 使用保存刷新与只读回放验证会话上下文。回放不连接模型、不提交操作；恢复实时执行需要后端进程仍保有原任务。
6. 需要终止任务时点击取消。取消中止模型请求并使待审批失效，不删除已经写入的报告。

Vue 与 React 使用相同 Session / 后端契约，但分别持有自己的演示会话。真实链路是：模型文本 → 模型发起工具 → 人工审批 → 服务器落盘 → 工具结果 → 模型继续。

## 连接已有后端

也可从 GitHub Pages 工作台设置自己的 HTTPS API URL（以 `/api` 结尾）和后端访问令牌。此时需要后端精准允许 `https://codexiaoke.github.io` 的 CORS origin；Pages 自身不提供模型服务。

Docker、数据目录及完整 HTTP / 安全配置见[模型后端说明](README.md)。执行日志、操作结果和事件游标仍在进程内存中，服务重启后不能 resume 原任务；长期部署需要自行配置持久化。
