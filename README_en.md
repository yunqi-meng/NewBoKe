# Version 0.4.9 - Measured End to End

**Measured on the server: the front end changes half a second after you click publish.**

- **The console no longer promises a 1-3 minute wait**: the copy under the publish button and the
  "构建中" state label now read "同步中", with a note that only code changes trigger a rebuild.
  The rollback copy stays as it is, because the rollback helper really does still rebuild the site.
- **Numbers from the server**: saving a moment and clicking 发布上线 made the public site show it
  **509 ms** later (626 ms counting from the save). No `next build` ran - the build id and the
  artifact timestamp stayed untouched. The same flow took about 39 seconds before.
- **"已同步到线上" stays accurate**: a content-only publish produces no new build id, so the
  effective timestamp in the status file is what proves it actually went live.
- **The publish chain is now reproducible**: two end-to-end scripts run the full "save → publish →
  poll the public site → print the status" timing on the server and clean up the test content
  afterwards. The session cookie is minted on the fly from the server's own secret, never written
  to disk and never printed.

---

# Version 0.4.8 - The Public Site Now Renders Live

**Click "发布上线" and the front end changes immediately.**

- **The public site is no longer prerendered**: every route renders per request, so articles, moments,
  the photo wall, friend links, projects, the about page and the site config are all read from disk on
  each hit. The HTML used to be frozen at build time (`x-nextjs-prerender: 1` in the response headers),
  which is why content only changed after a full rebuild.
- **Publishing no longer waits for that ~35 second build**: the server-side publish helper now computes
  the changed file list and skips `next build` plus the service restart when only content changed,
  reporting the publish as already live. The public site is rebuilt only when code changed (pages,
  components, build config), and the console is rebuilt on demand as well.
- **The site config is live too**: changing the title, nickname, navigation, avatar, wallpaper, danmaku
  list or ICP number in `siteConfig.ts` takes effect on refresh - even the browser tab title, which now
  comes from `generateMetadata`.
- **Albums, friend links and projects are read at runtime**: the console-generated `data/*.ts` files are
  no longer bundled into the build. The parser follows the engine's rules (including stripping
  TypeScript-style trailing commas), so they can't end up missing from the public site.
- **The console no longer misreports "已同步到线上"**: the publish status now carries an effective
  timestamp, so a content-only publish is correctly recognised as live even though it produced no new
  build id.
- **Hardening along the way**: a new `.gitattributes` keeps the server-side publish scripts at LF line
  endings, so editing them on Windows can no longer break them on the server.

---

# Version 0.4.7 - The Console Now Shows Live Content

**After publishing, a refresh in the console shows exactly what is live.**

- **The "site changed, console didn't" bug is fixed**: the console used to render build-time snapshots of
  articles, moments, albums, friend links, projects, the about page and the site config, while publishing
  only rebuilt the public site. The console now reads the working copy on every request, so the two always
  agree.
- **Content is read live**: articles, moments, the photo wall, friend links and the project grid you edit
  in the console show up immediately. Changing the nickname, navigation title or avatar in
  `siteConfig.ts` no longer needs a console rebuild either - just refresh.
- **The engine can read the console's data files**: the new `cms_core/tsdata.py` parses the TypeScript data
  files the console generates and strips TypeScript-style trailing commas, so friend links and projects
  no longer come back empty.
- **One place for config and port resolution**: site config loading and engine port detection are now
  centralised (`lib/siteConfigRuntime.ts`, `lib/enginePort.ts`). If the engine is briefly unreachable the
  console falls back gracefully instead of going blank.
- **Publishes no longer trip over each other**: a second click on "发布上线" while the first one is still
  running is rejected with a clear notice, and the server-side publish helper serialises itself with a
  file lock, so two builds never write the same directory at once.
- **Two long-standing re-render traps fixed along the way**: the toast callback is now a stable reference
  (it used to re-trigger every `useEffect` that depended on it), and the operation queue gained the
  missing publish / friend / project sync operation types.

