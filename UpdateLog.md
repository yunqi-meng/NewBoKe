## 0.4.7 - 2026-10-29

- 修复「发布后刷新控制台仍是旧内容」：此前控制台的文章、说说、相册、友链、项目、关于页与站点配置都是构建时打进 bundle 的静态快照，发布只重建公开站，控制台永远显示构建那一刻的内容。现在控制台改为运行时读取工作副本，刷新即最新，公开站与控制台内容始终一致。
- 内容页面全部改为动态渲染（`export const dynamic = 'force-dynamic'`），逐次请求按 `XHS_MANAGER_ROOT` 指向的工作副本读盘，不再依赖构建产物里的过期副本（standalone 模式下 `process.cwd()` 是 `.next/standalone`，已通过 `my-blog-manager/lib/managerRoot.ts` 统一纠正）。
- 友链、项目与照片墙三块看板改为运行时向引擎读盘：引擎新增 `GET /api/friends/list`、`GET /api/projects/list`，相册沿用 `GET /api/gallery/list`；控制台不再静态 `import data/*.ts`。
- 新增 `my-blog-manager/cms_core/tsdata.py`：直接解析控制台生成的 TS 数据文件取回其中的 JSON 数组，并自动去掉 TS 风格的尾随逗号（`},\n];` 这类严格 JSON 无法解析的写法），引擎读回的友链 / 项目不再为空。
- 站点配置改为运行时合并：新增 `my-blog-manager/lib/siteConfigRuntime.ts`（从引擎读配置并与默认值深合并）、`my-blog-manager/lib/siteConfigMerge.ts` 与 `my-blog-manager/components/SiteConfigProvider.tsx`。改 `siteConfig.ts` 里的昵称、导航标题、头像等无需重建控制台，页面刷新即生效；引擎暂时不可达时自动回落到编译期快照，控制台不会白屏。
- 引擎端口解析抽到 `my-blog-manager/lib/enginePort.ts`：代理路由与配置读取共用同一套「环境变量 → `public/backend_config.json` → 8000」的顺序，不再两处各写一份。
- 控制台组件（导航、个人名片、社交链接、仪表盘、关于页、启动页、弹幕背景、视觉背景、说说看板、设置页）统一改用 `useSiteConfig()` 取配置，不再各自静态引用快照。
- 顺手修掉两处会反复触发的隐患：`ToastProvider` 的 `showToast` 改为 `useCallback` + `useMemo`（此前每次渲染都是新函数，会让依赖它的 `useEffect` 反复重跑），操作队列 `OperationContext` 的操作类型补齐发布、友链、项目同步与说说新增。

## 0.4.6 - 2026-10-29

- 发布流程合并为单一按钮：控制台改完内容不必再先点「📥 更新本地」，收件箱与「设置 → 发布上线」都只保留一个「🚀 发布上线」。点击后自动依次完成「写回本地改动 → 镜像内容 → 提交源码仓库 → 重新构建公开站 → 重启服务」，博客随之更新，约 1-3 分钟生效。
- 新增 `my-blog-manager/lib/pendingOperations.ts`：把收件箱里的待处理操作按类型逐条写回内容引擎（相册 / 友链 / 项目 / 站点配置 / 说说 / 文章），任一条失败即中止发布并给出原因，不会带着半套改动上线。
- 新增发布回退机制：引擎新增 `GET /api/deploy/history`（最近 20 次提交，区分发布 / 回退 / 代码提交）与 `POST /api/deploy/rollback`（回退到指定提交）；服务器新增 `/usr/local/bin/xhblogs-rollback` 助手与 `/etc/sudoers.d/xhblogs-rollback` 免密规则。
- 回退语义是「内容回到前一步」：把文章、说说、说说配图、相册 / 友链 / 项目数据、关于页、站点配置、本地音乐与上传图片等内容路径恢复到目标提交的状态，之后新增的内容会被移除；源码与历史不回退，回退本身也会留下一次提交，因此可以继续往前回退，历史不会断。
- 控制台「设置 → 发布上线」新增「4. 发布历史与回退」面板：列出每一步的提交号、说明与时间，当前线上版本标注「当前线上」，其余步骤可一键回退（回退约 1-3 分钟生效）。
- 收件箱里的提示语同步更新：照片墙、友链、项目矩阵、说说、编辑器在改动入队后统一提示「点右上角 🚀 发布上线 即可写回并上线」。
- 服务器与 GitHub 双远端保持一致：发布与回退提交都会推送到服务器裸仓库与 GitHub 备份。

