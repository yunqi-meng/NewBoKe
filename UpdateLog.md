## 0.5.2 - 2026-10-30

- **删掉一整批已经没人引用的文件**：公开站与控制台的 `WeatherEffect.tsx`、`WeatherWidget.tsx`（天气小组件早已下线）、公开站的 `GlobalSnow.tsx`（控制台那份仍在用，公开站没有任何地方挂载）、控制台 `lib/managerApi.ts`、根目录的 `update.py` / `update.bat`（旧 GitHub 拉取更新器，早已被服务器发布助手取代）与 `scripts/checkConfig.mjs`（带硬编码片段的配置自检脚本，会改文件且无调用方）。公开站的 `/api/weather`（依赖未配置的 `QWEATHER_KEY`）、`/api/test` 与控制台的空目录 `app/api/ping` 一并删除。仓库不再跟踪 `.idea/`，`__pycache__/` 也清掉了。
- **清掉约 8.5MB 无用静态资源**：两端的 `file.svg` / `globe.svg` / `next.svg` / `vercel.svg` / `window.svg` / `spaceship.bin`，控制台的 `recreation-bg.png` / `recreation-fg.png` / `tabby-cat.png`。保留仍在使用的 `siamese-cat.png`、`music-default.svg`。
- **依赖瘦身**：公开站删掉整套 Tiptap（编辑器只在控制台用）、`three` / `@react-three/*`（全仓 0 处引用）、`gray-matter`、`openai`、`remark-html`、`next-themes`、`remark` 共 23 个包；控制台删掉 `three` / `@react-three/*`、`gray-matter`、`marked`、`openai`、`remark`、`remark-html`、`next-themes`、`@tiptap/extension-placeholder` 共 10 个包。两份 `package-lock.json` 同步重算（分别减少约 1800 与 850 行），本地 `node_modules` 实际移除 149 / 75 个包。删完后两端 `next build` 均通过，说明确实没有隐藏引用。
- **修复：新建草稿重复保存会产生多条记录**。编辑器里的文档 id 用 `useState` 只读不写，第一次保存后后端返回的真实 id 被丢掉，再点「存草稿」仍以 `id=null` 提交，后端每次生成新 id，于是每存一次多一条草稿。改为用 ref 记住返回的 id，并在浏览器里连点两次「存草稿」实测：草稿表里始终只有 1 条（修复前会是 2 条）。
- **修复：播放列表为空时点上一首 / 下一首会算出 `NaN`**。两端 `MusicProvider` 的 `nextSong` / `prevSong` 补上空列表直接返回，避免 `(prev + 1) % 0` 把 `currentIndex` 污染成 `NaN`、播放器进入「有歌但不显示」的状态。
- **修复：编辑器 Tiptap 重复扩展告警**。`StarterKit` v3 自带 `link` 与 `underline`，代码里又单独挂了一份，控制台打开编辑器会报 `Duplicate extension names found`。改为在 `StarterKit.configure` 里关掉内置版，统一使用单独配置的那一份，浏览器控制台已清零。
- **修复：本地控制台可能被过期的 `backend_config.json` 带到错误端口**。提交进仓库的 `public/backend_config.json` 还留着旧启动器写的 `api_port: 58643`，本地不带环境变量启动时，控制台会把 `/api/proxy` 转发到不存在的端口（表现为直接跳登录页或整站报错）。该文件现在只作为桌面版的端口提示，默认值改为 8000 并与解析顺序一致；设置页也改为「文件不存在不算错误」，服务器部署没有这个文件时不再误判为离线。
- **修复：`SplashScreen` 在声明之前调用 `exitSplash`**。两端的开屏组件先写 `useEffect`、后写 `exitSplash`，React Compiler 的 lint 明确报「变量在声明前被访问」；把函数提到 effect 之前，行为保持不变。
- **修复：雪花粒子在渲染期调用 `Math.random`**。`GlobalSnow` 用 `useMemo` 在渲染里生成随机粒子，违反 React 的纯渲染约定。改为挂载后在 effect 里生成一次；组件本来就在挂载前返回 `null`，不会引入水合差异。`WindyGrass` 早就是 effect 生成，未受影响。
- **音乐页歌词改为派生值**：两端音乐页原来用 `useState` + `useEffect` 在切歌后再 `setParsedLyrics`，等于每切一首歌多渲一轮，中间还会闪一帧空歌词。解析逻辑抽成模块级 `parseLyrics`，页面用 `useMemo` 直接派生，切歌即换，同时消掉了 `set-state-in-effect` 告警。
- **未使用代码清理**：两端去掉一批未使用的图标 / 类型 / 变量与 `catch (e)` 形参；把 `MetaMatrix` 的 `Label`、`RichTextEditor` 的 `Btn` 从渲染函数内部提到模块级（避免每次渲染重建组件、React Compiler 报 `static-components`）；把已经不需要的 `@ts-ignore` 全部移除（先改成 `@ts-expect-error` 用 `tsc` 验证这些行本来就不报错，再删掉注释）；JSX 里裸写的引号改为 `&quot;` / `&apos;`。后端删除 `config.server_mode()`、`auth.fingerprint()` 与未使用的 `List` 导入。
- **验证**：两端 `tsc --noEmit` 0 错误；`next build` 均成功（控制台首次构建因 `fonts.gstatic.com` 拉取失败中断，重试即通过，与代码无关）；后端冒烟测试 27 通过 / 0 失败；两端全部路由逐条 curl 均 200；浏览器实际打开首页、音乐页、编辑器、照片墙，控制台无报错。ESLint 剩余两类问题按现状保留：`@typescript-eslint/no-explicit-any`（历史遗留的数据结构写法，逐个改类型收益低、风险高）与 `react-hooks/set-state-in-effect`（都是「挂载后读 localStorage / 拉配置」的客户端初始化，属于该规则允许的经典例外，组件在挂载前返回 null，不存在级联渲染）。

