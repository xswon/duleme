# 读了么（Duleme）

本仓库是读了么的产品主线。

## 当前方向

项目采用 **Web-first / ChatGPT Sites-first** 路线，不再维护 Electron、Tauri 或原生桌面打包目标。

现有 React UI 与本地 IndexedDB 数据层继续保留。RSS、代理、AI、转录等能力目前仍由 Node/Express `/api` 服务提供；迁移到 ChatGPT Sites 时，这些运行时能力必须经过 `ReaderBackend` 边界适配，而不是让 UI 直接依赖具体托管环境。

## 本地开发

```bash
npm install
npm run dev
```

默认开发端口见 `.env.example`。

## 验证

```bash
npm run verify
```

## 架构

- `src/`：React/TypeScript 产品 UI
- `src/services/readerBackend.ts`：前端到运行时能力的统一边界
- `server/`、`server.ts`：当前 Node/Express API 实现
- IndexedDB：浏览器本地阅读数据与设置

迁移原则和 Sites 约束见 `docs/SITES_ARCHITECTURE.md`。