## 0.4.5 - 2026-10-29

- 每日选刊整套下线：删除公开站 `components/DailyBriefing.tsx` 与 `data/dailyBriefing*.{ts,json}`、`data/briefingConfig.json`、`data/terraReadingNotes.ts`、`lib/briefingWindow.ts`、`public/images/briefing-default.svg`，控制台 `components/settings/Briefing*.tsx`、`briefingApi.ts`、`app/briefing/`、`app/api/briefing/`，引擎 `cms_core/briefing_*.py` 与 `cms_core/public/briefing_agent.py`，以及仓库根目录四个只覆盖选刊的测试文件；控制台侧栏「每日选刊」入口一并移除。
- 新增「每日一句」：每天定时让当前接入的 AI（默认是煤球）说一句话，显示在首页内容矩阵下方，与站点其它卡片同一套毛玻璃风格。
- 引擎新增 `cms_core/api/dailyquote.py`：`GET /api/daily-quote` 取今天这句、`GET|PUT /api/daily-quote/config` 读写设置、`POST /api/daily-quote/generate` 立刻换一句、`POST /api/daily-quote/manual` 手写覆盖、`GET /api/daily-quote/history` 看往期。
- 设置存 `my-blog-manager/data/dailyQuoteConfig.json`，内容存 `my-blog-manager/data/dailyQuote.json`（往期保留 30 条），两者均已加入 `.gitignore`，不入库。
- 模型与人设直接复用 `siteConfig.aiConfig`（模型、接口地址、性格 Prompt、生成预算、发散度、思考强度），换模型不用改代码；AI 密钥仍只从 `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` 环境变量读，仓库内无任何口令。
- 定时任务由引擎常驻线程承担（每 30 秒核对一次北京时间），不依赖有没有人打开控制台；引擎启动时随 FastAPI lifespan 拉起，退出时收尾。
- 访客读接口不阻塞：今天还没有内容时丢到后台生成，首页不等人；控制台点「换一句」才同步等待。
- 公开站新增 `/api/daily-quote` 网关与 `components/DailyQuote.tsx`；控制台新增 `components/settings/DailyQuoteSection.tsx`，可管理展示开关、每天自动生成开关、生成时间、栏目名称、副标题、署名、日期与署名显示、单句字数上限、给模型的话，并可查看往期。
- 引擎端口环境变量更名为 `XHS_ENGINE_API_PORT`（旧的 `XHS_BRIEFING_API_PORT` 仍然识别），不再与已下线的选刊功能绑定。
- 新增 `my-blog-manager/tests/daily_quote_engine_check.py`：50 项自检覆盖默认设置、设置保存与校验、手写覆盖、长度截断、AI 调用（含请求地址、鉴权头、模型、人设与 `{date}` 替换）、模型报错与无密钥的提示、历史排序与存储格式。
- 下线「设置 → 视窗画面设置」：删除 `components/settings/DisplaySection.tsx` 与设置页对应菜单、路由与面板；桌面版窗口尺寸不再可调也不再持久化，`launcher.py` 移除 `resize_window` 接口与 `window_config.json` 的读写，窗口固定以 1440×900 启动（最小尺寸 1024×768 的约束保留）。标题栏的最小化/全屏/关闭按钮不受影响。

## 0.4.4 - 2026-10-29