## 0.5.1 - 2026-10-30

- **页面不再重复请求同一份配置**：公开站与控制台的服务端读取函数全部用 `React.cache()` 包了一层。此前渲染一个页面，`generateMetadata`、根布局、页面本身会各发一次 `/api/config`，一次首页渲染要发 4 次相同的配置请求；现在同一轮渲染内只发 1 次，结果在请求内复用。缓存作用域只是「这一次服务端渲染」，不会把旧内容留给下一次请求，实时性不受影响。
- **页面内请求改为并发**：首页、说说、时间轴、文章 / 杂谈详情页原来是「先等配置回来，再拿配置里的兜底封面去取正文」，串了两次往返；现在配置、正文、侧边「最近文章」一起发出。详情页的兜底封面改由页面在拿到配置后补，正文读取不再依赖配置。
- **公开站不再下发 AI 配置**：公开站改用后端的 `/api/config/public`，只有站点展示需要的字段；此前整份配置（含 `aiConfig` 的模型名、接口地址与煤球的人设提示词）被序列化进了公开页面的 HTML 里，现在已从公开页面中消失。
- **后端消除 N+1 与整列读取**：相册列表用 `selectinload` 一次预取全部照片，查询数从「1 + 相册数」降为固定 2 条；文章列表在不取正文时用 `defer()` 跳过 `content` 列，列表接口只发 1 条查询、不搬运正文。
- **SQLite 调优**：连接上补了 `cache_size=-32000`（约 32MB 页缓存）、`mmap_size=268435456`（256MB 内存映射）、`temp_store=MEMORY`，配合原有的 WAL / `synchronous=NORMAL` / `busy_timeout` / 外键约束；SQLite 连接池关闭 `pool_pre_ping`，省掉每次取连接的回环。
- **路由骨架屏**：公开站与控制台的主要路由新增 `loading.tsx`（首页、文章 / 杂谈详情、说说、时间轴、照片墙、友链、项目、关于页），统一用灰块占位。页面是运行时读库渲染的，切路由要等一次后端往返，骨架屏让点击的当下就有反馈，不再像「点了没反应」。
- **图片延迟加载**：列表与看板里的封面、说说配图、相册缩略图补上 `loading="lazy" decoding="async"`，首屏只加载可视区图片，长列表不再一次性拉满。
- **本地实测**（`next start` 生产构建 + 本地后端，单次请求计后端日志条数）：公开站首页从「4 次配置 + 3 次内容」降为 4 次总请求（1 次公开展示配置 + 3 次内容）；说说页 5 → 2，照片墙 4 → 2，时间轴 2，文章详情 3；控制台首页配置请求 4 → 1。各接口自身耗时 2–5ms，页面热态首字节 8–31ms。后端冒烟测试 27 通过 / 0 失败。

## 0.5.0 - 2026-10-29