---

# Version 0.4.6 - One Button To Publish, And A Way Back

**Publishing is now a single button, and every step can be undone.**

- **No more "update local" step**: you used to press "📥 更新本地" to write your edits back, then
  "🚀 发布上线". Both the inbox and the publish panel now carry a single "🚀 发布上线" button. One click
  writes the pending edits back, mirrors the content, commits the source repository, rebuilds the public
  site and restarts the service.
- **The blog follows along**: about 1-3 minutes later, articles, moments, the photo wall, friend links,
  the project grid, the about page and the site config are all live.
- **Half-finished changes never ship**: if any write-back step fails, the publish stops right there and
  tells you why.
- **Step back whenever you want**: the "4. 发布历史与回退" card in **Settings → 发布上线** lists the last
  20 steps (commit id, subject, time). The version currently live is marked "当前线上"; any earlier step can
  be restored with "回退到这里", which puts the content back to that state and rebuilds the site.
- **History survives**: a rollback is a new commit, not a rewrite, so you can keep stepping backwards.
- **Content only**: articles, moments, album / friend / project data, the about page, site config, local
  music and uploaded images return to that step; the source code itself is untouched, and rollbacks are
  pushed to the server repository and the GitHub backup as well.

---

# Version 0.4.5 - Daily Quote Replaces the Daily Briefing

**The Daily Briefing feature is gone; a daily AI-generated line of encouragement takes its place.**

- **The briefing is removed**: the console panel, the Agent integration, the draft review flow, the
  covers, the carousel and the archive are all deleted together with their code and data. The console
  sidebar no longer has a "Daily Briefing" entry.
- **One line a day**: on a fixed time each day the AI you already connected (煤球 by default) says a
  short encouraging sentence, shown under the homepage content grid in the same glassmorphism style as
  the rest of the site.
- **Manageable in the console**: **Settings → 每日一句 ☀️** lets you toggle the homepage block, toggle
  the daily generation, pick the generation time (Beijing time), rename the block and its subtitle,
  change the signature, cap the sentence length, rewrite the prompt sent to the model, and browse the
  archive.
- **Write it yourself**: if today's line is not what you want, type your own and it replaces the
  automatic one for today; tomorrow the AI speaks again.
- **No code change to switch models**: the model, endpoint and personality come straight from
  "AI Cat Config". The key still lives only in the server environment file, never in the repository.
- **Nobody waits**: when a visitor arrives before today's line exists, the engine writes it in the
  background and the page stays fast. Only "换一句" in the console waits for the model.

# Version 0.4.4 - Local Image Upload, Photo Wall Fix

**Image hosting is gone; pictures are uploaded straight from your own machine, and the photo wall can
finally delete a photo.**

- **No image host anymore**: the whole "Gallery Config" panel is removed from the console settings,
  together with the token probe, credential storage and the image-hosting endpoints. The article
  editor, the wallpaper drop zone and moment pictures now upload to your own console.
- **Your pictures stay yours**: files land in the console's local image repository
  (`my-blog-manager/data/uploads/`) and every site references them as `/uploads/<file name>`. A publish
  mirrors the folder into the public site's `public/uploads/`, so both sides use the same address.
- **Photo wall deletion fixed**: the wall used to render a snapshot baked into the client bundle, so a
  deleted photo came back after a reload. It now reads the albums from the content engine at runtime
  and every add/edit/delete takes effect immediately.

---

# Version 0.4.3 - AI Cat on DeepSeek

**The AI cat now runs on DeepSeek through the OpenAI-compatible protocol.** The old Gemini setup could never work on this server: the machine cannot reach `generativelanguage.googleapis.com` and no key was ever configured, so the cat could only fall back to canned lines. Now it actually answers.