- 下线图床（第三方图片托管）整套功能：删除「设置 → 图库配置管理」面板、`components/settings/GallerySection.tsx`、引擎 `cms_core/api/picbed.py`，并清理 `config.py` 里的图床凭证独立通道、`sync.py` 里的敏感行过滤、`siteConfig.ts` 的 `picBedName/picBedUrl/picBedToken` 字段与 `scripts/checkConfig.mjs` 的图床配置模板。
- 新增本地图片仓库：引擎 `cms_core/api/media.py` 提供 `POST /api/media/upload`（本机图片直传落盘到 `my-blog-manager/data/uploads/`）与 `GET /api/media/file/{name}`；控制台新增 `app/uploads/[...path]/route.ts` 以 `/uploads/<文件名>` 直接提供同一批图片，公开站由 `sync.py` 镜像到 `public/uploads/`，两端引用同一个地址。
- 图片工作台、视觉背景配置、说说配图三处上传入口全部改走本机直传，不再需要任何 Token；控制台与公开站的图片引用地址保持一致，无需额外改写。
- 修复照片墙删不掉照片的问题：`data/albums.ts` 会被 Next.js 打包进客户端 bundle，控制台此前渲染的是构建那一刻的快照，删除后刷新即"复活"。照片墙改为运行时经 `GET /api/gallery/list` 向引擎读盘，新增/编辑/删除全部改为不可变更新并同步刷新正在浏览的相册。
- `data/uploads/` 二进制文件加入 `.gitignore`（与本地音乐一致），公开站 `public/uploads/` 同步忽略；图片不可再生时需自行备份该目录。

## 0.4.3 - 2026-10-28

- AI 煤球改接 DeepSeek：`/api/chat` 由 Gemini 原生协议改为 OpenAI 兼容协议，默认模型 `deepseek-flash`（DeepSeek-V4.1-Flash），接口地址与思考强度均可在控制台配置。
- 聊天接口运行时由 `edge` 改为 `nodejs`：密钥在运行时才写进环境文件，node 运行时直接读进程环境，改密钥只需重启服务，无需重新构建。
- 配置项 `geminiConfig` 更名 `aiConfig`，新增 `baseUrl` 与 `effort` 字段，配置不再与单一模型厂商绑定；引擎的配置解析白名单同步更新。
- 控制台「AI 煤球配置」新增接口地址输入框与思考强度三档按钮，生成预算上限从 1000 提到 4000（推理模型需要为思考留出预算）。
- 引擎解析嵌套配置时一并抓取数字与布尔值，生成预算、发散度不再被丢弃。
- 密钥仅存于服务器环境文件（`/etc/xhblogs.env`、`/etc/xhblogs-manager.env`，权限 600）与本地 `.env.local`（已被 `.gitignore` 忽略），仓库内无任何口令。

## 0.4.2 - 2026-10-28

- 评论系统整体重建，旧的 Gitalk（GitHub Issues）方案整体下线，不再需要 GitHub 公开仓库与 OAuth 授权。
- 引擎新增 `cms_core/api/comments.py`：SQLite 存储（`my-blog-manager/data/comments.db`），评论、设置、点赞三张表；访客令牌限流（10 分钟 5 条 / 1 小时 20 条）、蜜罐反垃圾、同源字段清洗、父子回复校验。
- 公开站新增 `/api/comments` 网关与 `components/Comments.tsx` 评论区组件，支持留言、回复、点赞、分页加载、相对时间、访客标识本地记忆。
- 控制台新增 `components/CommentManager.tsx` 与 `/comments` 页面：全站评论统计、按状态/主题/关键词筛选、排序、逐条与批量审核、隐藏、垃圾、删除、站长回复。
- 评论参数（总开关、审核、匿名、点赞、标题、占位符、提示语、最大字数）存于引擎数据库，控制台保存后前台即时生效，无需重新发布。
- 「允许匿名留言」关闭时前台强制填写邮箱；「开放点赞」关闭时前台隐藏点赞按钮且引擎拒绝点赞请求。
- 站点与控制台各自的 `/api/comments` 网关保持一致，同一份评论区组件同时服务两个应用。
- 移除 `gitalkConfig` 配置项与 `gitalk` 依赖（含两个 lockfile）；删除 GitHub 评论 API 路由与旧的 LabComments 组件；友链页留言板锚点改为 `#comment-board`。
- 灵境页面及其关联的创意工坊、帝江号舰船与 RPG 等级系统从站点与控制台完整移除（3973 行）。
- `data/comments.db` 及其 WAL/SHM 文件加入 `.gitignore`，访客留言不入库。