- **项目改造成完整的前端 + 后端 + 数据库工程**：后端从 `my-blog-manager/cms_core` 抽到顶层 `server/`，博客（`XHBlogs/`）与管理后台（`my-blog-manager/`）成为共享同一套后端与同一份数据库的两个前端。目录名保持不变，`server/` 是新增的顶层目录。
- **数据库成为唯一真相**：新增 SQLite 存储层（SQLAlchemy 2.x ORM + WAL），文章、杂谈、说说、相册 / 照片、友链、项目、关于页、站点配置、草稿、本地音乐、每日一句、评论与设置全部落库。公开站与控制台不再各自读 markdown / TS 文件，两边内容永远一致。
- **公开站改为运行时读库**：`XHBlogs/lib/backend.ts` 统一解析后端地址（`XHS_API_BASE_URL` → `MANAGER_API_PORT` → `XHS_ENGINE_API_PORT` → `public/backend_config.json` → 8000），页面在请求时读取后端内容；写操作（评论、每日一句、AI 煤球、音乐）统一走同源代理转发到 `http://127.0.0.1:8000`，音乐转发是白名单（只放行 `local / file / cover / lyrics`）。
- **控制台改为写入统一后端**：`my-blog-manager/lib/backendPort.ts` 与公开站同一套端口解析规则，控制台的所有写操作经 `/api/proxy/<后端路径>` 落到同一个后端；站点配置、相册、友链、项目、说说、文章不再回写 TS 文件。
- **发布机制改为「数据库为准 + git 存快照」**：点一次「发布上线」把当前数据库内容整体导出成 `snapshots/content-<时间戳>.json` 并提交进仓库（提交信息 `chore(publish)`）；回退改为把历史快照灌回数据库（`chore(rollback)`），仍是一次新提交，历史不断。快照结构与内容表清单见 `server/app/snapshot.py`。
- **新增内容导入脚本** `server/scripts/import_content.py`：老版本的内容还在 markdown / TS 文件里时，一次性导入数据库（文章 3、杂谈 1、关于页 1、相册 2、照片 5、友链 1、站点配置 21 项、每日一句 1、图片 1），导入是覆盖式的。
- **新增接口冒烟测试** `server/scripts/smoke_test.py`：走一遍主要接口的读写，跑完自动清理测试数据；管理员身份支持 `X-Admin-Token` 请求头（值即会话密钥），服务器上带 `MANAGER_SESSION_SECRET` 即可跑。服务器实测 **27 通过 / 0 失败**，无残留。
- **服务器部署切换到统一后端**：systemd 单元 `xhblogs-manager-api.service` 改为 `WorkingDirectory=/opt/xinghui-blog/server`、`ExecStart=.../server/.venv/bin/uvicorn app.main:app`；数据库放在仓库外的 `/var/lib/xhblogs/blog.db`（通过 `XHS_DATABASE_URL` 指定），仓库重建不会丢数据。
- **发布助手按改动范围分派**：`tools/xhblogs-publish` 抽出 `classify_path()` 判定路径属于内容 / 公开站 / 控制台 / 后端；只有代码变了才重建对应服务，纯内容发布跳过构建。判定规则由 `tools/test-publish-paths.sh` 固化（23 条用例全部通过）。
- **后端改动重启不再自杀**：发布助手由后端进程派生，直接 `systemctl restart` 会把它自己所在的 cgroup 一起停掉，导致状态文件永远停在「进行中」。改为用 `systemd-run --on-active=3s` 派一个瞬态单元去执行重启。
- **新增运维脚本**：`tools/xhblogs-rebuild`（重建公开站）、`tools/xhblogs-deploy`（手动更新，按改动范围决定重建公开站 / 控制台 / 只重启后端）、`tools/xhblogs-manager-rebuild`（新增 `--skip-api`，避免连带重启后端）。旧的 `tools/xhblogs-async-rebuild` 已删除。
- **密钥仍然只有一处**：DeepSeek 密钥与会话密钥只从环境变量读（服务器上 `/etc/xhblogs-manager.env`，权限 600；本地 `server/.env`），仓库里只留 `server/.env.example` 模板，没有任何口令进代码、文档或脚本。
- **文档同步更新**：`README.md` 与 `README_en.md` 补上项目结构、`server/` 目录说明、新的 systemd 单元、数据库放在仓库外的做法与导入脚本、快照式发布与回退流程，以及「统一后端与数据库」附录（目录树、数据表清单、加表改字段的步骤、代理白名单、验证命令）。

## 0.4.9 - 2026-10-29

