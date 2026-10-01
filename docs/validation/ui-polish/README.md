# UI 精修验收（2026-10-01）

基线为 `4475b4218cdb6099692b447a71b18e73266c2b1c`；已 fetch，远端 main 没有新增提交。本轮开始时已有 RSS、反馈及相关测试修改，保留在工作区，不纳入本轮三个提交。旧记录见 `../appearance/README.md`，以下为本轮实测。

## 阶段 0：规划与测试基线

修改前：typecheck、lint、build、architecture、bundle 通过。全量测试 558 通过、2 失败（77 个文件、560 项），失败均为上轮记录的旧断言。

处理依据：

- `CURATED_FEEDS` 是 UI 使用的 10 项推荐列表。完整已知源目录由 28 项历史目录与 14 项新增源组成，共 42 项，新增苔藓之火解释了旧的 41 项目录断言差异。用户本地保存的 41 项订阅与两个目录独立。只为测试导出已有完整目录，不改变任何推荐、解析、订阅或持久化逻辑。测试分别严格校验 42 项完整目录、10 项推荐列表、推荐 ID 顺序、新增源 ID、去重及旧源排除；另验证 41 项已保存订阅不会被推荐列表补全或覆盖。
- 阅读区当前布局：标题之后依次来源、作者、时间。保持实现，使用 DOM 相对位置及元信息子元素顺序校验代替过时的作者在标题前断言；未删除、跳过或弱化语义要求。
- 重写演进计划，标记既有主题和排版完成；移除主题扩展、列表模式及工期承诺；区分本轮工作、后续独立任务与原型验证项。

修改后：全量 coverage 77 个文件、561 项全部通过，无跳过；statements/lines 82.10%、branches 75.37%、functions 71.11%，门槛通过。typecheck、lint、build 通过。Bundle 和架构基线通过；使用 `node --import tsx scripts/checkBundleSize.ts` / `scripts/checkArchitecture.ts` 等效入口绕开 sandbox 的 tsx CLI IPC 限制。

## 阶段 1：界面精修

工具栏原位移除胶囊描边、阴影和模糊装饰，保留透明 1px 占位以保持原尺寸。独立柔和分隔变量 light #edf0f3 / dark #262b30 仅用于侧栏页脚及移动阅读工具栏，不降低控件边框。已读标题使用现有达标辅助文字色，桌面与移动保持和未读相同字重，不改变整行透明度。侧栏 16px 图标保留 8px 间距，圆角 3px、微弱内描边；使用已有图标代理地址，失败保留原字母回退。文章列表中的播客封面尺寸和样式未改。

折叠按钮增加微弱底色，列表增加明确 focus-visible；文章可通过 Tab 聚焦并用 Enter/空格打开，aria-current 暴露选中状态。选中内侧标记、未读点、零计数隐藏均复用原实现。

实测：typecheck、lint、build 通过，相关 4 文件 59 项测试通过（含图标失败回退、键盘打开与选中语义）。Chrome 桌面 1440×1000、移动视口 390×844，浅深色、阅读设置、全局设置、列表及空反馈截图见 stage1/；browser-checks.json 记录字体实际加载、回退、系统主题、设置组合及滚动保持。geometry-comparison.json 比较修改前后：三栏 220 / 342 / 878px，工具栏 58px，各样例行 88.921875px，全部一致。虚拟窗口参数、列表内容结构、未读点位置不变。

视觉样例使用独立临时浏览器和 IndexedDB 固定数据，不触碰用户本地订阅；API 使用夹具且禁用外网，因此出现的订阅失败 Toast 为样例反馈，不代表真实订阅服务结果。移动验证为 Chrome 视口模拟，未在真实触屏设备验证。

## 阶段 2：阅读精修

文章标题默认 27px、行高 1.25、字距 normal；移动仍为 24px 自适应换行。只针对 reader-column 的文章标题，保留其他内容标题原样式。中文、英文、混排标题实测均无溢出。默认 650px 版心、字号和行距选择均保留。

仅 article-copy 原文段距为 1.2em（16px 字号对应 19.2px），长短段落均检查；引用为 2px 边线、1em 缩进、透明背景、正文主文字色、正体，字号行距跟随正文。原文图片 8px 圆角和柔和描边，240px 样例图保持原尺寸，保留真实 figcaption，13px 正体，不生成 alt 图注。元信息保持来源→作者→时间顺序，基线对齐、4px 行间隙、6px 列间隙并允许长作者名换行。AI、逐字稿、笔记的段距、引用、图片规则保留。

本轮 Chrome 实测见 stage2/browser-checks.json 和 additional-checks.json：

- 桌面 1440×1000，移动 390×844 与窄屏 320×844，浅深色均检查中文、英文、混排标题、中文长短段落、长链接、代码、表格、列表、图片、引用。
- 真实本地宋体 FontFace loaded；断开字体请求时正文正常回退。
- 正文段落两端对齐、末行 start；标题、列表段落、代码、表格保持自然对齐。
- 17px / 2.0 / 720px 设置组合正常。切换字号、行距、版心、字体、对齐时，首个可见段落始终为索引 7；主题切换也未重置滚动。
- 已读／未读切换行高均为 88.921875px；单订阅筛选保持 8 项夹具；侧栏折叠／展开和笔记导航正常。
- 浏览器成功播放并暂停 10 秒本地合成 WAV，播放时间实际推进；没有浏览器运行错误。
- AI 摘要与逐字稿的空状态、笔记页面、播放器样式实测；生成服务、转录和已保存笔记操作由已有相关单元测试回归，不将空页面截图视为真实服务调用成功。

最终自动检查：typecheck、lint、coverage、build、bundle、architecture 和 50k deterministic benchmark 全部通过。78 个测试文件、563 项全部通过，无跳过，无既有失败计入通过；覆盖率 statements/lines 82.11%、branches 75.47%、functions 71.16%，门槛通过。构建仍有既有 chunk 大于 500kB 的提示；最大 JS 590121B、gzip 180388B，低于仓库 637000B / 195000B 预算。基准仅证明既有确定性断言，不能代替真实设备性能或 50k UI 浏览器压力测试。

检查命令：npm run typecheck、npm run lint、npm run test:coverage、npm run build；node --import tsx scripts/checkBundleSize.ts、scripts/checkArchitecture.ts、scripts/perf50k.ts（后三项使用等效入口避免 tsx CLI sandbox IPC 限制）。

代表截图：

- [桌面浅色中文](stage2/title-0-light.png)、[桌面深色英文](stage2/title-1-dark.png)、[深色混排标题](stage2/title-2-dark.png)
- [移动浅色正文](stage2/body-390-light.png)、[移动深色正文](stage2/body-390-dark.png)、[320px 窄屏](stage2/body-320-dark.png)
- [阅读设置浅色](stage2/desktop-light.png)、[阅读设置深色](stage2/desktop-dark.png)、[全局设置](stage2/settings-dark.png)
- [AI 空状态](stage2/insight-empty-dark.png)、[逐字稿空状态](stage2/transcript-empty-dark.png)、[笔记](stage2/notes-dark.png)

未执行：真实手机触屏及 Safari/Firefox、真实外部 RSS/AI/转录请求、真实播客网络音源和硬件出声检查、50k 条 UI 浏览器压力测试。用户本地 41 项订阅未读取或修改，相关验证使用隔离数据。无本轮实现阻塞；未部署、未合并、未推送。开始时的其他工作区修改继续保留，未包含在三个本轮提交中。
