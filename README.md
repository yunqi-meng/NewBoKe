# 🌟 欢迎使用 XHBlogs！

这是一个采用 Next.js 构建的高颜值、毛玻璃（Glassmorphism）风格个人博客系统。本项目自带完善的前端展示与后台控制台，两个前端共享同一个后端与同一份数据库，支持 Markdown 沉浸式写作、草稿管理以及从本机直接上传图片。

**当前推荐的部署形态：把公开站与控制台一起部署在你自己的 Linux 服务器上**（systemd 托管公开站、控制台前端与统一后端，Git 管理每一版源码）。控制台里改完内容，保存的那一刻就已经写进数据库、公开站刷新即可见；右上角的「推送到 GitHub 仓库」再把当前内容导成一份快照提交进服务器仓库并推送到 GitHub（只有代码改动才需要重新构建）。

本指南将带你完成服务器部署，并说明控制台的日常使用。

---
## 语言

[![English](https://img.shields.io/badge/Language-English-blue.svg)](README_en.md)
[![中文](https://img.shields.io/badge/语言-中文-red.svg)](README.md)

## 项目结构

现在的 XHBlogs 是一套完整的前端 + 后端 + 数据库工程，博客和控制台是两个前端，共享同一个后端与同一份数据库：

```
XHBlogs/                 # 前端一：公开站（Next.js App Router）
my-blog-manager/         # 前端二：管理控制台（Next.js App Router）
server/                  # 后端：统一 API（FastAPI + SQLAlchemy + SQLite）
    ├── app/             #   路由、ORM 模型、鉴权、快照、配置
    ├── scripts/         #   建表 / 导入旧内容 / 接口冒烟测试
    └── requirements.txt
snapshots/               # 内容快照：每次发布导出一份 JSON，提交进 Git
tools/                   # 服务器上的发布与重建脚本
```

数据流向只有一条：

```
   公开站 (XHBlogs)  ─┐
                      ├─→  统一后端 (server/app/main.py)  ─→  SQLite 数据库
   控制台 (manager)  ─┘
```

控制台写进数据库，公开站从同一个数据库读；两边看到的内容永远一致，不会再出现「控制台改了、公开站没变」。

## 写在前面

### 当前版本：0.5.0（2026-10-29）

**博客和管理后台现在是同一套后端、同一份数据库的两个前端。**

- **一个后端，两套前端**：原来控制台自带一套 FastAPI（`my-blog-manager/cms_core`），博客读的是另一份 markdown / TS 文件。现在后端抽到顶层 `server/`，博客与控制台都通过同源代理访问它，内容只存一份 SQLite 数据库。
- **内容不再散落在文件里**：文章、杂谈、说说、相册、友链、项目、关于页、站点配置全部落在数据库里。公开站改为运行时读库，刷新即最新；控制台改完刷新就能看到自己刚写的内容。
- **保存即生效，推送留版本**：数据库是唯一真相，控制台里的每一次保存都立即写库，公开站刷新就是新内容；Git 里存的是「内容快照」（`snapshots/content-*.json`）。点一次「推送到 GitHub 仓库」就把当前内容导成一份 JSON 提交进服务器仓库并推送到 GitHub——留一份可追溯、可回退的版本。
- **回退 = 把历史快照灌回数据库**：「发布历史与回退」里点任意一步，内容立刻回到那一步的样子。回退同样是一次新提交，历史不断，可以继续往前退。
- **图片、音乐、每日一句、评论全部统一**：上传的图片存在后端的数据目录，公开站和控制台用同一个 `/uploads/<文件名>` 地址引用；本地音乐由后端托管，公开站的播放器直接走后端接口；评论与每日一句也都在同一份数据库里。
- **密钥只有一处**：DeepSeek 密钥与会话密钥只从环境变量读，仓库里只留 `server/.env.example` 模板。

### 0.4.9 更新（2026-10-29）

**实测：点完「发布上线」，前台 0.5 秒后就变了。**

- **不再承诺「等 1-3 分钟」**：发布按钮下方的说明、发布状态里的「构建中」都改成了「同步中」，并注明「仅代码改动才会重建站点」。回退提示保持原样，因为回退助手确实仍会重建站点。
- **服务器端实测数据**：保存一条说说 → 点「发布上线」→ 公开站 **128 毫秒**后就能看到；从保存算起 271 毫秒。全程没有触发 `next build`，构建号与产物时间戳保持不变。同样的流程在改造前需要约 39 秒。
- **「已同步到线上」判断依然准确**：纯内容发布没有新构建号，状态文件里的生效时间戳负责证明它确实上线了。
- **发布链路有据可查**：新增两个端到端脚本，在服务器上跑「保存 → 发布 → 轮询公开站 → 打印状态」的完整计时，并负责清理测试内容。会话 Cookie 用服务器自己的密钥现算现用，不落盘也不打印。

### 0.4.8 更新（2026-10-29）

**点完「发布上线」，前台立刻就变了。**

- **公开站不再预渲染**：全站改为按请求渲染，文章、杂谈、说说、相册、友链、项目、关于页与站点配置都在请求时从磁盘读。以前公开站的 HTML 是构建那一刻冻结下来的（响应头里能看到 `x-nextjs-prerender: 1`），内容要等一次全站重建才能变。
- **发布不用再等那次 35 秒的构建**：服务器发布助手会先算出这次改了哪些文件，只涉及内容就直接跳过 `next build` 与重启，判定为「已实时生效」；只有代码（页面、组件、构建配置）变了才重新构建公开站，并按需重建管理后台。
- **站点配置也是实时的**：改 `siteConfig.ts` 里的标题、昵称、导航、头像、壁纸、弹幕、备案号，刷新即生效，连浏览器标签页的标题都会跟着变（改成了 `generateMetadata`）。
- **相册 / 友链 / 项目三块看板运行时读盘**：控制台自动生成的 `data/*.ts` 不再被打进产物，解析规则与引擎一致（自动去掉 TS 风格的尾随逗号），不会再出现「控制台里有、公开站上没有」的情况。
- **控制台的「已同步到线上」不再误判**：发布状态新增生效时间戳，纯内容发布虽然没有新构建号，也能被正确判定为已经生效。
- **顺手加固**：新增 `.gitattributes`，服务器上的发布脚本强制以 LF 换行检入，避免在 Windows 上编辑后传到服务器就坏掉。

### 0.4.7 更新（2026-10-29）

**发布之后刷新控制台，看到的就是最新内容。**

- **修好了「线上变了、控制台没变」**：以前控制台的文章、说说、相册、友链、项目、关于页与站点配置都是打包那一刻的快照，发布只重建公开站，控制台怎么刷新都是旧内容。现在控制台每次请求都直接读工作副本，公开站与控制台永远一致。
- **内容实时读取**：控制台改过的文章、说说、照片墙、友链、项目矩阵即时可见；改 `siteConfig.ts` 里的昵称、导航标题、头像等也无需重建控制台，刷新即生效。
- **引擎读得懂控制台的数据文件**：新增 `cms_core/tsdata.py`，能解析控制台自动生成的 TS 数据文件（自动去掉 TS 风格尾随逗号），友链与项目不再读回来是空的。
- **配置与端口解析统一**：站点配置读取、引擎端口解析各自收敛到一处（`lib/siteConfigRuntime.ts`、`lib/enginePort.ts`），引擎暂时不可达时自动回落，不会白屏。
- **发布不会互相踩**：连点两下「发布上线」时，后一次会被拦下并提示上一次还在进行；服务器上的发布助手也用文件锁串行执行，不会出现两次构建同时写同一个目录、线上停在半新半旧的情况。
- **顺手修掉两个会反复触发的隐患**：提示条回调改为稳定引用（此前会让依赖它的 `useEffect` 反复重跑），操作队列补齐发布 / 友链 / 项目同步等操作类型。

### 0.4.6 更新（2026-10-29）

**发布改成点一个按钮就行，还能一键退回前几步。**

- **不用再「更新本地」**：以前改完内容要先点一次「📥 更新本地」写回本地，再点「🚀 发布上线」，现在收件箱与发布面板都只留一个「🚀 发布上线」，点一次自动依次完成「写回本地改动 → 镜像内容 → 提交源码仓库 → 重新构建公开站 → 重启服务」。
- **博客同步更新**：点完约 1-3 分钟，线上文章、说说、照片墙、友链、项目矩阵、关于页与站点配置一起生效。
- **半套改动不上线**：写回过程中任何一项失败会立刻中止并说明原因，不会带着残缺内容发布。
- **可以退回前几步**：**设置 → 发布上线** 里的「4. 发布历史与回退」列出最近 20 步（提交号、说明、时间），当前线上版本标注「当前线上」，其余步骤点「回退到这里」即可把内容恢复到那一步并重新上线。
- **回退不砸历史**：回退是一次新的提交，不是抹掉记录，所以可以继续往前回退，一步一步往回走。
- **只回退内容**：文章、说说、相册 / 友链 / 项目数据、关于页、站点配置、本地音乐与上传图片会跟着回到那一步；源码本身不动，回退同样会推到服务器仓库与 GitHub 备份。

### 0.4.5 更新（2026-10-29）

**每日选刊整套下线，换成每天一句 AI 励志语。**

- **选刊没了**：原来那套每日选刊（控制台栏目、Agent 接入、草稿审核、封面轮播、往期归档）连同相关代码与数据全部删除，控制台侧栏不再有「每日选刊」。
- **每天一句**：每天定时让你现在接入的 AI（默认是煤球）说一句励志的话，显示在首页内容矩阵下方，跟站内其它卡片同一套风格。
- **控制台可管**：**设置 → 每日一句 ☀️** 里可以开关展示、开关每天自动生成、定生成时间（北京时间）、改栏目名称与副标题、换署名、调单句字数上限、重写给模型的话，还能看往期。
- **随时可以手写**：今天这句不合意，可以自己写一句顶上去；第二天仍然按时让 AI 重新说。
- **模型不用改代码**：直接复用「AI 煤球配置」里的模型、接口地址与性格设定，换模型只改配置。密钥依然只放在服务器环境文件里，仓库不存任何口令。
- **不用等**：访客打开首页时如果今天还没生成，引擎在后台悄悄写，页面不等人；控制台点「换一句」才会同步等待。

### 0.4.4 更新（2026-10-29）

**图床整套下线，图片改为从本机直接上传；照片墙删不掉照片的毛病也修好了。**

- **不再需要图床**：控制台「设置」里的「图库配置管理」整块移除，探针测试、Token 存储、图床上传接口一并下线，写文章、传壁纸、发说说配图全部改走本机直传。
- **图片落在自己手里**：本机图片传到控制台自带的图片仓库（`my-blog-manager/data/uploads/`），站内统一用 `/uploads/<文件名>` 引用；发布时镜像到公开站 `public/uploads/`，两端同一个地址，不用改写。
- **照片墙终于能删了**：以前照片墙渲染的是打包进前端 bundle 的旧快照，删完刷新就"复活"；现在改为运行时向引擎读盘，增删改全部实时生效。

### 0.4.3 更新（2026-10-28）

**AI 煤球改接 DeepSeek，接口换成 OpenAI 兼容协议。** 原先挂的 Gemini 在服务器上根本跑不通：出口连不上 `generativelanguage.googleapis.com`，密钥也从未配置，猫只能回兜底台词。现在它真的会说话了。

- **模型换了**：默认 `deepseek-flash`，即 **DeepSeek-V4.1-Flash**，思考强度可调（低 / 高 / 最大）。
- **接口可换**：控制台「设置 → AI 煤球配置 🐾」新增**接口地址**与**思考强度**两栏，模型 ID、性格 Prompt、生成预算、发散度也都能改，换成任何 OpenAI 兼容服务都行。
- **密钥只放环境变量**：仓库、代码、文档里都不存任何口令，服务器上写进 `/etc/xhblogs.env` 与 `/etc/xhblogs-manager.env`（权限 600），本地桌面版写进各应用的 `.env.local`。
- **运行时从 edge 换成 nodejs**：密钥是运行时才写进环境文件的，edge 对环境变量的处理依赖构建期注入，node 运行时直接读进程环境，**改完密钥重启服务即可生效，不必重新构建**。

> 升级前请留意：密钥没配好之前，煤球只会回"卡壳了"这类兜底台词；生成预算也别调太小，推理模型会把预算花在"思考"上，预算不够就只会想不会说。

### 0.4.2 更新（2026-10-28）

**评论系统整体重建，旧的 Gitalk 方案已彻底下线。** 以前评论存在 GitHub Issues 里，控制台既看不到也管不了；现在留言存在服务器本机的 SQLite 数据库中，站长可以在后台完成全部操作。

- **自建评论系统**：文章与说说页面都可以留言、回复、点赞。访客身份用浏览器本地生成的访客标识识别，用于限流（10 分钟 5 条、1 小时 20 条）与后台溯源，不采集真实身份。
- **评论管理台**：控制台新增 **💬 评论管理** 页面，全站每一条评论的昵称、邮箱、IP、点赞数、回复数、时间与来源页面一目了然；支持按状态 / 页面 / 关键词筛选，逐条或批量通过、隐藏、标记垃圾、删除。
- **站长回复**：可以直接以站长身份回复任意一条评论，前台带「站长」标识展示。
- **即时生效**：评论参数（总开关、审核开关、匿名开关、点赞开关、标题、占位符、提示语、最大字数）存在引擎里，保存后前台立刻改变，**不需要重新发布站点**。
- **灵境与等级系统下线**：灵境页面及其关联的创意工坊、帝江号舰船与 RPG 等级系统已从站点与控制台完整移除。

> 升级前请留意：旧的 GitHub 评论仓库可以自行归档删除，控制台的 GitHub OAuth 凭据已不再需要。

### 0.4.1 更新（2026-10-23）

> 每日选刊控制台与 Agent 接入已在 0.4.5 整体下线，以下仅作历史记录。

保留 0.4.0 的每日选刊控制台与 Agent 接入，整合两个社区 PR 的有效贡献，并修正兼容性问题。

- **壁纸分组（PR #25）**：创建、重命名、删除、切换分组与管理组内图片。修复空组意外回退旧壁纸、特殊字符读取被改写，以及旧配置缺少新字段时的保存问题。
- **编辑器改进（PR #15）**：GFM 表格支持、代码块加载与保存。保留普通正文转义与删除线，以及代码语言、缩进、空行和字面字符；完善代码围栏内标题的目录识别。
- 两项功能与 0.4.0 共存，原作者提交历史保留，维护者兼容性修复单独记录。

感谢 [PR #25 原作者 Kai](https://github.com/heiehiehi/XinghuisamaBlogs/pull/25) 和 [PR #15 原作者 ILoveFurina](https://github.com/heiehiehi/XinghuisamaBlogs/pull/15) 的贡献（名称按原 Git 提交署名）。

### 0.4.0 更新（2026-10-23）

> 每日选刊已在 0.4.5 整体下线，以下仅作历史记录。

本次新增可选的每日选刊管理，入口为 **设置 → 每日选刊**，沿用原控制台侧栏。默认关闭展示和 Agent 接收，新安装不预设专业领域，也不携带作者的个人期刊。

- 展示开关、板块文字、封面、轮播与历史范围可以配置，关闭展示保留内容。
- 自定义兴趣、排除词、来源、语言、栏目与条目数；支持任意领域。
- 新建或编辑草稿、逐条整理、阅读预览、上传封面，核对后发布到本地网站。
- 本机 Agent 使用独立授权，支持读取偏好、历史、提交与回执；不覆盖人工草稿或已发布日期。
- 提供首次使用引导、JSON 连接文件四步说明、客户端下载和可复制的 Codex 指令。
- 选刊服务随控制台启动，使用实际端口与「线上发布」中的网站路径；切换网站时私有数据隔离。

### 快速使用每日一句

1. 启动控制台（服务器上访问 `http://服务器IP/console`，本地则是双击 `my-blog-manager/Start.bat`）。
2. 在设置侧栏打开 **每日一句 ☀️**。默认每天 07:00（北京时间）自动生成，模型与性格沿用「AI 煤球配置 🐾」里的设定。
3. 想改说话时间、栏目名称、署名或给模型的话，改完点 **保存设置**，公开站立刻可见，不需要重新发布。
4. 今天这句不满意，点 **换一句** 让 AI 重新说；想自己写就直接在「手写一句」里写，点 **保存这句** 顶掉今天的自动结果。
5. 不想在首页出现这一栏时，关掉「在首页显示每日一句」即可，已经说过的话仍然保留。
6. 定时生成由服务器上的统一后端常驻执行，**控制台网页可以关着**；但后端必须保持运行。

> 后端需要读到 AI 密钥才能自动生成。请确认 `xhblogs-manager-api.service` 加载了 `/etc/xhblogs-manager.env`（含 `DEEPSEEK_API_KEY`），并且该文件权限为 600。

### 更新时会保留什么

更新器保留文章、个人 `siteConfig.ts`、每日一句的设置与内容、已有公开图片及控制端私有草稿。替换的程序文件保存在 `.update-backups/`，有本地未保存程序修改时停止并提示处理。

升级前仍应保存和备份自己的内容，更新后核对配置及授权状态。此更新不保证自动合并个人修改过的程序代码。PDF 审阅说明只供本地阅读，不随源码提交。

完整变更与验证范围见 [UpdateLog.md](UpdateLog.md)。0.4.1 已整合壁纸分组和编辑器两个 PR 的功能与修复。

### 历史更新摘要（0.3.1 - 0.3.2）

#### 1. 新增个人关于动态

> 关于动态类贡献度及日志显示

#### 2. 修复部分富文本编辑器bug

> 修补目前存在的编辑器bug，如超链接无法显示，引用无法显示等

#### 3. 灵境与等级系统（后续版本已移除）

> 曾提供类创意工坊功能与 RPG 等级系统，现已从站点与控制台完整下线

#### 4. 音乐显示bug，已修复

> 已更换播放实现，修复音乐显示bug。更新即可

---

## 一、部署到自己的服务器

### 1. 环境配置

服务器建议使用 Linux（CentOS / Alibaba Cloud Linux / Ubuntu 均可），需要准备：

- **Node.js**（20.9.0 以上，适配当前 Next.js 16）
- **npm**
- **Git**
- **Python**（3.10 以上，本系统在 3.10 环境下测试通过）
- **Nginx**（公网入口：`/` 转发公开站、`/console` 转发控制台，见第 5 节）

### 2. 目录与仓库

整套系统跑在一个 Git 工作区里，裸仓库用于保存每一版源码：

```
/opt/xinghui-blog/            # Git 工作区
├── XHBlogs/                  # 前端一：公开站源码
├── my-blog-manager/          # 前端二：控制台源码
├── server/                   # 后端：统一 API
└── snapshots/                # 内容快照（每次发布导出一份 JSON）
/srv/git/xinghui-blog.git     # 裸仓库，保存每一版源码
```

准备源码：

```bash
mkdir -p /opt/xinghui-blog && cd /opt/xinghui-blog
git clone /srv/git/xinghui-blog.git .

cd XHBlogs && npm ci
cd ../my-blog-manager && npm ci

# 统一后端：单独建虚拟环境并装依赖
cd ../server && python3.11 -m venv .venv
.venv/bin/pip install -i https://mirrors.aliyun.com/pypi/simple/ -r requirements.txt
```

> **数据库放在仓库外**：`server/data/` 已被 `.gitignore` 排除，但仓库一旦被重建，里面的东西就没了。
> 线上请用环境变量把数据库指到 `/var/lib/xhblogs/` 这样的系统目录：
>
> ```bash
> mkdir -p /var/lib/xhblogs && chown xhblogs:xhblogs /var/lib/xhblogs
> ```
>
> ```ini
> # /etc/xhblogs-manager.env
> XHS_REPO_ROOT=/opt/xinghui-blog
> XHS_DATA_DIR=/var/lib/xhblogs
> XHS_CONTENT_DIR=/var/lib/xhblogs
> XHS_DATABASE_URL=sqlite:////var/lib/xhblogs/blog.db
> XHS_SNAPSHOT_DIR=/opt/xinghui-blog/snapshots
> ```

> **从旧版本升级**：老的内容还在 markdown / TS 文件里时，先建库再导入一次：
>
> ```bash
> cd /opt/xinghui-blog/server
> XHS_DATABASE_URL=sqlite:////var/lib/xhblogs/blog.db \
>   .venv/bin/python scripts/import_content.py --source /opt/xinghui-blog/my-blog-manager
> ```
>
> 导入是覆盖式的，脚本会打印每类内容导入了多少条。

> **异地备份**：工作区还挂了一个 `github` 远端，指向你自己的备份仓库（本项目用的是
> `yunqi-meng/NewBoKe`）。发布助手每次发布会把同一提交再推一份到这个远端，于是线上内容
> 除了留在服务器上，还有一份 GitHub 存档。备份用的是仓库级 SSH 部署密钥，私钥只放在服务器
> 的 `/home/xhblogs/.ssh/` 下，不入库、不进脚本，也不写进任何文档。
> 备份失败只会记进 `/var/log/xhblogs-publish.log`，不会影响发布本身。

### 3. 注册 systemd 服务

公开站 `/etc/systemd/system/xhblogs.service`：

```ini
[Unit]
Description=XHBlogs public Next.js site
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=xhblogs
Group=xhblogs
WorkingDirectory=/opt/xinghui-blog/XHBlogs
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
Environment=PATH=/usr/bin:/bin
EnvironmentFile=-/etc/xhblogs.env
ExecStart=/opt/xinghui-blog/XHBlogs/node_modules/.bin/next start -H 0.0.0.0 -p 8080
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

控制台前端 `/etc/systemd/system/xhblogs-manager-web.service`：

```ini
[Unit]
Description=XHBlogs manager Next.js console
After=network.target xhblogs-manager-api.service
Wants=xhblogs-manager-api.service

[Service]
Type=simple
User=xhblogs
Group=xhblogs
WorkingDirectory=/opt/xinghui-blog/my-blog-manager/.next/standalone
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
Environment=PORT=3001
Environment=HOSTNAME=127.0.0.1
Environment=NEXT_PUBLIC_CONSOLE_BASE_PATH=/console
Environment=XHS_MANAGER_ROOT=/opt/xinghui-blog/my-blog-manager
Environment=XHS_ENGINE_API_PORT=8000
Environment=PATH=/usr/bin:/bin
EnvironmentFile=-/etc/xhblogs-manager.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

统一后端 `/etc/systemd/system/xhblogs-manager-api.service`：

```ini
[Unit]
Description=XHBlogs unified backend (FastAPI)
After=network.target

[Service]
Type=simple
User=xhblogs
Group=xhblogs
WorkingDirectory=/opt/xinghui-blog/server
Environment=PYTHONUNBUFFERED=1
Environment=PYTHONIOENCODING=utf-8
Environment=XHS_REPO_ROOT=/opt/xinghui-blog
Environment=XHS_ENGINE_API_PORT=8000
# 每日一句要调 AI，密钥只放这个环境文件里（权限 600），仓库不存任何口令
EnvironmentFile=-/etc/xhblogs-manager.env
ExecStart=/opt/xinghui-blog/server/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

三个服务的分工：

| 服务 | 作用 | 监听 |
| --- | --- | --- |
| `xhblogs` | 公开站，`next start` 运行预构建产物 | `0.0.0.0:8080` |
| `xhblogs-manager-web` | 控制台前端，挂在 `/console` | `127.0.0.1:3001`，经 nginx 对外 |
| `xhblogs-manager-api` | **统一后端**（FastAPI），博客与控制台共用 | `127.0.0.1:8000`，只允许本机访问 |

> 后端只监听 `127.0.0.1`，浏览器直连不了它。公开站与控制台的每个 API 调用都走各自的
> 同源代理（公开站 `/api/*`，控制台 `/api/proxy/*`），由服务端转发到本机后端，
> 因此局域网和公网访问都能正常工作。

### 4. 构建与启动

```bash
cd /opt/xinghui-blog/XHBlogs && npm run build
cd /opt/xinghui-blog/my-blog-manager && npm run build

systemctl daemon-reload
systemctl enable --now xhblogs xhblogs-manager-web xhblogs-manager-api
```

控制台前端使用 `output: 'standalone'` 构建，运行时还需要把静态资源拷进产物目录，并写入后端端口：

```bash
cd /opt/xinghui-blog/my-blog-manager
mkdir -p .next/standalone/.next/static .next/standalone/public
cp -a .next/static/. .next/standalone/.next/static/
printf '%s\n' '{"api_port": 8000}' > .next/standalone/public/backend_config.json
```

> 控制台默认构建成挂在 `/console`，所以构建前要带上前缀（`basePath` 是编译期写死的，改前缀必须重新构建）：
>
> ```bash
> NEXT_PUBLIC_CONSOLE_BASE_PATH=/console npm run build
> ```
>
> 想在根路径直接跑（比如本地双击 `Start.bat`），把这个变量留空即可。`xhblogs-manager-rebuild` 已经内置了 `CONSOLE_BASE_PATH=/console`，可以用 `XHBlogs_CONSOLE_BASE_PATH=` 覆盖。

> **每次改过控制台代码，都要重新执行上面这段「构建与启动」**，因为 `next start` 跑的是预构建产物，源码改动不会自动生效。

> 仓库里已经把这几步固化成脚本，服务器上直接用就行：
>
> ```bash
> sudo install -m 755 /opt/xinghui-blog/tools/xhblogs-rebuild        /usr/local/bin/
> sudo install -m 755 /opt/xinghui-blog/tools/xhblogs-manager-rebuild /usr/local/bin/
> sudo install -m 755 /opt/xinghui-blog/tools/xhblogs-publish         /usr/local/bin/
> sudo install -m 755 /opt/xinghui-blog/tools/xhblogs-deploy          /usr/local/bin/
> ```
>
> `xhblogs-deploy` 是手动更新用的：拉最新代码后按改动范围决定重建公开站、
> 重建控制台还是只重启后端。发布助手则只在需要时调用前两个。

### 5. 公网访问与域名

线上是一台 nginx 兜在前面，公开站与控制台同域、按路径分流：

| 路径 | 上游 | 说明 |
| --- | --- | --- |
| `/` | `127.0.0.1:8080` | 公开站（`next start`） |
| `/console` | `127.0.0.1:3001` | 控制台（构建时 `basePath=/console`） |

统一后端仍然只监听 `127.0.0.1:8000`，由两个前端各自转发，公网碰不到它。控制台的 systemd 单元也已改成 `HOSTNAME=127.0.0.1`，公网入口只有 nginx。

安全组只需要放行三个端口：

| 端口 | 用途 | 建议来源 |
| --- | --- | --- |
| 22 | SSH | 你的办公 IP |
| 80 | HTTP（nginx） | 全网 |
| 443 | HTTPS（nginx） | 全网 |

`8080` / `3001` 不必再对公网开放——它们只被 nginx 在本机调用。此前直接开在公网上的 `3001` 可以关掉了。

#### 5.1 安装并接入 nginx

阿里云 Linux 3 的 dnf 配置里用 `exclude=` 挡了 nginx，安装时要显式解除，否则会提示「没有可用软件包」：

```bash
dnf install -y --disableexcludes=all nginx
```

仓库里的 [tools/nginx-xhblogs.conf](tools/nginx-xhblogs.conf) 就是线上在用的配置，装成 `/etc/nginx/conf.d/xhblogs.conf`，并移除发行版自带的默认站点：

```bash
install -m 644 /opt/xinghui-blog/tools/nginx-xhblogs.conf /etc/nginx/conf.d/xhblogs.conf
rm -f /etc/nginx/conf.d/default.conf
nginx -t && systemctl enable --now nginx
```

> 如果 `nginx -t` 报 `conflicting server name "_"`，是 `/etc/nginx/nginx.conf` 里自带的 `server { listen 80 default_server; … }` 还没删干净。把那段 `server` 块注释掉（先备份）再 reload，站点不受影响。

之后 `xhblogs-deploy` 会自动同步这份配置：检测到仓库里的 nginx 模板有变化就先备份线上文件，`nginx -t` 通过才 reload，不通过自动回滚。

> 控制台的 `location` **不能**写成 `proxy_pass http://127.0.0.1:3001/;`。末尾的斜杠会剥掉 `/console` 前缀，而控制台是按带前缀的路由构建的，剥掉等于整站 404。

#### 5.2 域名解析

在域名托管商的解析控制台加两条 A 记录，都指向服务器公网 IP：

| 主机记录 | 类型 | 记录值 |
| --- | --- | --- |
| `@` | A | 你的服务器公网 IP |
| `www` | A | 你的服务器公网 IP |

生效后用 `dig +short 你的域名`（或 `ping 你的域名`）确认返回的是这个 IP。然后改 nginx 的 `server_name`：

```nginx
server_name example.com www.example.com;
```

```bash
nginx -t && systemctl reload nginx
```

此时 `http://example.com/` 是博客，`http://example.com/console` 是控制台，两边的链接和接口都在同一个域名下，不用再记 IP 和端口。

#### 5.3 证书与 HTTPS

证书签好后，打开 [tools/nginx-xhblogs.conf](tools/nginx-xhblogs.conf) 末尾注释着的 443 段，填上证书路径，并把 80 段改成跳转：

```nginx
location / { return 301 https://$host$request_uri; }
```

```bash
nginx -t && systemctl reload nginx
```

再在 `/etc/xhblogs-manager.env` 里补一行，让登录 Cookie 带上 `Secure`：

```ini
MANAGER_COOKIE_SECURE=1
```

```bash
systemctl restart xhblogs-manager-api
```

控制台前端不用动——它只关心 `basePath`，与协议无关。

签名方式按手头条件选：阿里云控制台可以申请免费的 DV 证书直接下载 nginx 格式；不想手动续期就在服务器上装 acme.sh，用 DNS 方式签发（不用停 nginx），把签出的 `fullchain` / `key` 指给 443 段即可。两条记录（根域与 `www`）都要签进去，否则从 `www` 打开会证书告警。

#### 5.4 上线自检

```bash
curl -I http://你的域名/                 # 200
curl -I http://你的域名/console          # 307，Location: /console/login
curl -I http://你的域名/console/login    # 200
ss -ltnp | grep -E ':(3001|8080|8000)'   # 3001 与 8000 只在 127.0.0.1
```

### 6. 控制台的密码登录

控制台暴露在公网上时**必须开启密码登录**，否则任何人都能改你的文章和设置。开启方式是在服务器上准备一个环境变量文件：

```bash
cd /opt/xinghui-blog/my-blog-manager
node scripts/manager-passwd.mjs "你的管理密码" --env-file /etc/xhblogs-manager.env
node scripts/manager-passwd.mjs --secret --env-file /etc/xhblogs-manager.env
```

第一个命令写入密码的 scrypt 哈希，第二个生成随机会话密钥。两者都只落在服务器上（`chmod 600`），仓库里不会保存任何口令。写好之后让服务读取这个文件并重启：

```ini
# /etc/systemd/system/xhblogs-manager-web.service 的 [Service] 段
EnvironmentFile=-/etc/xhblogs-manager.env
Environment=HOSTNAME=127.0.0.1
```

统一后端用的是同一个 `MANAGER_SESSION_SECRET`，所以控制台与后端互相认得对方的会话 Cookie。

重启后访问 `https://你的域名/console` 会先跳到 `/console/login`，输入刚才设置的密码即可进入，会话有效期 7 天，Cookie 为 HttpOnly。控制台右上角还有一个退出登录按钮。

> 控制台只监听本机，远程调试时用 SSH 隧道即可：`ssh -L 3001:127.0.0.1:3001 xhblogs@服务器IP`，再打开 `http://127.0.0.1:3001/console`。

> **安全提醒**：用 IP + HTTP 访问时密码是明文传输的，务必在安全组里限制来源 IP；接入域名并配置 HTTPS 后，再把 `MANAGER_COOKIE_SECURE` 改成 `1`。

> **为什么远程访问不用改代码**：控制台前端原先直接请求 `http://127.0.0.1:<引擎端口>`，这只在本机有效，从别的电脑打开会去连访问者自己的 127.0.0.1。现在所有引擎调用统一走同源的 `/api/proxy`，由服务端转发到本机后端，因此局域网和公网访问都能正常工作。

### 7. 本地开发（可选）

如果你仍然想在 Windows 上本地调试，可以双击 `my-blog-manager/Start.bat`。

后端的本地配置放在 `server/.env`（已被 `.gitignore` 忽略，仓库里只留 `.env.example` 模板）：

```ini
# server/.env
XHS_DATABASE_URL=sqlite:///server/data/blog.db
DEEPSEEK_API_KEY=你的本地开发密钥
```

本地直接起后端：

```bash
cd server
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

内容保存后本地就已经生效。本地没有推送助手脚本（`/usr/local/bin/xhblogs-publish` 只在服务器上有），点「推送到 GitHub 仓库」只会把当前内容导成一份快照放到 `snapshots/`，提交与推送需要到服务器上执行。

### 8. 开发机与服务器的协作

服务器上的控制台发布会在 `/opt/xinghui-blog` 里产生提交，开发机也会往同一分支推代码，
两边同时写就容易撞车。约定如下：

| 谁 | 做什么 |
| --- | --- |
| 开发机 | 提交前先 `git pull --rebase aliyun main`（把服务器上的发布提交取回来），再 `git push aliyun main` |
| 服务器 | 发布助手会先 `fetch` 并合并 `origin/main`，再提交推送，所以发布不会因为落后而被拒 |

> 推送源码请用 `xhblogs-git` 这条 SSH 主机别名（以 `xhblogs` 用户身份写入裸仓库）。
> 如果用 root 身份推送，裸仓库里会留下 root 属主的对象，服务器上的发布推送就会因
> 权限不足被拒。控制台那边不用改任何配置。

---

## 附录：统一后端与数据库

想改内容结构、加字段、接新的接口，从这里入手。

### 目录

```
server/app/
├── main.py          # 应用入口：注册全部路由、中间件、启动任务
├── config.py        # 运行配置：全部从环境变量读
├── db.py            # 数据库连接与会话
├── models.py        # ORM 模型（所有表都在这里）
├── security.py      # 口令哈希、会话令牌、管理员校验
├── snapshot.py      # 内容快照的导出与导入
├── helpers.py       # 通用小工具
├── markdown.py      # Markdown 解析
├── siteconfig.py    # 站点配置的读取与写入
├── tsdata.py        # 解析旧的 TS 数据文件（导入老内容时用）
└── api/
    ├── content.py       # 文章 / 杂谈 / 关于页 / 说说
    ├── collections.py   # 相册 / 友链 / 项目
    ├── config.py        # 站点配置
    ├── drafts.py        # 草稿箱
    ├── media.py         # 图片上传与读取
    ├── music.py         # 本地音乐
    ├── comments.py      # 评论
    ├── dailyquote.py    # 每日一句
    ├── chat.py          # AI 煤球
    ├── auth.py          # 登录 / 登出
    └── deploy.py        # 发布 / 回退 / 线上状态
```

### 数据表

| 表 | 装什么 |
| --- | --- |
| `articles` | 文章、杂谈、关于页（`type` 区分，`slug` 唯一） |
| `moments` | 说说 |
| `albums` / `album_photos` | 相册与相册里的照片 |
| `friends` / `projects` | 友链、项目矩阵 |
| `site_config` | 站点配置（整份 JSON 存一行） |
| `drafts` | 草稿箱 |
| `music_tracks` | 本地音乐（元数据，音频本体在磁盘上） |
| `daily_quotes` | 每日一句（`date` 为主键，一天一条） |
| `media_assets` | 上传图片的元数据 |
| `settings` | 其它零散设置（每日一句配置等） |
| `comments` / `comment_likes` | 评论与点赞（**不进快照**，单独备份数据库文件） |

### 加一张新表、改一个字段

1. 在 `server/app/models.py` 里改 ORM 模型；
2. 建表是自动的——`init_db()` 每次启动都会按模型补齐缺失的表；
3. 如果新表也要进内容快照，在 `server/app/snapshot.py` 的 `TABLES` 里登记它；
   注意**父表要排在子表前面**（插入按正序、删除按倒序，否则外键约束会拦下来）；
4. 在 `server/app/api/` 下写路由，前端通过 `/api/...` 访问。

### 内容是怎么到前台的

```
控制台保存 ─→ POST /api/articles ─→ 写进数据库
公开站渲染 ─→ GET  /api/articles ─→ 从数据库读
```

两端都走同源代理：

| 前端 | 代理路由 | 转发到 |
| --- | --- | --- |
| 公开站 | `/api/comments`、`/api/config`、`/api/daily-quote`、`/api/chat`、`/api/music/*` | `http://127.0.0.1:8000` |
| 控制台 | `/api/proxy/<后端路径>` | `http://127.0.0.1:8000` |

公开站的代理是**白名单**的：只放行上面那几个前缀，其余后端接口不会从公网暴露。
控制台的 `/api/proxy` 走管理员鉴权。

### 改完怎么验证

```bash
# 本地：起后端，跑一遍接口冒烟测试
cd server
.venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
.venv/Scripts/python scripts/smoke_test.py --base http://127.0.0.1:8000

# 服务器上：冒烟测试也能跑，带上会话密钥即可写
cd /opt/xinghui-blog/server
MANAGER_SESSION_SECRET=… .venv/bin/python scripts/smoke_test.py --base http://127.0.0.1:8000
```

冒烟测试会走一遍主要接口的读写，跑完自动清理测试数据。

---

## 二、修改内容与推送到 GitHub 仓库

控制台不再有「操作暂存区」：文章、说说、相册、友链、项目、站点配置，点「保存」的那一刻就直接写进数据库，公开站刷新页面即可见，不用再等一次发布。

> 保存失败会当场提示原因，并把列表拉回服务端的真实数据，不会出现「界面显示已保存、其实没落库」的情况。

**推送到 GitHub 仓库**

内容变化不需要推送就已经在线；右上角的 📤 按钮（以及「设置 → 推送到 GitHub」）负责把当前内容导成一份快照，提交到服务器仓库并推送到 GitHub 仓库，留一份可追溯、可回退的版本。确认后系统会自动完成：

1. **导出内容快照**：把当前数据库里的内容整体导出成一份 JSON（`snapshots/content-<时间戳>.json`）；
2. **提交并推送服务器仓库**：在服务器工作区提交这份快照并推送到裸仓库，源码仓库与线上保持同步；
3. **推送到 GitHub 仓库**：把同一个提交推到 `github` 远端；推送结果（成功 / 失败 / 未配置远端）会显示在推送状态里，GitHub 失败不影响已经在线的内容；
4. **按需重建**：**只有代码变了才重建**——改了公开站代码就重建公开站，改了控制台代码就重建控制台，改了后端代码就重启后端。只改了内容的话，这一步直接跳过。

> **🌟 推送只留版本，不覆盖内容**：它提交的是当前内容的快照，不会回滚任何已保存的数据；内容早就实时生效了。

整个过程通常几秒钟。推送日志见 `/var/log/xhblogs-publish.log`。

> 如果你直接在服务器上改了源码，可以用 `sudo /usr/local/bin/xhblogs-deploy` 拉最新代码并按改动范围重建；
> 只想要一次公开站重建的话，用 `sudo /usr/local/bin/xhblogs-rebuild`。

博客文章、说说（碎碎念）、杂谈等所有内容的修改与发布，均遵循此流程。

> **💡 黄金法则**：保存即生效，推送留版本。

### 内容快照长什么样

一份快照就是一份完整的内容导出，包含文章、杂谈、说说、相册与照片、友链、项目、站点配置、
草稿、本地音乐、每日一句与图片元数据（评论不进快照，它是访客数据，单独备份数据库文件即可）：

```json
{
  "version": 1,
  "createdAt": "2026-10-29 19:47:35",
  "tables": {
    "articles": [ { "slug": "first", "title": "…", "content": "…", "date": "…" } ],
    "moments": [],
    "albums": [],
    "album_photos": [],
    "friends": [],
    "projects": [],
    "site_config": [ { "id": 1, "payload": "{…}" } ],
    "drafts": [],
    "music_tracks": [],
    "daily_quotes": [],
    "media_assets": [],
    "settings": []
  }
}
```

### 发布历史与回退

「设置 → 线上发布」里的「4. 发布历史与回退」列出最近 20 步，每一步显示提交号、说明与时间；
发布是 `chore(publish)`，回退是 `chore(rollback)`，一眼能分清。

点任意一步的 **「回退到这里」**，系统会把那次提交里的快照灌回数据库，文章、说说、相册 / 友链 / 项目数据、
关于页、站点配置、本地音乐与图片元数据立刻回到那一步的样子，并再提交一份新的快照。
回退是一次**新的提交**，历史不会因此断掉，可以继续往前回退。回退日志同样写在 `/var/log/xhblogs-publish.log`。

> 快照本身存在 Git 里，所以回退不依赖数据库备份——只要仓库还在，任何一步都能退回去。

### 线上状态面板

「设置 → 线上发布」会实时显示公开站当前的状态：服务是否在运行、最近一次构建的时间与构建号、
源码仓库的最新提交、以及上一轮发布的结果。内容改动不需要重新构建，所以判断是否生效看的是
发布状态里的**生效时间戳**，而不是构建时间。

---

## 三、图片上传（本地图片仓库）

控制台不再依赖任何第三方图床。图片直接从你的电脑上传，落进**统一后端的数据目录**里的本地图片仓库，站点内统一以 `/uploads/<文件名>` 引用。

**上传流程：**

1. 打开控制台「照片墙 → 相册 → 添加碎片」，或「设置 → 视觉背景配置」里的壁纸上传区，也可以是写文章时的图片工作台。
2. 点 **[上传]** 或直接把图片拖进虚线框，图片会从本机传到后端并落盘。
3. 落盘成功后，控制台直接用 `/uploads/<文件名>` 预览，粘贴外链的方式同样保留。
4. 公开站与控制台用**同一个地址**引用这些照片，公开站的 `/uploads/<文件名>` 由服务端转发到后端取文件。

> 本地图片仓库里的图片是二进制文件，不进 Git、不会随发布推送到远端。
> 如果你的照片不可再生，记得定期备份后端数据目录里的 `uploads/` 子目录
> （线上默认是 `/var/lib/xhblogs/uploads/`）。

---

## 四、AI 猫猫助理设置

博客系统内置了一只聪明的 AI 猫猫助理（默认接入 **DeepSeek**，走 OpenAI 兼容协议）。模型、接口地址、性格提示词都能在控制台里改，理论上换成任何兼容服务都行。

首先，你需要申请一个 DeepSeek 的 API Key（申请教程网络资源丰富，在此不赘述）。拿到 API Key 后，在控制台进行如下配置：

![猫猫设置](picture/Pasted%20image%2020260427134211.png)

控制台「设置 → AI 煤球配置 🐾」里可调：模型 ID（默认 `deepseek-flash`，即 DeepSeek-V4.1-Flash）、接口地址（默认 `https://api.deepseek.com`）、性格 Prompt、生成预算、发散度和思考强度。

在本地设定好猫猫的专属系统提示词（性格）后，我们需要让线上环境也拥有调用 AI 的能力。**AI 现在只有统一后端会调**，所以密钥只需要写进后端的环境变量文件：

```bash
echo 'DEEPSEEK_API_KEY=你的真实 API 密钥' >> /etc/xhblogs-manager.env
chmod 600 /etc/xhblogs-manager.env
systemctl restart xhblogs-manager-api
```

`/etc/systemd/system/xhblogs-manager-api.service` 里已经声明了 `EnvironmentFile=-/etc/xhblogs-manager.env`，
因此统一后端会读到这份密钥；公开站与控制台都通过它调用 AI，不需要各自再放一份。

本地开发把密钥写进 `server/.env`（已被 `.gitignore` 忽略，不会进仓库）。

> **每日一句也由后端调用 AI**，用的是同一份密钥。

> **密钥不要写进代码、文档或仓库**，只放在服务器上权限为 600 的环境变量文件里。

> 推理模型会把生成预算花在"思考"上，预算调太小就只会想、不会说，所以默认值给到 512；想更快就调低"思考强度"。

---

## 五、每日一句

每天定时让煤球说一句话，显示在首页内容矩阵下方。

- **管理入口**：控制台 → **⚙️ 设置 → ☀️ 每日一句**。保存后公开站立刻可见，**不需要重新发布站点**。
- **可调项**：是否在首页显示、是否每天自动生成、每天生成时间（北京时间）、栏目名称、副标题、署名、是否显示日期、是否显示署名、单句字数上限、给模型的话（提示词里的 `{date}` 会替换成当天日期）。
- **换一句 / 手写一句**：今天这句不满意就点「换一句」让 AI 重新说；也可以直接手写一句顶掉今天的自动结果，第二天仍按时重新生成。
- **往期**：控制台底部保留最近 30 条，说过什么一目了然。
- **模型与人设**：完全复用「AI 煤球配置 🐾」里的模型、接口地址与性格 Prompt，换模型不用改代码。
- **数据位置**：设置与往期都存在统一后端的数据库里（`settings` 与 `daily_quotes` 两张表），跟其它内容在一起。

> 定时生成由统一后端常驻执行，**控制台网页可以关着**，但 `xhblogs-manager-api` 必须保持运行。访客打开首页时如果今天还没生成，后端在后台悄悄写，页面不等人。

---

## 六、评论系统配置

评论系统是**自建**的：留言存在统一后端的 SQLite 数据库里（`comments` 与 `comment_likes` 两张表），前台读写走同一个后端，控制台可以直接审核、回复、隐藏、删除。**不需要 GitHub 仓库，也不需要 OAuth 授权。**

> 旧的 Gitalk 方案（把评论塞进 GitHub Issues）已经整体下线：它让站长在后台看不到、也管不了任何一条留言。现在控制台的 **💬 评论管理** 页面能看到全站每一条评论。

### 前台效果

- 文章、说说等页面的评论区：访客填写昵称（和可选邮箱）即可留言、回复、点赞。
- 访客身份靠浏览器本地生成的访客标识识别，用于**限流**（10 分钟最多 5 条、1 小时最多 20 条）与后台溯源，不采集真实身份信息。

### 控制台操作

进入控制台 → **💬 评论管理**，可以：

- 看全部评论的统计：总数、待审核、已发布、垃圾箱、已隐藏、今日新增。
- 按**状态**、**所在页面**、**关键词**筛选，支持最新 / 最早 / 点赞最多三种排序。
- 逐条或批量**通过 / 隐藏 / 标记垃圾 / 删除**，删除时会连带清掉它的回复。
- 以**站长身份回复**任何一条评论，回复直接出现在前台，并带「站长」标识。
- 每条评论都记录了昵称、邮箱、IP、访客标识、点赞数、回复数、时间和来源页面，后台一览无余。

### 评论参数

控制台 → **⚙️ 设置 → 💬 评论系统配置**，保存后**前台立即生效，不需要重新发布站点**：

| 参数 | 说明 |
| --- | --- |
| 开启评论功能 | 总开关，关掉后前台不再显示评论区（数据仍保留） |
| 评论需要审核 | 新留言先进入「待审核」，在评论管理台通过后才公开 |
| 允许匿名留言 | 关闭后访客必须填写邮箱才能提交 |
| 开放点赞 | 关闭后前台不再显示点赞按钮 |
| 评论区标题 / 占位符 / 提示语 | 前台展示的文案 |
| 单条最大字数 | 单条留言的字数上限（10 - 2000） |

### 数据与备份

评论数据只存在服务器磁盘上，**不进 Git**（内容快照里也不含评论）。备份时把后端的数据库文件一起拷走即可
（线上默认是 `/var/lib/xhblogs/blog.db`）；换服务器或重建服务后，把这个文件放回原位，留言就回来了。

---

## 七、本地音乐挂件设置

想给博客配上 BGM 吗？音频直接传到控制台，由**统一后端**托管，公开站与控制台读同一份歌单。

进入控制台 → **音乐播放设置**：

1. 把音频文件拖进上传框，或点击选择文件。支持 `mp3 / m4a / aac / ogg / wav / flac / weba`，单个不超过 100MB。
2. 填上歌曲名（不填就用文件名），歌手可选。封面图片和 `.lrc` 歌词同样可选。
3. 点 **上传并加入歌单**，曲目会立刻出现在下方列表里，可以就地试听、换封面、补歌词或删除。

几个需要知道的细节：

- **音频本体不进 Git**。仓库里只跟踪内容快照里的曲目元数据，音频文件留在服务器磁盘上——公开的备份仓库不适合塞版权音乐，仓库体积也不会被撑爆。
- **上传即可听，不必发布**。后端把音频存在自己的数据目录里，公开站的播放器通过 `/api/music/*` 转发取流，音频、封面、歌词走的是同一套接口。
- **公开站的转发是受限的**：只放行 `local / file / cover / lyrics` 四类路径，其余后端接口不会从公开站暴露出去。

---

## 写在最后

XHBlogs 还有诸多隐藏的细节功能，期待极客朋友们在实际使用中慢慢探索。本项目旨在提供一套开箱即用的前端展示与后台管理方案。如果你是资深开发者，觉得控制台操作仍有优化空间，完全可以基于 Next.js 源码进行二次开发，甚至手搓 Markdown 进行部署！

**如果你觉得这个项目对你有帮助，请务必在 GitHub 上为我点亮一颗 ⭐ Star！每一颗星都是博主持续维护更新的最大动力。谢谢大家！**

## 许可证

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)

> 本项目采用 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) 许可协议。允许免费学习、分享和二次修改后发布（二次开源发布需提及原作者），但**严禁用于任何商业用途**。