- 控制台与引擎的提示文案跟上了新的发布节奏：发布按钮不再承诺「约 1-3 分钟生效」，改成「内容改动刷新即生效」；发布状态里的「构建中」改为「同步中」，「最近构建」下面补了一句「仅代码改动才会重建站点」；回退提示保持原样（回退助手确实仍会重建站点）。
- 引擎发布接口的返回文案同步调整：`🚀 发布请求已提交：内容已镜像，源码正在提交并同步到线上，内容改动会立即生效。`；并发拦截与状态文件里的「正在等待构建…」也一并改成「正在同步到线上…」。
- 服务器端实测通过：保存一条说说 → 点「发布上线」（走控制台 `/api/proxy/api/deploy/publish`）→ 公开站 **128 毫秒**后就能看到新说说（从保存算起 271 毫秒，其中发布接口自身只花 33 毫秒），全过程没有触发 `next build`（`.next/BUILD_ID` 的文件时间戳与构建号保持不变）。此前同一流程需要约 39 秒。
- 计时脚本踩过一个坑并已修正：轮询时不能写成 `curl ... | grep -q`，命中时 grep 提前退出会让 curl 收到 SIGPIPE，配合 `set -o pipefail` 会把「命中」判成失败，耗时被统计成好几秒的假象（先后出现过 0.5 秒 / 2.3 秒 / 4.4 秒 / 8.3 秒等互相矛盾的读数）。现在改成整段取回页面再匹配关键词，读数稳定在 0.1 秒量级。
- 发布状态在纯内容发布后仍能正确判定为已生效：状态文件新增 `effectiveAtTimestamp`（助手写入），控制台据此显示「已同步到线上」，不会再因为「构建号时间戳比本次发布早」而误判成有待发布的改动。
- 新增 `tools/e2e-publish-timing.sh` 与 `tools/e2e-publish-cleanup.sh`：在服务器上跑完整链路计时（保存 → 发布 → 轮询公开站 → 打印发布状态）与测试内容清理（删除说说 → 再发布一次让镜像撤掉）。会话 Cookie 用服务器自己的 `MANAGER_SESSION_SECRET` 现算现用，不落盘也不打印。
- `tools/test-publish-paths.sh` 固化内容 / 代码路径的判定规则：15 条内容路径必须判为内容，11 条代码路径（含 `XHBlogs/app/about/page.tsx` 这种与内容同目录的页面）必须判为代码。

## 0.4.8 - 2026-10-29

- 公开站改为运行时渲染：根布局加上 `export const dynamic = 'force-dynamic'`，所有页面由预渲染（SSG）改为按请求渲染。改动前公开站的响应头是 `x-nextjs-prerender: 1` + `Cache-Control: s-maxage=31536000`，内容被冻结在构建那一刻的 HTML 里；现在改为 `no-store`，每次请求都重新渲染。
- 站点配置运行时读取：新增 `XHBlogs/lib/siteConfigRuntime.ts`，从磁盘上的 `siteConfig.ts` 截出对象字面量并求值（字符串感知的括号平衡，避免被值里的 `}`、`//`、转义引号截断），再与编译期快照深合并（`XHBlogs/lib/siteConfigMerge.ts`）；解析失败自动回落到快照，站点不会因为配置写坏而打不开。`XHBlogs/app/layout.tsx` 的标题、图标、描述改为 `generateMetadata`，改站点标题不再需要重新构建。
- 客户端组件统一改用 `useSiteConfig()`：新增 `XHBlogs/components/SiteConfigProvider.tsx` 与公开接口 `XHBlogs/app/api/config/route.ts`（不下发 `aiConfig`），导航、个人名片、社交链接、仪表盘、关于页、启动页、弹幕背景、壁纸轮播等全部改为从上下文取配置，窗口重新获得焦点时自动刷新。
- 相册、友链、项目三块看板改为运行时读盘：新增 `XHBlogs/lib/tsData.ts`（字符串感知的数组截取 + 去掉 TS 风格尾随逗号，与引擎 `cms_core/tsdata.py` 规则一致）与 `XHBlogs/lib/types.ts`，`data/albums.ts`、`data/friends.ts`、`data/projects.ts` 不再被静态 import 打进产物，而是逐次请求读盘解析，由服务端页面通过 props 传给客户端看板。
- 文章与杂谈详情页移除 `generateStaticParams`，路径改为 `XHBlogs/lib/siteRoot.ts` 统一解析（可用 `XHS_SITE_ROOT` 覆盖站点根目录），全站内容路径不再散落着 `process.cwd()`。
- **发布不再需要重新构建站点**：服务器发布助手（`tools/xhblogs-publish`）在提交后先算出这次改动的文件清单，若只涉及内容路径（文章、杂谈、说说、关于页、相册 / 友链 / 项目数据、站点配置、上传的图片与音频）就跳过 `next build` 与重启，直接判定为「已实时生效」；只有代码路径（页面、组件、构建配置）变化时才重新构建公开站，并按需重建管理后台。此前每次发布都要等一次约 35 秒的全站构建，现在纯内容发布点完即见。
- 发布状态新增 `effectiveAtTimestamp`：纯内容发布不会产生新的构建号，时间戳会比本次发布早，控制台改用这个字段判断「已同步到线上」，避免被误判成「有待发布的改动」。
- 新增 `.gitattributes`：服务器上的发布助手是 bash 脚本，强制以 LF 换行检入，避免在 Windows 上编辑后被转成 CRLF 导致脚本在服务器上直接失败。

## 0.4.7 - 2026-10-29

- 加固发布流程，避免连点两下把站点搞成半新半旧：引擎新增并发判定，发布与回退在有任务进行中时直接拒绝并提示「上一次发布还在进行中」；服务器助手脚本改用 `flock` 串行化，两次发布不会同时提交、推送和构建。
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