- **New model**: `deepseek-flash` by default, i.e. **DeepSeek-V4.1-Flash**, with a selectable reasoning effort (low / high / max).
- **Pluggable endpoint**: **Settings → AI Cat Config 🐾** gained an **endpoint URL** field and a **reasoning effort** switch; model id, personality prompt, generation budget and temperature remain editable, so any OpenAI-compatible provider can be used.
- **Secrets stay in environment files**: no key is stored in the repository, code or documentation. Put it in `/etc/xhblogs.env` and `/etc/xhblogs-manager.env` on the server (mode 600), or in each app's `.env.local` for the local desktop edition.
- **Runtime switched from edge to nodejs**: the key is only written into the environment file at runtime, and edge handles environment variables at build time. The node runtime reads the live process environment, so **adding or rotating a key only needs a service restart — no rebuild**.

> Before upgrading: until the key is configured the cat can only answer with fallback lines; and do not set the generation budget too low, because reasoning models spend that budget on "thinking" and may end up with no answer at all.

---

# Version 0.4.2 - Self-Hosted Comment System

**The comment system has been rebuilt from scratch; the old Gitalk setup is gone.** Comments used to live in GitHub Issues, where the owner could neither see nor moderate them. They now live in a local SQLite database on the server, and every moderation action happens in the console.

- **Self-hosted comments**: visitors can post, reply and like on articles and moments. Identity comes from a browser-generated visitor token, used for rate limiting (5 per 10 minutes, 20 per hour) and admin traceability — no real-world identity is collected.
- **Comment management console**: a new **💬 评论管理** page lists every comment on the site with nickname, email, IP, likes, reply count, timestamp and source page; filter by status / page / keyword, then approve, hide, mark as spam or delete — one by one or in bulk.
- **Owner replies**: reply to any comment as the site owner; the reply appears publicly with an "站长" (admin) badge.
- **Instant effect**: comment options (master switch, approval, anonymous, likes, title, placeholder, notice, max length) live in the engine, so saving changes the public site right away — **no publish required**.
- **Removed**: the Spirit Realm (灵境) page, the creative workshop and battleship it hosted, and the RPG level/badge system are fully gone from both the site and the console.

> Before upgrading: you can archive the old GitHub comment repository, and the GitHub OAuth credentials are no longer needed.

---

# Version 0.4.1 - Wallpaper and Editor Improvements

