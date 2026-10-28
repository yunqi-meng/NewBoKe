# 🌟 欢迎使用 XHBlogs！

这是一个采用 Next.js 构建的高颜值、毛玻璃（Glassmorphism）风格个人博客系统。本项目自带完善的前端展示与独立的后台控制台，支持 Markdown 沉浸式写作、草稿管理以及便捷的图床配置。

**当前推荐的部署形态：把公开站与控制台一起部署在你自己的 Linux 服务器上**（systemd 托管公开站、控制台前端与内容引擎，Git 管理每一版源码）。控制台里改完内容，点一次「发布上线」就会自动提交源码、重新构建并重启公开站，改动直接出现在线上。

本指南将带你完成服务器部署，并说明控制台的日常使用。

---
## 语言

[![English](https://img.shields.io/badge/Language-English-blue.svg)](README_en.md)
[![中文](https://img.shields.io/badge/语言-中文-red.svg)](README.md)

## 写在前面

### 当前版本：0.4.1（2026-10-23）

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

#### 3. 新增灵境与等级系统

> 类创意工坊功能，等级系统可在 设置->个人名片设置 中关闭

#### 4. 网易云音乐显示bug，已修复

> 已更换API，修复网易云音乐显示bug。更新即可

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

博客系统内置了一只聪明的 AI 猫猫助理（默认接入 Gemini 模型）。极客玩家也可以通过修改源码接入其他大语言模型。

首先，你需要申请一个 Gemini 的 API Key（申请教程网络资源丰富，在此不赘述）。拿到 API Key 后，在控制台进行如下配置：

![猫猫设置](picture/Pasted%20image%2020260427134211.png)

在本地设定好猫猫的专属系统提示词（性格）后，我们需要让线上环境也拥有调用 AI 的能力。在服务器上把密钥写进环境变量文件：

```bash
echo 'GEMINI_API_KEY=你的真实 API 密钥' >> /etc/xhblogs.env
chmod 600 /etc/xhblogs.env
systemctl restart xhblogs
```

`/etc/systemd/system/xhblogs.service` 里已经声明了 `EnvironmentFile=-/etc/xhblogs.env`，因此公开站会读到这份密钥。控制台自己调用 AI 时，把同一份变量加进 `/etc/xhblogs-manager.env` 并重启 `xhblogs-manager-api` 即可。

> **密钥不要写进代码、文档或仓库**，只放在服务器上权限为 600 的环境变量文件里。

---

## 五、评论系统配置

本博客的评论系统基于 GitHub Issues（Gitalk 等类似方案）。你需要在 GitHub 创建一个 **Public（公开）** 仓库来专门存储网友的留言。

在控制台评论设置中，填入你的 GitHub 用户名以及这个公开仓库的名称：

![评论设置](picture/a3b44842-696b-4764-9cdf-882cd8792729.png)

**接下来，配置 OAuth 授权以允许访客登录留言：**

1. 登录 GitHub，点击右上角个人头像，进入 **Settings**（设置）。
2. 滑动到左侧菜单栏最底部，点击 **Developer settings**。
3. 在左侧选择 **OAuth Apps**，点击右上角的 **New OAuth App**。

**关键应用信息填写指南：**


| 字段名称                       | 填写建议                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| **Application name**           | 自定义名称，例如：`My-Blog-Comments`                                               |
| **Homepage URL**               | 你的博客**首页完整地址** (例如 `https://www.example.com`)                          |
| **Application description**    | 可选填                                                                             |
| **Authorization callback URL** | **核心参数**：必须填写你的博客域名。如果经常本地调试，可填 `http://localhost:3000` |

**提取核心密钥：**

1. 提交注册（Register application）。
2. 在跳转页面即可看到 **Client ID**，这是所需的第一项数据。
3. 点击下方的 **Generate a new client secret** 生成密钥。
4. **🚨 立刻将这串密钥复制并妥善保存！** 出于安全机制，离开此页面后该密钥将永远隐藏。

将这组 `Client ID` 和 `Client Secret` 准确填入控制台的对应栏目中，保存即可激活评论功能。

---

## 六、网易云音乐挂件设置

![歌单设置](picture/Pasted%20image%2020260427141049.png)

想给博客配上 BGM 吗？
通过电脑浏览器打开 **网易云音乐网页版**。搜索并进入你喜欢的歌曲详情页，观察浏览器地址栏，URL 中的数字即为歌曲的专属 ID：

![网易云ID](picture/Pasted%20image%2020260427141235.png)

将这串 ID 复制并粘贴到控制台的搜索框中，即可一键将该歌曲收录进你的博客歌单库！

![添加歌曲](picture/Pasted%20image%2020260427141356.png)

---

## 写在最后

XHBlogs 还有诸多隐藏的细节功能，期待极客朋友们在实际使用中慢慢探索。本项目旨在提供一套开箱即用的前端展示与后台管理方案。如果你是资深开发者，觉得控制台操作仍有优化空间，完全可以基于 Next.js 源码进行二次开发，甚至手搓 Markdown 进行部署！

**如果你觉得这个项目对你有帮助，请务必在 GitHub 上为我点亮一颗 ⭐ Star！每一颗星都是博主持续维护更新的最大动力。谢谢大家！**

## 许可证

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)

> 本项目采用 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) 许可协议。允许免费学习、分享和二次修改后发布（二次开源发布需提及原作者），但**严禁用于任何商业用途**。
