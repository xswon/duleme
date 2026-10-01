# 全局主题与中文长文排版验收（2026-10-01）

当前分支 `main`；保留任务开始时已有的暂存和未暂存改动。验收时尚未提交，未合并或部署。

## 修改

- `index.html`：同步内联首屏主题初始化与基础背景；在 React 和样式模块加载前设置 html 的 `data-theme` 与 `color-scheme`。
- `src/services/appearancePreferences.ts`：用户偏好与实际主题分离、校验、localStorage 持久化、系统变化和跨窗口同步；存储不可写时保留本次会话选择。
- `src/hooks/useAppearancePreferences.ts`、`src/components/AppearanceControls.tsx`：共享偏好订阅与带文字、aria-pressed 的控件；宋体样式表按需加载。
- `src/components/ArticleDetailModal.tsx`、`src/components/ManageFeedsModal.tsx`：阅读设置与全局设置「外观」入口；移除米黄及局部主题。
- `src/styles/appearance.css`：浅深语义色、Tailwind 色值映射、选择标记、正文宋体和段落对齐。
- `src/index.css`、`src/styles/prototype-{reader,navigation,tools,player}.css`、`src/styles/button-system.css`、`src/components/LocalAiSettingsModal.css`：原位替换固定颜色，不改变原有选择器优先级、列表尺寸、行高或虚拟滚动逻辑。
- `src/main.tsx`、`src/App.tsx` 以及 AddFeedModal、ArticleInsightTabs、ArticleNotesTab、Header、KeyboardShortcutsModal、Sidebar、WelcomeScreen：加载应用主题；白色表面和主按钮填充改用语义变量，覆盖 body 浮层。
- `public/fonts/source-han-serif/`、`scripts/subsetReaderFont.py`：Adobe 思源宋体 SC 2.003 的本地 WOFF2 子集、OFL 许可、来源和生成脚本。48 分片共 7.38 MiB，常用分片约 822 KiB；未选择宋体时不加载字体。范围外字符及加载失败使用中文衬线回退。正文强调使用浏览器合成字重。
- `tests/appearancePreferences.test.tsx`、`tests/articleDetailInteraction.test.tsx`：新增主题、持久化、系统变化、入口同步、按需字体与滚动位置行为验证。
- `tests/homeDensityStyles.test.ts`：既有颜色断言改为语义变量，保留列表布局断言。

## 对比度调整

保留指定基础表面、正文、选择及 Accent 值；小字前景按其使用背景调整。

|用途|原值|采用值|验证背景|对比度|
|---|---|---|---|---|
|浅色辅助文字|#718091|#606E7D|#F4F5F7|4.78:1|
|深色辅助文字|#8A96A3|#929FAC|#233346|至少 4.5:1|
|浅色链接和文字型强调|#2E75CB|#2668B6|浅色表面|至少 4.5:1|
|深色链接和文字型强调|#4B8FE2|#78B1F5|#233346|5.76:1|
|深色主按钮填充|#4B8FE2|#326FBB|白色按钮文字|5.09:1|

Accent 仍用于标记；未读点的有无、选中项的内侧线/字重、控件下划线及键盘轮廓提供颜色之外的区别。

## 自动化检查

- `npm run typecheck`、`npm run lint`、`npm run build`：通过。
- Bundle 与 architecture：通过；受 sandbox 的 tsx CLI IPC 限制，使用等效入口 `node --import tsx scripts/checkBundleSize.ts` 和 `node --import tsx scripts/checkArchitecture.ts`。
- 全量 `npm run test:coverage`：555 通过、2 失败，共 557 项。两项失败在本次修改前的代码中复现，未改动相关业务或原有断言：
  - `tests/defaultFeeds.test.ts`：断言目录有 41 个订阅源，当前目录实际为 10 个。
  - `tests/articleDetailModal.test.tsx` 的元信息顺序断言：要求作者出现在 h1 前，现有实现将作者放在标题之后。使用任务开始时的暂存实现单独复现。
- 仅排除上述两条既有失败断言进行覆盖率核验：77 个文件通过，555 项通过、2 项跳过；statements/lines 82.33%、branches 75.22%、functions 70.97%，覆盖率门槛通过。这不代表全量门禁已通过。
- 首屏改为内联脚本后针对主题及阅读交互重验：23 项通过。
- 未运行 `perf:50k`：列表布局、内容、行高和虚拟滚动逻辑未修改；既有 virtualization、articleList、阅读导航、AI 摘要、逐字稿、播放器测试已包含在上面的全量运行中。

## 浏览器与视觉检查

Chrome，桌面 1440×1000、移动端 390×844，使用隔离浏览器与本地测试文章，不访问真实用户订阅或外部 AI 服务。`browser-checks.json` 保存计算样式和断言结果。

- 三档主题、两入口联动、跟随系统实时变化、显式选择优先、刷新恢复及无文章时切换通过。
- 思源宋体实际加载成功；阻断所有字体请求后仍有 4471 字正文正常显示。
- 切换主题、字体与对齐五次，阅读滚动位置均保持 600px。
- 段落两端对齐且末行自然对齐；标题、代码、表格、列表段落不参与两端对齐；导航保持原字体。
- 字号 17px、行距 2.0、版心 720px 可组合使用。
- 移动端 viewport、页面宽度、阅读区及其 scrollWidth 均为 390px，无横向溢出。
- 检查中文标点、中英文混排、长链接、代码、表格，以及三栏、工具栏、设置、阅读浮层、Tooltip、播放器、错误 Toast、AI 摘要和逐字稿空状态。未发现浏览器运行错误。
- 截图中的订阅失败 Toast 来自拦截的测试 API，用于验证错误反馈表面。

截图：`desktop-light.png`、`desktop-dark.png`、`mobile-light.png`、`mobile-dark.png`、`mobile-list-dark.png`、`settings-light.png`、`settings-dark.png`、`tooltip-dark.png`、`insight-empty-dark.png`、`transcript-empty-dark.png`、`font-fallback-light.png`。

未执行 Safari/Firefox、真实移动设备或外部 AI/转录服务及真实播客联网播放验收；未部署。现有两条失败测试仍需另行处理。

## 后续更正（UI 精修阶段 0，2026-10-01）

上述两条失败是旧断言，不代表推荐列表或元信息布局缺陷。当前推荐列表为 10 项；完整已知源目录为 42 项（含后来新增的苔藓之火），用户持久化的 41 项本地订阅是独立数据，不由推荐列表数量决定。新版测试分别核验三者，保留新增源 ID、去重和旧源排除断言。

阅读布局以当前产品为准：标题后依次是来源、作者、发布时间。测试改为验证 DOM 顺序和元信息子项顺序，不再要求作者出现在标题之前。最新实测见 `../ui-polish/README.md`；旧记录中的失败和跳过只描述此前检查。
