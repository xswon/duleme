# 微信读书公众号（本地 Web 技术预览）

本功能复用 duleme 的 RSS 解析、IndexedDB、文章去重和刷新流水线，**不需要部署独立 RSSHub、WeWe RSS 或数据库服务**。目前仅作为本地 Web 技术验证，不是 ChatGPT Sites 的正式能力。

## 使用

1. 使用 Node.js >= 22.13，运行 `npm install && npm run dev`，打开本地 duleme。
2. **技术预览阶段**，同一台电脑上运行 `npm install -g weread-omni` 和 `weread-omni login`，用微信扫码。已配置的账号无需重新登录。
3. 在手机微信读书 App 中将目标公众号加入书架。
4. 在 duleme 的「添加订阅源 → 微信读书」点击「读取微信读书书架」，选择公众号点击「导入」。
5. 之后使用 duleme 的刷新功能重新拉取最近文章，已读和收藏状态由原有合并逻辑维护。

**限制**：这个版本仍依赖本机全局 CLI；这只是验证现有数据层能否接上微信读书，**尚未满足最终“普通用户无需安装 CLI”的目标**。未来应将登录和文章获取整合进应用自身，不应要求用户安装这个工具。它的登录凭据保存在本机用户目录，du leme 不读取、上传或回传令牌。

## 设计

- 本地 Express 提供 `GET /api/weread/subscriptions` 和 `GET /api/weread/feed?accountId=...`；都经过已有 `requireLocalAccess`。
- 输入仅接受 `MP_WXS_<digits>`，调用 CLI 使用 `execFile` 且不经过 shell；使用独立临时文件接收 RSS，完成后清理。
- 订阅源存为 `weread:MP_WXS_<digits>`，`fetchRssFeed` 将其送往专用 API 而非公共 RSS URL；CLI 生成的 RSS 随后经过项目共享解析器。
- 默认刷新最近 20 篇（首次导入 10 篇），以源的稳定 `guid/reviewId` 去重，不使用尚未验证的 `synckey` 跳增。
- 非官方接口可能返回验证码、登录失效或缺少正文。API 不回传密钥、账号凭据、原始内部错误消息。
- 生成 RSS 需要读取文章正文，比普通 RSS 慢得多；默认请求会等待较长时间，暂不建议批量导入几十个公众号。
- ChatGPT Sites `weread` capability 显式关闭，Worker 不会承载当前的 Node CLI 代码；现有 RSS/Sites 能力保持不变。

## 验证清单

- `npm run typecheck`、`npm run lint`、`npm run test:coverage`、`npm run build:site`。
- 本地已登录 `weread-omni` 后导入一个公众号，确认文章可读并刷新两次没有重复。
- 尝试未登录、`-2041`、无效账号 ID、CLI 未安装环境，确认页面给出明确错误。
- 下一阶段验证：无需全局 CLI 的应用内扫码登录、同源凭据保护、Sites Worker 出站接口可达性与人工验证处理。**这些尚未实现**。

非官方工具及接口并未得到微信读书官方授权，可能随时改变，且其使用可能受到平台条款限制。此能力应保持可选，不应影响普通 RSS。
