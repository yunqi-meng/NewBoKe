# 🌟 欢迎使用 XHBlogs！

这是一个采用 Next.js 构建的高颜值、毛玻璃（Glassmorphism）风格个人博客系统。本项目自带完善的前端展示与独立的后台控制台，支持 Markdown 沉浸式写作、草稿管理以及便捷的图床配置。

**当前推荐的部署形态：把公开站与控制台一起部署在你自己的 Linux 服务器上**（systemd 托管公开站、控制台前端与内容引擎，Git 管理每一版源码）。控制台里改完内容，点一次「发布上线」就会自动提交源码、重新构建并重启公开站，改动直接出现在线上。

本指南将带你完成服务器部署，并说明控制台的日常使用。

---
## 语言

[![English](https://img.shields.io/badge/Language-English-blue.svg)](README_en.md)
[![中文](https://img.shields.io/badge/语言-中文-red.svg)](README.md)

## 写在前面

### 当前版本：0.4.2（2026-10-28）

**评论系统整体重建，旧的 Gitalk 方案已彻底下线。** 以前评论存在 GitHub Issues 里，控制台既看不到也管不了；现在留言存在服务器本机的 SQLite 数据库中，站长可以在后台完成全部操作。

- **自建评论系统**：文章与说说页面都可以留言、回复、点赞。访客身份用浏览器本地生成的访客标识识别，用于限流（10 分钟 5 条、1 小时 20 条）与后台溯源，不采集真实身份。
- **评论管理台**：控制台新增 **💬 评论管理** 页面，全站每一条评论的昵称、邮箱、IP、点赞数、回复数、时间与来源页面一目了然；支持按状态 / 页面 / 关键词筛选，逐条或批量通过、隐藏、标记垃圾、删除。
- **站长回复**：可以直接以站长身份回复任意一条评论，前台带「站长」标识展示。
- **即时生效**：评论参数（总开关、审核开关、匿名开关、点赞开关、标题、占位符、提示语、最大字数）存在引擎里，保存后前台立刻改变，**不需要重新发布站点**。
- **灵境与等级系统下线**：灵境页面及其关联的创意工坊、帝江号舰船与 RPG 等级系统已从站点与控制台完整移除。

> 升级前请留意：旧的 GitHub 评论仓库可以自行归档删除，控制台的 GitHub OAuth 凭据已不再需要。

### 0.4.1 更新（2026-10-23）

保留 0.4.0 的每日选刊控制台与 Agent 接入，整合两个社区 PR 的有效贡献，并修正兼容性问题。

- **壁纸分组（PR #25）**：创建、重命名、删除、切换分组与管理组内图片。修复空组意外回退旧壁纸、特殊字符读取被改写，以及旧配置缺少新字段时的保存问题。
- **编辑器改进（PR #15）**：GFM 表格支持、代码块加载与保存。保留普通正文转义与删除线，以及代码语言、缩进、空行和字面字符；完善代码围栏内标题的目录识别。
- 两项功能与 0.4.0 共存，原作者提交历史保留，维护者兼容性修复单独记录。

感谢 [PR #25 原作者 Kai](https://github.com/heiehiehi/XinghuisamaBlogs/pull/25) 和 [PR #15 原作者 ILoveFurina](https://github.com/heiehiehi/XinghuisamaBlogs/pull/15) 的贡献（名称按原 Git 提交署名）。

### 0.4.0 更新（2026-10-23）

本次新增可选的每日选刊管理，入口为 **设置 → 每日选刊**，沿用原控制台侧栏。默认关闭展示和 Agent 接收，新安装不预设专业领域，也不携带作者的个人期刊。

- 展示开关、板块文字、封面、轮播与历史范围可以配置，关闭展示保留内容。
- 自定义兴趣、排除词、来源、语言、栏目与条目数；支持任意领域。
- 新建或编辑草稿、逐条整理、阅读预览、上传封面，核对后发布到本地网站。
- 本机 Agent 使用独立授权，支持读取偏好、历史、提交与回执；不覆盖人工草稿或已发布日期。
- 提供首次使用引导、JSON 连接文件四步说明、客户端下载和可复制的 Codex 指令。
- 选刊服务随控制台启动，使用实际端口与「线上发布」中的网站路径；切换网站时私有数据隔离。

### 快速使用每日选刊

1. 启动控制台（服务器上访问 `http://服务器IP:3001`，本地则是双击 `my-blog-manager/Start.bat`）；先在「设置 → 线上发布」里确认网站源码目录，标准目录结构会默认使用同级的 `XHBlogs`。
2. 在设置侧栏打开每日选刊，设置展示、兴趣与栏目，点击“保存本地设置”。
3. 在“内容与审核”建立草稿，编辑内容和来源、选择封面，再阅读预览。默认新安装没有示例期刊。
4. 核对内容、日期与原始来源后勾选确认，发布到网站目录；随后点击控制台右上角的 **🚀 发布上线**，选刊内容就会随网站一起构建生效。

### Agent 授权 JSON 怎么用

1. 在“Agent 与更新”建立独立授权，将连接 JSON 保存在博客源码之外。
2. 开启接收，选择“存为草稿，由我审核”，保存本地设置。
3. 点击“JSON 怎么用？”，填写文件完整路径，复制首次连接指令交给 Codex；连接文件由客户端读取，无需导入 Codex 设置，也无需粘贴授权全文。
4. 首次连接只读配置和历史。刷新记录确认访问，再复制整理一期指令；实际提交以回执和待审核列表为准。

电脑、服务器上的控制台和生成内容的 Agent 需要运行，控制台网页可以关闭。期望更新时间不会自动创建定时任务；DSH 本版暂未接入。字段和日期校验不能替代事实核查。

### 更新时会保留什么

更新器保留文章、个人 `siteConfig.ts`、已有选刊数据和配置、已有公开图片及控制端私有授权/草稿。首次升级会补齐缺失的选刊模块初始文件。替换的程序文件保存在 `.update-backups/`，有本地未保存程序修改时停止并提示处理。

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
Environment=XHS_BRIEFING_API_PORT=8000
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
Environment=XHS_BRIEFING_API_PORT=8000
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

为了保护数据安全，本控制台采用了**“操作暂存区”**机制。**请特别注意！！** 许多设置在修改后，必须主动执行“更新本地”才能真正保存。需要执行此操作时，界面上方通常会有高亮提示。

**操作示例：修改个人简介**

![修改简介](picture/Pasted%20image%2020260427125314.png)

修改内容后，点击 **[暂存到操作队列]**：

![暂存队列](picture/Pasted%20image%2020260427125430.png)

此时上方工具箱会提示待办操作。你可以随时撤销（清空全部），或者点击 **[📥 更新本地]**。

> ⚠️ 注意：点击“更新本地”后，数据仅仅保存在了你的控制台环境中。

接下来点击右上角操作箱里的 **[🚀 发布上线]**（或「设置 → 线上发布」里的同名按钮），确认后系统会自动完成四件事：

1. **镜像内容**：把控制台里的文章、说说、动态与站点配置覆盖到网站源码目录；
2. **提交仓库**：在服务器工作区提交这次改动并推送到裸仓库；
3. **重新构建**：执行 `npm run build` 生成新的预构建产物；
4. **重启服务**：重启 `xhblogs`，线上随即生效。

整个过程约 1-3 分钟。构建日志见 `/var/log/xhblogs-publish.log`。

> 如果你直接在服务器上改了源码，可以用 `sudo -u xhblogs sudo -n /usr/local/bin/xhblogs-async-rebuild` 只触发一次重建（跳过镜像与提交步骤）。

博客文章、说说（碎碎念）、杂谈等所有内容的发布与修改，均遵循此流程。

> **💡 黄金法则**：暂存队列 → 更新本地 → 发布上线

### 线上状态面板

「设置 → 线上发布」会实时显示公开站当前的状态：服务是否在运行、最近一次构建的时间与构建号、源码仓库的最新提交、以及上一轮发布的结果。只要构建时间晚于发布时间，就说明改动**已经生效**在公开站上了。

> **为什么以前"同步 Blog"了线上却没变**：公开站是 `next start` 运行预构建产物，`siteConfig.ts` 这类源码改动必须重新 `build` + 重启服务才会反映到线上。现在「发布上线」把这一步也包进去了，不需要再手动跑构建。

---

## 三、图床配置

为了优化写作体验，控制台深度整合了图床上传功能。本指南推荐使用“去不图床”（[https://7bu.top](https://7bu.top)）。
如果你习惯使用纯外链，工具台也完美支持直接插入图片 URL。如果想接入其他支持标准 API 的图床，也欢迎极客们自行尝试。

**配置流程：**

![图床配置](picture/Pasted%20image%2020260427124930.png)

填入对应的 API Token 等信息后，你可以点击 **[发送探针测试Token]**，实时检验图床接口是否畅通。

> 图床凭证只保存在控制台本机的 `my-blog-manager/data/picbed.json` 里（这个文件已加入
> `.gitignore`，不会进仓库、不会随发布推到远端）。`siteConfig.ts` 里只留空占位，
> 发布到公开站时同样会被剔除，公开站因此完全拿不到你的 Token。
> 如果你的旧版本把 Token 存进了 `siteConfig.ts`，升级后在控制台里重新保存一次图床配置，
> 就会自动搬到新文件并把旧值擦掉。

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

本地桌面版把密钥写进各应用的 `.env.local`（已被 `.gitignore` 忽略，不会进仓库）。

> **密钥不要写进代码、文档或仓库**，只放在服务器上权限为 600 的环境变量文件里。

> 推理模型会把生成预算花在"思考"上，预算调太小就只会想、不会说，所以默认值给到 512；想更快就调低"思考强度"。

---

## 五、评论系统配置

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

## 六、本地音乐挂件设置

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
