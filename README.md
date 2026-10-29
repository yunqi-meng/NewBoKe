# 🌟 欢迎使用 XHBlogs！

这是一个采用 Next.js 构建的高颜值、毛玻璃（Glassmorphism）风格个人博客系统。本项目自带完善的前端展示与独立的后台控制台，支持 Markdown 沉浸式写作、草稿管理以及从本机直接上传图片。

**当前推荐的部署形态：把公开站与控制台一起部署在你自己的 Linux 服务器上**（systemd 托管公开站、控制台前端与内容引擎，Git 管理每一版源码）。控制台里改完内容，点一次「发布上线」就会自动提交源码、重新构建并重启公开站，改动直接出现在线上。

本指南将带你完成服务器部署，并说明控制台的日常使用。

---
## 语言

[![English](https://img.shields.io/badge/Language-English-blue.svg)](README_en.md)
[![中文](https://img.shields.io/badge/语言-中文-red.svg)](README.md)

## 写在前面

### 当前版本：0.4.8（2026-10-29）

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

1. 启动控制台（服务器上访问 `http://服务器IP:3001`，本地则是双击 `my-blog-manager/Start.bat`）。
2. 在设置侧栏打开 **每日一句 ☀️**。默认每天 07:00（北京时间）自动生成，模型与性格沿用「AI 煤球配置 🐾」里的设定。
3. 想改说话时间、栏目名称、署名或给模型的话，改完点 **保存设置**，公开站立刻可见，不需要重新发布。
4. 今天这句不满意，点 **换一句** 让 AI 重新说；想自己写就直接在「手写一句」里写，点 **保存这句** 顶掉今天的自动结果。
5. 不想在首页出现这一栏时，关掉「在首页显示每日一句」即可，已经说过的话仍然保留。
6. 定时生成由服务器上的内容引擎常驻执行，**控制台网页可以关着**；但引擎必须保持运行。

> 引擎需要读到 AI 密钥才能自动生成。请确认 `xhblogs-manager-api.service` 加载了 `/etc/xhblogs-manager.env`（含 `DEEPSEEK_API_KEY`），并且该文件权限为 600。

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
- *可选：域名与 Nginx（用于 HTTPS 与自定义域名）*

### 2. 目录与仓库

整套系统跑在一个 Git 工作区里，裸仓库用于保存每一版源码：

```
/opt/xinghui-blog/            # Git 工作区
├── XHBlogs/                  # 公开站源码
└── my-blog-manager/          # 控制台源码
/srv/git/xinghui-blog.git     # 裸仓库，保存每一版源码
```

准备源码：

```bash
mkdir -p /opt/xinghui-blog && cd /opt/xinghui-blog
git clone /srv/git/xinghui-blog.git .

cd XHBlogs && npm ci
cd ../my-blog-manager && npm ci
```

> 控制台源码里有两个**每台机器都不一样**的文件，它们不入库，请自行维护：
> `my-blog-manager/data/deploy_config.json`（网站源码目录）和 `my-blog-manager/public/backend_config.json`（内容引擎端口）。

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
Environment=HOSTNAME=0.0.0.0
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

内容引擎 `/etc/systemd/system/xhblogs-manager-api.service`：

```ini
[Unit]
Description=XHBlogs manager FastAPI backend
After=network.target

[Service]
Type=simple
User=xhblogs
Group=xhblogs
WorkingDirectory=/opt/xinghui-blog/my-blog-manager
Environment=PYTHONUNBUFFERED=1
Environment=XHS_MANAGER_ROOT=/opt/xinghui-blog/my-blog-manager
Environment=XHS_ENGINE_API_PORT=8000
# 每日一句要调 AI，密钥只放这个环境文件里（权限 600），仓库不存任何口令
EnvironmentFile=-/etc/xhblogs-manager.env
ExecStart=/opt/xinghui-blog/my-blog-manager/.venv/bin/uvicorn cms_core.main:app --host 127.0.0.1 --port 8000
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
| `xhblogs-manager-web` | 控制台前端 | `0.0.0.0:3001` |
| `xhblogs-manager-api` | 内容引擎（FastAPI） | `127.0.0.1:8000`，只允许本机访问 |

### 4. 构建与启动

```bash
cd /opt/xinghui-blog/XHBlogs && npm run build
cd /opt/xinghui-blog/my-blog-manager && npm run build

systemctl daemon-reload
systemctl enable --now xhblogs xhblogs-manager-web xhblogs-manager-api
```

控制台前端使用 `output: 'standalone'` 构建，运行时还需要把静态资源拷进产物目录，并写入内容引擎端口：

```bash
cd /opt/xinghui-blog/my-blog-manager
mkdir -p .next/standalone/.next/static .next/standalone/public
cp -a .next/static/. .next/standalone/.next/static/
printf '%s\n' '{"api_port": 8000}' > .next/standalone/public/backend_config.json
```

> **每次改过控制台代码，都要重新执行上面这段「构建与启动」**，因为 `next start` 跑的是预构建产物，源码改动不会自动生效。

### 5. 公网访问与域名

云服务器的安全组需要放行对应端口（阿里云 / 腾讯云在控制台的「安全组规则」里添加）：

| 端口 | 用途 | 建议来源 |
| --- | --- | --- |
| 22 | SSH | 你的办公 IP |
| 8080 | 公开站 | 全网 |
| 3001 | 控制台 | **只放行你自己的公网 IP** |

给公开站绑域名时，用 Nginx 反向代理到 8080 并配置证书即可：

```nginx
server {
    listen 80;
    server_name www.example.com;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
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
Environment=HOSTNAME=0.0.0.0
```

重启后访问控制台会先跳转到 `/login` 页面，输入刚才设置的密码即可进入，会话有效期 7 天，Cookie 为 HttpOnly。控制台右上角还有一个退出登录按钮。

> **安全提醒**：用 IP + HTTP 访问时密码是明文传输的，务必在安全组里限制来源 IP；接入域名并配置 HTTPS 后，再把 `MANAGER_COOKIE_SECURE` 改成 `1`。

> **为什么远程访问不用改代码**：控制台前端原先直接请求 `http://127.0.0.1:<引擎端口>`，这只在本机有效，从别的电脑打开会去连访问者自己的 127.0.0.1。现在所有引擎调用统一走同源的 `/api/proxy`，由服务端转发到本机引擎，因此局域网和公网访问都能正常工作。

### 7. 本地开发（可选）

如果你仍然想在 Windows 上本地调试，可以双击 `my-blog-manager/Start.bat`。本地环境没有发布助手脚本，发布按钮只会把内容镜像到本地网站源码目录，构建与上线需要你自己执行。

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

## 二、更新设置并发布上线

为了保护数据安全，本控制台采用了**“操作暂存区”**机制。**请特别注意！！** 许多设置在修改后，必须主动执行“发布上线”才会真正写回并生效。需要执行此操作时，界面上方通常会有高亮提示。

**操作示例：修改个人简介**

![修改简介](picture/Pasted%20image%2020260427125314.png)

修改内容后，点击 **[暂存到操作队列]**：

![暂存队列](picture/Pasted%20image%2020260427125430.png)

此时上方工具箱会提示待办操作。你可以随时撤销（清空全部），然后点右上角操作箱里的 **[🚀 发布上线]**（或「设置 → 线上发布」里的同名按钮）。

> ⚠️ 注意：写回发生在发布过程的第一步；只要写回失败，发布会当场中止并说明原因，不会带着半套改动上线。

确认后系统会自动完成五件事：

1. **写回本地**：把暂存区里的每一项改动（相册 / 友链 / 项目 / 站点配置 / 说说 / 文章）写回内容引擎；
2. **镜像内容**：把控制台里的文章、说说、动态与站点配置覆盖到网站源码目录；
3. **提交仓库**：在服务器工作区提交这次改动并推送到裸仓库；
4. **重新构建**：执行 `npm run build` 生成新的预构建产物；
5. **重启服务**：重启 `xhblogs`，线上随即生效。

整个过程约 1-3 分钟。构建日志见 `/var/log/xhblogs-publish.log`。

> 如果你直接在服务器上改了源码，可以用 `sudo -u xhblogs sudo -n /usr/local/bin/xhblogs-async-rebuild` 只触发一次重建（跳过镜像与提交步骤）。

博客文章、说说（碎碎念）、杂谈等所有内容的发布与修改，均遵循此流程。

> **💡 黄金法则**：暂存队列 → 🚀 发布上线

### 发布历史与回退

「设置 → 线上发布」里的「4. 发布历史与回退」列出最近 20 步，每一步显示提交号、说明与时间；当前线上版本标注「当前线上」。点任意一步的 **「回退到这里」**，系统会把文章、说说、相册 / 友链 / 项目数据、关于页、站点配置、本地音乐与上传图片恢复到那一步的内容状态，重新提交、推送并构建，约 1-3 分钟生效。

回退是一次**新的提交**，历史不会因此断掉，可以继续往前回退；源码本身不受影响。回退日志同样写在 `/var/log/xhblogs-publish.log`。

### 线上状态面板

「设置 → 线上发布」会实时显示公开站当前的状态：服务是否在运行、最近一次构建的时间与构建号、源码仓库的最新提交、以及上一轮发布的结果。只要构建时间晚于发布时间，就说明改动**已经生效**在公开站上了。

> **为什么以前"同步 Blog"了线上却没变**：公开站是 `next start` 运行预构建产物，`siteConfig.ts` 这类源码改动必须重新 `build` + 重启服务才会反映到线上。现在「发布上线」把这一步也包进去了，不需要再手动跑构建。

---

## 三、图片上传（本地图片仓库）

控制台不再依赖任何第三方图床。图片直接从你的电脑上传，落进控制台自带的**本地图片仓库**（`my-blog-manager/data/uploads/`），站点内统一以 `/uploads/<文件名>` 引用。

**上传流程：**

1. 打开控制台「照片墙 → 相册 → 添加碎片」，或「设置 → 视觉背景配置」里的壁纸上传区，也可以是写文章时的图片工作台。
2. 点 **[上传]** 或直接把图片拖进虚线框，图片会从本机传到内容引擎并落盘。
3. 落盘成功后，控制台直接用 `/uploads/<文件名>` 预览，粘贴外链的方式同样保留。
4. 点「加入暂存」→「🚀 发布上线」，`sync.py` 会把 `data/uploads/` 镜像到公开站的 `public/uploads/`，公开站随即用同一个地址引用这些照片。

> 本地图片仓库里的图片是二进制文件，已加入 `.gitignore`，不会进仓库、不会随发布推送到远端。
> 如果你的照片不可再生，记得定期备份 `my-blog-manager/data/uploads/` 这个目录。

---

## 四、AI 猫猫助理设置

博客系统内置了一只聪明的 AI 猫猫助理（默认接入 **DeepSeek**，走 OpenAI 兼容协议）。模型、接口地址、性格提示词都能在控制台里改，理论上换成任何兼容服务都行。

首先，你需要申请一个 DeepSeek 的 API Key（申请教程网络资源丰富，在此不赘述）。拿到 API Key 后，在控制台进行如下配置：

![猫猫设置](picture/Pasted%20image%2020260427134211.png)

控制台「设置 → AI 煤球配置 🐾」里可调：模型 ID（默认 `deepseek-flash`，即 DeepSeek-V4.1-Flash）、接口地址（默认 `https://api.deepseek.com`）、性格 Prompt、生成预算、发散度和思考强度。

在本地设定好猫猫的专属系统提示词（性格）后，我们需要让线上环境也拥有调用 AI 的能力。在服务器上把密钥写进环境变量文件：

```bash
echo 'DEEPSEEK_API_KEY=你的真实 API 密钥' >> /etc/xhblogs.env
chmod 600 /etc/xhblogs.env
systemctl restart xhblogs
```

`/etc/systemd/system/xhblogs.service` 里已经声明了 `EnvironmentFile=-/etc/xhblogs.env`，因此公开站会读到这份密钥。控制台自己调用 AI 时，把同一份变量加进 `/etc/xhblogs-manager.env` 并重启 `xhblogs-manager-web` 即可。

> **每日一句也由引擎调用 AI**，所以 `/etc/xhblogs-manager.env` 里同样要放这份密钥，并且 `xhblogs-manager-api.service` 需要声明 `EnvironmentFile=-/etc/xhblogs-manager.env`。

本地桌面版把密钥写进各应用的 `.env.local`（已被 `.gitignore` 忽略，不会进仓库）。

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
- **数据位置**：设置在 `my-blog-manager/data/dailyQuoteConfig.json`，内容在 `my-blog-manager/data/dailyQuote.json`，两者都不入库。

> 定时生成由内容引擎常驻执行，**控制台网页可以关着**，但 `xhblogs-manager-api` 必须保持运行。访客打开首页时如果今天还没生成，引擎在后台悄悄写，页面不等人。

---

## 六、评论系统配置

评论系统是**自建**的：留言存在服务器本机的 SQLite 数据库里（`my-blog-manager/data/comments.db`），前台读写走内容引擎，控制台可以直接审核、回复、隐藏、删除。**不需要 GitHub 仓库，也不需要 OAuth 授权。**

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

评论数据只存在服务器磁盘上，**不会进 Git**（`.gitignore` 已排除 `data/comments.db`）。备份时把 `my-blog-manager/data/comments.db` 一起拷走即可；换服务器或重建服务后，把这个文件放回原位，留言就回来了。

---

## 七、本地音乐挂件设置

想给博客配上 BGM 吗？音频直接传到控制台，由控制台统一托管，发布时同步到博客。

进入控制台 → **音乐播放设置**：

1. 把音频文件拖进上传框，或点击选择文件。支持 `mp3 / m4a / aac / ogg / wav / flac / weba`，单个不超过 100MB。
2. 填上歌曲名（不填就用文件名），歌手可选。封面图片和 `.lrc` 歌词同样可选。
3. 点 **上传并加入歌单**，曲目会立刻出现在下方列表里，可以就地试听、换封面、补歌词或删除。

上传完成后去 **线上发布** 点一次发布，控制台会把 `my-blog-manager/music/` 增量同步到博客的 `XHBlogs/public/audio/`，公开站的播放器直接读这份本地歌单。

几个需要知道的细节：

- **音频本体不进 Git**。仓库里只跟踪 `playlist.json` 这份元数据，音频文件留在服务器磁盘上——公开的备份仓库不适合塞版权音乐，仓库体积也不会被撑爆。同步走的是增量比对，只传新增和变更的文件。
- **Next.js 会在启动时快照 `public/` 目录**，所以新上传的音频需要发布（重建 + 重启）之后才会对外可见。
- 控制台里可以试听，但试听走的是引擎的接口；网站上的播放走的是 `public/audio/` 下的静态文件，发布之后两边的歌单才会一致。

---

## 写在最后

XHBlogs 还有诸多隐藏的细节功能，期待极客朋友们在实际使用中慢慢探索。本项目旨在提供一套开箱即用的前端展示与后台管理方案。如果你是资深开发者，觉得控制台操作仍有优化空间，完全可以基于 Next.js 源码进行二次开发，甚至手搓 Markdown 进行部署！

**如果你觉得这个项目对你有帮助，请务必在 GitHub 上为我点亮一颗 ⭐ Star！每一颗星都是博主持续维护更新的最大动力。谢谢大家！**

## 许可证

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)

> 本项目采用 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) 许可协议。允许免费学习、分享和二次修改后发布（二次开源发布需提及原作者），但**严禁用于任何商业用途**。
