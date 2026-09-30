# 读了么（Duleme）

本仓库是读了么的产品主线。

## 当前方向

项目采用 **Web-first / ChatGPT Sites-first** 路线，不再维护 Electron、Tauri 或原生桌面打包目标。

现有 React UI、IndexedDB/localStorage 数据层和本地 Web + Express 运行方式继续保留。ChatGPT Sites 使用同一套产品 UI，并通过 `ReaderBackend` 隔离运行时差异。

当前 Sites 已具备：

- 公共 RSS / Atom / RDF 获取与解析
- 远程图片 direct-first 加载及受限同源 fallback
- 播客音频 direct-first 加载及受限同源 streaming fallback
- 单段 HTTP Range 转发与 206 / Content-Range 处理\n- BidClub 节目增强详情（TL;DR、Digest、Transcript 与来源元数据）
- 远程 HTTPS OpenAI-compatible AI：模型列表、连接测试、文章/播客摘要（BYOK）

云转录和本机播客处理仍保留在现有 Express 路径，尚未迁移到 Sites。Sites AI 只支持公网 HTTPS endpoint，不支持访问用户机器上的 Ollama/localhost。

## 本地开发

```bash
npm install
npm run dev
```

默认开发端口见 `.env.example`。

## 验证

本地 Web：

```bash
npm run verify
```

ChatGPT Sites 构建：

```bash
npm run build:site
```

GitHub Actions 会同时执行常规验证和 Sites 构建。

## 架构

- `src/`：React/TypeScript 产品 UI
- `src/services/readerBackend.ts`：产品代码到运行时能力的统一边界
- `src/sites/`：ChatGPT Sites Worker、RSS、媒体、BidClub 与远程 AI 运行时适配
- `server/`、`server.ts`：本地 Web / Express API 实现
- IndexedDB/localStorage：浏览器本地阅读数据与设置

迁移原则、能力矩阵和限制见 `docs/SITES_ARCHITECTURE.md`。