Includes the 0.4.0 Daily Briefing (removed in 0.4.5) plus wallpaper groups (PR #25, original commit author Kai) and GFM table/code-block improvements (PR #15, original commit author ILoveFurina). Original commits and maintainer fixes are retained. Empty wallpaper groups, special-character configuration round trips, literal prose characters, strikethrough, code formatting and fenced-code table-of-contents handling have been corrected. See UpdateLog.md and the Chinese README for details.

# Version 0.4.0 - Daily Briefing Console

The optional Daily Briefing module is managed in Settings. New installations start with display and Agent reception disabled, empty content, and no fixed subject area. Configure interests and channels, edit drafts and covers, review sources, then publish to the selected local website directory.

The briefing service starts with the original CMS and uses its actual port. Agent credentials are independent and revocable. Use the in-console JSON guide and downloadable Python client for a read-only connection test, then draft submission. Existing drafts and published dates are protected. Scheduling and online Git deployment are separate; the computer, backend and generating Agent must be running. DSH is deferred.

The updater preserves personal configuration, posts, the daily quote content, images and private credentials/drafts; it backs up replaced program files and stops on unsaved program edits. Save and back up your content before upgrading. Node.js 20.9 or newer is required by the current Next.js version. See the Chinese README and UpdateLog.md for detailed instructions. Review PDFs are local-only.

---

# 🌟 Welcome to XHBlogs!

This is a personal blog system built with Next.js, featuring a Glassmorphism design. This project includes a frontend display and an independent backend console. It supports Markdown writing, draft management, and image hosting configuration.

**The recommended deployment now is to run the public site and the console on your own Linux server** (systemd supervises the public site, the console frontend and the content engine; Git keeps every revision). After editing in the console, one click on **Publish** commits the sources, rebuilds the site and restarts the public service, so your changes show up online.

This guide walks you through the server deployment and the day-to-day use of the console.

---

## Language

[![English](https://img.shields.io/badge/Language-English-blue.svg)](README_en.md)
[![中文](https://img.shields.io/badge/语言-中文-red.svg)](README.md)

## Preface

### Update Summary (Versions 0.2.1~0.2.3)

#### 1. Optimized Mobile Rendering Performance

> Adjusted mobile visual effects to reduce lag on mobile devices.

#### 2. Added Mobile Adaptation for All Pages

> Implemented mobile adaptation for Home, Talks, and Archive pages, and added a mobile navigation bar.

#### 3. Added Activity Feed

> Commit history is now visible.

#### 4. Editable Friend Link Descriptions

> You can now edit the copyable information in the console.

#### 5. Bug Fixes

> Fixed the crash issue with Start.bat and the inability to modify the title.

#### 6. Update Blog Source Code

> Implemented source code updating.

## I. Deploy to Your Own Server

### 1. Environment Configuration

Before starting, please ensure your computer has the following runtime environments installed; otherwise, the program will not start properly:

* **Node.js** (v18.x or above recommended)
* **Package Manager** (npm)
* **Git** (for pulling code and version control)
* **Python** (v3.10 or above recommended; tested under v3.10)
* *Optional: a place to store your own pictures (the console ships with a local image repository)*

### 2. Blog Source Code Update

To easily keep up with the latest features, please use the updater to update the source code!
By using the updater, you no longer need to manually compare code, worry about pull conflicts, or fear that your articles and configuration files will be overwritten.

🛠️ Update Steps:

Step 1: Obtain the lossless updater (only required for the first time)

#### 1. Download the update.bat and update.py files from the project's root directory.

#### 2. Move the downloaded update.bat and update.py to the outermost root directory of your local blog project (i.e., alongside the my-blog-manager and XHBlogs folders).

As shown below:


#### 3. Double-click the update.bat file to update. If it crashes, please run the update.py file using CMD.

### 3. Quick Start

#### ① Startup Script

Once you have completed the environment configuration above, the basic preparation is done.
First, enter the `my-blog-manager` folder (**⚠️ Note: Do not rename this folder under any circumstances, or environment path resolution will fail!**)

Double-click to run the startup script in the folder:
`Start.bat`
The script will automatically detect and install the required dependencies. Once the environment configuration is complete, the program will launch the backend console.

#### ② Deploy to Your Own Server

> **Note**: the deployment target is now your own Linux server, not Vercel or GitHub Pages. systemd supervises three services and Git tracks every revision.

**Layout**

```
/opt/xinghui-blog/            # Git working tree
├── XHBlogs/                  # public site sources
└── my-blog-manager/          # console sources
/srv/git/xinghui-blog.git     # bare repository holding every revision
```

Prepare the sources:

```bash
mkdir -p /opt/xinghui-blog && cd /opt/xinghui-blog
git clone /srv/git/xinghui-blog.git .

cd XHBlogs && npm ci
cd ../my-blog-manager && npm ci
```

> Two files in the console differ on every machine and are therefore not tracked by Git:
> `my-blog-manager/data/deploy_config.json` (blog source directory) and `my-blog-manager/public/backend_config.json` (content engine port).

> **Off-site backup**: the working tree also carries a `github` remote pointing at your own
> backup repository (this project uses `yunqi-meng/NewBoKe`). Every publish pushes the same
> commit there as well, so the live content is not only kept on the server but also archived
> on GitHub. The backup authenticates with a repository-scoped SSH deploy key; the private key
> stays in `/home/xhblogs/.ssh/` on the server and is never committed, scripted or documented.
> A failing backup is only recorded in `/var/log/xhblogs-publish.log` and never blocks a publish.

**Register the systemd services**

Public site `/etc/systemd/system/xhblogs.service`:

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

Console frontend `/etc/systemd/system/xhblogs-manager-web.service`:

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

Content engine `/etc/systemd/system/xhblogs-manager-api.service`:

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
# The daily quote calls the AI; the key lives only in this environment file (mode 600)
EnvironmentFile=-/etc/xhblogs-manager.env
ExecStart=/opt/xinghui-blog/my-blog-manager/.venv/bin/uvicorn cms_core.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

| Service | Role | Listens on |
| --- | --- | --- |
| `xhblogs` | public site, `next start` serving the prebuilt output | `0.0.0.0:8080` |
| `xhblogs-manager-web` | console frontend | `0.0.0.0:3001` |
| `xhblogs-manager-api` | content engine (FastAPI) | `127.0.0.1:8000`, local access only |

**Build and start**

```bash
cd /opt/xinghui-blog/XHBlogs && npm run build
cd /opt/xinghui-blog/my-blog-manager && npm run build

systemctl daemon-reload
systemctl enable --now xhblogs xhblogs-manager-web xhblogs-manager-api
```

The console frontend uses `output: 'standalone'`, so the static assets have to be copied into the standalone output and the engine port written next to them:

```bash
cd /opt/xinghui-blog/my-blog-manager
mkdir -p .next/standalone/.next/static .next/standalone/public
cp -a .next/static/. .next/standalone/.next/static/
printf '%s\n' '{"api_port": 8000}' > .next/standalone/public/backend_config.json
```

> **Rebuild the console after every console code change**: `next start` serves the prebuilt output, source edits do not show up on their own.

**Public access and domains**

Open the ports in the cloud provider's security group:

| Port | Purpose | Suggested source |
| --- | --- | --- |
| 22 | SSH | your office IP |
| 8080 | public site | everyone |
| 3001 | console | **your own public IP only** |

For a custom domain, let Nginx proxy to port 8080 and attach a certificate:

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

**Password login for the console**

Whenever the console is reachable from the internet you **must** enable the password login, otherwise anybody could rewrite your posts and settings. Prepare an environment file on the server:

```bash
cd /opt/xinghui-blog/my-blog-manager
node scripts/manager-passwd.mjs "your-admin-password" --env-file /etc/xhblogs-manager.env
node scripts/manager-passwd.mjs --secret --env-file /etc/xhblogs-manager.env
```

The first command stores the scrypt hash of the password, the second generates a random session secret. Both stay on the server (`chmod 600`); no credential is ever written to the repository. Then let the service read the file:

```ini
# [Service] section of /etc/systemd/system/xhblogs-manager-web.service
EnvironmentFile=-/etc/xhblogs-manager.env
Environment=HOSTNAME=0.0.0.0
```

After the restart the console redirects to `/login`; the session lasts 7 days and the cookie is HttpOnly. There is also a log-out button in the top right corner.

> **Security note**: over plain HTTP the password travels unencrypted, so restrict the source IP in the security group. Once you serve HTTPS, set `MANAGER_COOKIE_SECURE=1`.

> **Why remote access needs no code change**: the console used to call `http://127.0.0.1:<engine port>` straight from the browser, which only works on the machine running the engine. Every engine call now goes through the same-origin `/api/proxy`, which forwards to the local engine, so LAN and public access both work.

**Local development (optional)**

You can still double-click `my-blog-manager/Start.bat` to debug on Windows. The local machine has no publish helper, so publishing only mirrors the content into the blog source directory and you build and deploy it yourself.

**Working together with the server**

Publishing from the console on the server creates commits in `/opt/xinghui-blog`, and the development
machine pushes code to the same branch. Two writers on one branch collide easily, so keep to this:

| Who | What to do |
| --- | --- |
| Development machine | Run `git pull --rebase aliyun main` before committing (this picks up the server's publish commits), then `git push aliyun main` |
| Server | The publish helper fetches and merges `origin/main` before committing, so a publish is never rejected for being behind |

> Push the sources through the `xhblogs-git` SSH host alias, which writes to the bare repository as
> the `xhblogs` user. Pushing as root leaves root-owned objects in the bare repository, and the
> server's own publish push is then rejected for lack of permissions. Nothing has to be changed in
> the console itself.

---

## II. Update Settings and Publish

To protect data safety, this console uses an **"Operation Staging Area"** mechanism. **Please pay special attention!** Many settings must be actively published after modification to be truly written back and live. When this operation is required, there is usually a highlighted prompt at the top of the interface.

**Operation Example: Modifying Personal Profile**

![修改简介](picture/Pasted%20image%2020260427125314.png)

After modifying the content, click **[Stage to Operation Queue]**:

![暂存队列](picture/Pasted%20image%2020260427125430.png)

At this point, the top toolbox will prompt pending operations. You can undo at any time (clear all), then click **[🚀 Publish]** in the operation box at the top right (or the same button under **Settings → Publish**).

> ⚠️ Note: the write-back happens as the first step of the publish. If it fails, the publish stops right there and tells you why — a half-written set of changes never ships.

After you confirm, the system does five things on its own:

1. **Write back to local** — every staged change (albums / friend links / projects / site config / moments / articles) is written back into the content engine;
2. **Mirror the content** — posts, moments, talks and the site configuration are copied over the blog source directory;
3. **Commit the repository** — the change is committed in the server working tree and pushed to the bare repository;
4. **Rebuild** — `npm run build` produces a fresh prebuilt output;
5. **Restart the service** — `xhblogs` restarts and the change goes live.

The whole cycle takes roughly 1-3 minutes. Build logs land in `/var/log/xhblogs-publish.log`.

The publishing and modification of all content, such as blog posts, moments, and talks, follow this process.

> **💡 Golden Rule**: Staging Queue -> 🚀 Publish

### Publish history and rollback

The "4. 发布历史与回退" card under **Settings → Publish** lists the last 20 steps with commit id, subject and time; the version currently live is marked "当前线上". Clicking **"回退到这里"** on any step restores articles, moments, album / friend / project data, the about page, site config, local music and uploaded images to the content state of that step, then commits, pushes and rebuilds — about 1-3 minutes.

A rollback is a **new commit**, so the history is never broken and you can keep stepping backwards; the source code itself is untouched. Rollback logs land in `/var/log/xhblogs-publish.log` as well.

### Online status panel

**Settings → Publish** shows the live state of the public site in real time: whether the service is running, the time and build id of the last build, the newest commit in the source repository and the outcome of the previous publish. As soon as the build time is newer than the publish time, your change is **live**.

> **Why "Sync Blog" used to change nothing online**: the public site is `next start` serving a prebuilt output, so edits to files such as `siteConfig.ts` only reach the site after a `build` and a service restart. "Publish" now performs that step as well.

---

## III. Image Upload (Local Image Repository)

The console no longer relies on any third-party image host. Pictures are uploaded straight from your
own computer into the console's built-in **local image repository** (`my-blog-manager/data/uploads/`),
and every site references them with the same in-site address: `/uploads/<file name>`.

**Upload flow:**

1. Open the console: "Photo Wall -> album -> add fragment", or the wallpaper drop zone in
   "Settings -> Visual Background", or the image workbench inside the article editor.
2. Press **[Upload]** or simply drop the picture into the dashed box. The file travels from your
   machine to the content engine and is written to disk.
3. Once stored, the console previews it directly through `/uploads/<file name>`; pasting an external
   image URL still works exactly as before.
4. Press "Add to queue" -> "🚀 Publish": the publish writes `data/albums.ts` and then `sync.py`
   mirrors `data/uploads/` into the public site's `public/uploads/`, so the public site serves the
   very same addresses.

> Images inside the local repository are binary files and are listed in `.gitignore`: they never enter
> the repository and are never pushed to a remote by a publish. If your photos cannot be recreated,
> back up the `my-blog-manager/data/uploads/` directory from time to time.

---

## IV. AI Cat Assistant Settings

The blog system has a built-in AI Cat Assistant (connected to **DeepSeek** by default, using the OpenAI-compatible protocol). The model, endpoint and personality prompt can all be changed in the console, so any compatible provider can be plugged in.

First, you need to apply for a DeepSeek API Key. After obtaining the API Key, configure it in the console as follows:

![猫猫设置](picture/Pasted%20image%2020260427134211.png)

In **Settings → AI Cat Config 🐾** you can adjust: model id (default `deepseek-flash`, i.e. DeepSeek-V4.1-Flash), endpoint (default `https://api.deepseek.com`), personality prompt, generation budget, temperature and reasoning effort.

After setting the exclusive system prompt (personality) for the cat locally, we need to give the online environment the ability to call the AI. Write the key into an environment file on the server:

```bash
echo 'DEEPSEEK_API_KEY=your-real-api-key' >> /etc/xhblogs.env
chmod 600 /etc/xhblogs.env
systemctl restart xhblogs
```

`/etc/systemd/system/xhblogs.service` already declares `EnvironmentFile=-/etc/xhblogs.env`, so the public site picks the key up. When the console itself calls the AI, add the same variable to `/etc/xhblogs-manager.env` and restart `xhblogs-manager-web`.

> **The daily quote calls the AI from the engine too**, so `/etc/xhblogs-manager.env` needs the same key, and `xhblogs-manager-api.service` must declare `EnvironmentFile=-/etc/xhblogs-manager.env`.

For the local desktop edition, put the key in each app's `.env.local` (already ignored by `.gitignore`, so it never reaches the repository).

> **Never write secrets into code, documentation or the repository** — keep them in environment files with mode 600 on the server.

> Reasoning models spend the generation budget on "thinking" first, so a budget that is too small yields no answer at all — that is why the default is 512. Lower the reasoning effort to make the cat answer faster.

---

## V. Daily Quote

Every day the cat says one encouraging sentence, shown under the homepage content grid.

- **Where to manage it**: Console → **⚙️ Settings → ☀️ 每日一句**. Saving takes effect on the public site immediately — **no publish required**.
- **What you can change**: whether the homepage block is shown, whether the daily generation runs, the generation time (Beijing time), the block title and subtitle, the signature, whether the date and the signature are shown, the maximum sentence length, and the prompt sent to the model (`{date}` is replaced with the current date).
- **Regenerate or write it yourself**: "换一句" asks the AI for a new line; you can also type your own and it replaces today's automatic one. Tomorrow the AI speaks again.
- **Archive**: the console keeps the last 30 lines.
- **Model and persona**: taken straight from **AI Cat Config 🐾** — switching models needs no code change.
- **Where the data lives**: settings in `my-blog-manager/data/dailyQuoteConfig.json`, content in `my-blog-manager/data/dailyQuote.json`. Neither enters Git.

> The scheduled generation runs inside the content engine, so **the console page may be closed** — but `xhblogs-manager-api` has to stay up. If a visitor arrives before today's line exists, the engine writes it in the background and the page never waits.

---

## VI. Comment System Configuration

The comment system is **self-hosted**: visitor comments live in a local SQLite database on the server (`my-blog-manager/data/comments.db`). The public site reads and writes through the content engine, and the console can moderate, reply to, hide or delete them. **No GitHub repository and no OAuth app required.**

> The old Gitalk setup (comments living in GitHub Issues) has been removed entirely — it left the owner unable to see or manage a single comment. The console's **💬 评论管理** (Comment Management) page now lists every comment on the site.

### On the public site

- Every article and moment has a comment area where visitors leave a nickname (and optionally an email), reply, and like.
- Visitor identity comes from a browser-generated token, used for **rate limiting** (max 5 comments per 10 minutes, 20 per hour) and for traceability in the admin panel. No real-world identity is collected.

### In the console

Open the console → **💬 评论管理** (Comment Management):

- Overview stats: total, pending, published, spam, hidden, and new today.
- Filter by **status**, **page**, and **keyword**, sorted by newest, oldest or most-liked.
- Approve, hide, mark as spam or delete — one by one or in bulk. Deleting a comment also removes its replies.
- Reply as the **site owner**; the reply shows up on the public site with a "站长" (admin) badge.
- Every row shows the nickname, email, IP, visitor token, like count, reply count, timestamp and source page.

### Comment options

Console → **⚙️ 设置 → 💬 评论系统配置** (Comment Settings). Changes take effect on the public site **immediately, no publish required**:

| Option | Meaning |
| --- | --- |
| Enable comments | Master switch — hides the comment area but keeps the data |
| Require approval | New comments stay pending until approved in the comment manager |
| Allow anonymous comments | When off, visitors must supply an email address |
| Allow likes | When off, the like button disappears |
| Title / placeholder / notice | Copy shown on the public site |
| Max length | Characters per comment (10 - 2000) |

### Data and backups

Comments live only on the server's disk and **never enter Git** (`.gitignore` excludes `data/comments.db`). To back them up, copy `my-blog-manager/data/comments.db` along with the rest of the site; drop it back in place after a migration and every comment returns.

---

## VII. Local Music Widget Settings

Want to add BGM to your blog? Upload the audio straight to the console — it hosts the files and syncs them to your blog on publish.

Open the console → **音乐播放设置** (Music Settings):

1. Drop an audio file into the upload box, or click to pick one. Supported: `mp3 / m4a / aac / ogg / wav / flac / weba`, up to 100MB each.
2. Fill in the title (the filename is used if you skip it); the artist is optional. A cover image and a `.lrc` lyric file are optional too.
3. Click **上传并加入歌单**. The track shows up in the list right away, where you can preview it, replace the cover, add lyrics, or delete it.

Then go to **线上发布** (Publish) and publish once: the console incrementally syncs `my-blog-manager/music/` into the blog's `XHBlogs/public/audio/`, and the public player reads that local playlist.

Worth knowing:

- **The audio itself never enters Git.** Only the `playlist.json` metadata is tracked; the audio files stay on the server's disk — a public backup repo is no place for copyrighted music, and it keeps the repo small. The sync compares size and mtime, so only new or changed files are copied.
- **Next.js snapshots `public/` at startup**, so freshly uploaded audio only becomes publicly visible after a publish (rebuild + restart).
- The console previews tracks through the engine API, while the public site plays the static files under `public/audio/` — both playlists only match after a publish.

---

## Conclusion

XHBlogs has detailed features waiting to be explored during actual use. This project aims to provide an out-of-the-box frontend static display and backend management solution. If you are a developer and feel the console operations can be optimized, you can do secondary development based on the Next.js source code, or write Markdown manually for deployment!

**If you find this project helpful, please give me a ⭐ Star on GitHub! Every star is a driving force for continued maintenance and updates. Thank you!**

## License

> This project is licensed under the [CC BY-NC 4.0]() license. Free learning, sharing, and republication after secondary modification are allowed (secondary open-source publication must mention the original author), but **any commercial use is strictly prohibited**.

## Previous Update Logs (Version 0.1.1)

#### 1. Title Page and Icon Update

> Implemented custom webpage titles and icon buttons. See the personal card settings in the configuration for details.

#### 2. Article Support for LaTeX Format

> Implemented LaTeX formula rendering. Usage example:
> Input formula like $E=mc^2$. Underscores require an escape character "\_".
> Thanks to @inWunsch for assisting with the LaTeX formula rendering update.

#### 3. Comment System Bug Fix

> Fixed the bug where the comment system failed to fetch properly.

#### 4. New siteconfig Settings

> Added multiple items such as faviconUrl and navTitle. Please make sure to save previous information when pulling code updates!

#### 5. Environment Variables

> Required environment variables have increased, please take note.