## 0.4.1 - 2026-10-23

- 基于 0.4.0，合并 pr-review 的两个原作者提交及维护者兼容性修复，保留原始历史与署名。
- PR #25：壁纸分组创建、命名、删除、切换和组内图片管理；激活空组不回退旧列表，字符串感知配置解析保留特殊字符，兼容旧配置字段。
- PR #15：表格支持与 HTML 加载；正文保留 Markdown 转义与删除线，代码块保留语言、缩进、空行、字面 `<br>` 和嵌套围栏；目录不收录围栏内示例标题。
- 贡献致谢：原 Git 提交署名 Kai（#25）、ILoveFurina（#15）。功能与维护者修复共同纳入，未用旧分支整体覆盖选刊功能。
- 启动器在导入后台前统一私有数据根目录，兼容打包模式的真实程序目录与网页代理寻址。
- 合并后重新检查选刊、动态端口、私有数据隔离、原文章往返及背景组件；全量类型问题沿用原工程已知限制。
- 最终组合版本：39 项选刊/整合检查及 11 项 PR 后端回归通过，共 50 项；实际背景与编辑器组件验证、前后台生产构建、新模块定向类型检查及真实后台/生产代理/客户端联调通过。

## 0.4.0 - 2026-10-23

- 每日选刊整合进原设置侧栏；默认关闭、不绑定专业、无作者个人期刊。
- 展示与选题配置、栏目、草稿、封面、阅读预览、人工审核、本地发布/撤下。
- Agent 独立授权、关闭与撤销、幂等提交、回执、人工内容保护、操作记录。
- JSON 四步连接引导、配套 Python 客户端和可复制的 Codex 指令；不自动建立任务或调用模型。
- 与原 CMS 共用启动与动态端口，按网站隔离私有配置、草稿及授权；未配置路径时提供提示。
- 新安装空内容正常工作，第一期可发布；首次启用保留已有公开选题配置。
- 更新器保留个人数据、已有图片和私有目录，补齐缺失模块数据；备份程序替换并阻止覆盖未保存程序修改。
- 前后台生产构建通过；配置 11 项、编辑发布 16 项、HTTP/客户端 5 项、正式整合 7 项检查通过。项目原有全量类型问题不在本次清理范围，新增模块另做定向检查。
- 本地发布仅写所选网站目录，线上部署仍使用原有流程；电脑和后台需运行，DSH 暂未接入。

## 更新日志 (版本0.2.1~版本0.2.3)

#### 1. 优化在移动端显示卡顿情况

> 调整在移动端显示特效，减轻移动端卡顿情况

#### 2. 增加各个页面对移动端适配

> 实现首页、杂谈、归档等页面的移动端适配，增加移动端导航栏。

#### 3. 关于新增动态

> 可以看到提交记录

#### 4. 友链介绍可修改

> 现在你可以在控制台中编辑可复制信息了

#### 5. 存在的几个bug修复

> Start.dat闪退，标题无法修改问题已修复

#### 6. 更新博客源码

> 实现更新源码

## 更新日志 (版本0.1.1)

#### 1. 标题页与图标更新

> 实现自定义网页标题和图标按钮，详细见设置中的个人名片设置

#### 2. 文章支持Latex格式

> 实现Latex格式公式显示，具体使用如
>
> 输入公式如 $ E = mc^2 $ 下划线需使用转义符"\\_"。
>
> 此处感谢同学支持更新Latex公式显示 @inWunsch

#### 3. 评论系统bug修复

> 修复评论系统无法正常获取bug

#### 4. siteconfig设置新增

> 新增faviconUrl、navTitle等多项，更新同步拉取代码时请注意保存之前信息！！

#### 5. 环境变量

> 所需环境变量增多，请注意！
