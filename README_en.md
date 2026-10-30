# Version 0.5.0 - One Backend, One Database, Two Frontends

**The blog and the admin console are now two frontends on top of one backend and one database.**

- **One backend, two frontends**: the console used to ship its own FastAPI (`my-blog-manager/cms_core`) while the
  blog read markdown / TypeScript files. The backend now lives in a top-level `server/`, and both frontends reach it
  through their own same-origin proxy. All content lives in a single SQLite database.
- **Content no longer scattered across files**: articles, talks, moments, albums, friend links, projects, the about
  page and the site config all live in the database. The public site reads it at request time, so a refresh shows the
  latest; the console shows exactly what it just wrote.
- **Saves apply instantly; pushing keeps the version**: the database is the single source of truth, and every save in
  the console is written to it immediately, so the public site shows it on refresh. Git stores *content snapshots*
  (`snapshots/content-*.json`). One click on **Push to GitHub** exports the current content as JSON, commits it to the
  server repository and pushes it to GitHub - a traceable, rollback-able version.
- **Rollback = load a historical snapshot back into the database**: pick any step in the publish history and the
  content is back to that state. A rollback is a new commit too, so the history never breaks and you can keep
  stepping backwards.
- **Images, music, the daily quote and comments are unified too**: uploaded images live in the backend's data
  directory and both frontends reference them with the same `/uploads/<file name>` address; local music is hosted by
  the backend and the public player reads it through the same API; comments and daily quotes live in the same
  database.
- **One place for secrets**: the DeepSeek key and the session secret are read from environment variables only; the
  repository keeps nothing but a `server/.env.example` template.

---

# Version 0.4.9 - Measured End to End

**Measured on the server: the front end changes half a second after you click publish.**

- **The console no longer promises a 1-3 minute wait**: the copy under the publish button and the
  "构建中" state label now read "同步中", with a note that only code changes trigger a rebuild.
  The rollback copy stays as it is, because the rollback helper really does still rebuild the site.
- **Numbers from the server**: saving a moment and clicking 发布上线 made the public site show it
  **128 ms** later (271 ms counting from the save; the publish call itself takes 33 ms). No `next build`
  ran - the build id and the artifact timestamp stayed untouched. The same flow took about 39 seconds
  before.
- **A measurement pitfall worth knowing about**: polling with `curl ... | grep -q` looks fine but is
  not. When grep matches it exits early, curl gets SIGPIPE, and with `set -o pipefail` the hit is
  scored as a miss - which is how the same run reported 0.5 s, 2.3 s, 4.4 s and 8.3 s in a row. The
  scripts now fetch the page first and match afterwards; the reading is stable at ~0.1 s.
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

This is a personal blog system built with Next.js, featuring a Glassmorphism design. This project includes a frontend display and an admin console, both talking to one shared backend and one shared database. It supports Markdown writing, draft management, and image hosting configuration.

**The recommended deployment now is to run the public site and the console on your own Linux server** (systemd supervises the public site, the console frontend and the unified backend; Git keeps every revision). Content changes apply as soon as you save. One click on **Push to GitHub** exports the current content as a snapshot, commits it to the server repository and pushes it to GitHub, so you keep a version that can be rolled back.

This guide walks you through the server deployment and the day-to-day use of the console.

---

## Language

[![English](https://img.shields.io/badge/Language-English-blue.svg)](README_en.md)
[![中文](https://img.shields.io/badge/语言-中文-red.svg)](README.md)

## Project Structure

XHBlogs is now a complete frontend + backend + database project. The blog and the console are two frontends that share one backend and one database:

```
XHBlogs/                 # Frontend 1: the public site (Next.js App Router)
my-blog-manager/         # Frontend 2: the admin console (Next.js App Router)
server/                  # Backend: the unified API (FastAPI + SQLAlchemy + SQLite)
    ├── app/             #   routes, ORM models, auth, snapshots, configuration
    ├── scripts/         #   table creation / legacy content import / API smoke test
    └── requirements.txt
snapshots/               # Content snapshots: one JSON per publish, committed to Git
tools/                   # The publish and rebuild helper scripts used on the server
```

There is only one direction for the data to flow:

```
   public site (XHBlogs)  ─┐
                            ├─→  unified backend (server/app/main.py)  ─→  SQLite database
   console (manager)      ─┘
```

The console writes into the database, the public site reads from the same database, so the two sides always agree -
the "I changed it in the console but the site did not move" class of bugs is gone.

## Preface

### Current Version: 0.5.0 (2026-10-29)

**The blog and the admin console are now two frontends on top of one backend and one database.**

- **One backend, two frontends**: the console used to ship its own FastAPI (`my-blog-manager/cms_core`), and the blog
  read a different set of markdown / TypeScript files. The backend now lives in a top-level `server/`, and both
  frontends reach it through their own same-origin proxy. The content lives in a single SQLite database.
- **Content no longer scattered across files**: articles, talks, moments, albums, friend links, projects, the about
  page and the site config all live in the database. The public site reads it at request time, so a refresh shows the
  latest; the console shows exactly what it just wrote.
- **Saves apply instantly; pushing keeps the version**: the database is the single source of truth, and every save in
  the console is written to it immediately, so the public site shows it on refresh. Git stores *content snapshots*
  (`snapshots/content-*.json`). One click on **Push to GitHub** exports the current content as JSON, commits it to the
  server repository and pushes it to GitHub - a traceable, rollback-able version.
- **Rollback = load a historical snapshot back into the database**: pick any step in the publish history and the
  content is back to that state. A rollback is a new commit too, so the history never breaks.
- **Images, music, the daily quote and comments are unified too**: uploaded images live in the backend's data
  directory and both frontends reference them with the same `/uploads/<file name>` address; local music is hosted by
  the backend; comments and the daily quote live in the same database.
- **One place for secrets**: the DeepSeek key and the session secret are read from environment variables only; the
  repository keeps nothing but a `server/.env.example` template.

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

A Linux server is recommended (CentOS / Alibaba Cloud Linux / Ubuntu all work). You need:

- **Node.js** (20.9.0 or newer, for the current Next.js 16)
- **npm**
- **Git**
- **Python** (3.10 or newer; tested under 3.11)
- **Nginx** (public entry point: `/` for the public site, `/console` for the console — see section 5)

### 2. Directory and Repository

The whole system runs inside one Git working tree, and a bare repository keeps every revision of the sources:

```
/opt/xinghui-blog/            # Git working tree
├── XHBlogs/                  # Frontend 1: public site sources
├── my-blog-manager/          # Frontend 2: console sources
├── server/                   # Backend: the unified API
└── snapshots/                # Content snapshots (one JSON per publish)
/srv/git/xinghui-blog.git     # Bare repository, holding every revision of the sources
```

Prepare the sources:

```bash
mkdir -p /opt/xinghui-blog && cd /opt/xinghui-blog
git clone /srv/git/xinghui-blog.git .

cd XHBlogs && npm ci
cd ../my-blog-manager && npm ci

# The unified backend gets its own virtual environment and dependencies
cd ../server && python3.11 -m venv .venv
.venv/bin/pip install -i https://mirrors.aliyun.com/pypi/simple/ -r requirements.txt
```

> **Keep the database outside the repository**: `server/data/` is excluded by `.gitignore`, but everything in it is
> lost if the repository is rebuilt. Point the database at a system directory on a live server:
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
>
> **Upgrading from an older version**: while the old content still lives in markdown / TypeScript files, create the
> database and import it once:
>
> ```bash
> cd /opt/xinghui-blog/server
> XHS_DATABASE_URL=sqlite:////var/lib/xhblogs/blog.db \
>   .venv/bin/python scripts/import_content.py --source /opt/xinghui-blog/my-blog-manager
> ```
>
> The import overwrites, and the script prints how many records of each kind were imported.

> **Off-site backup**: the working tree also carries a `github` remote pointing at your own
> backup repository (this project uses `yunqi-meng/NewBoKe`). Every push sends the same commit
> there as well, so the live content is not only kept on the server but also archived on
> GitHub. The push authenticates with a repository-scoped SSH deploy key; the private key stays
> in `/home/xhblogs/.ssh/` on the server and is never committed, scripted or documented. A
> failing GitHub push is recorded in the push status and the log, and never affects content
> that is already live.

### 3. Register the systemd services

> **Note**: the deployment target is now your own Linux server, not Vercel or GitHub Pages. systemd supervises three services and Git tracks every revision.

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

Unified backend `/etc/systemd/system/xhblogs-manager-api.service`:

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
# The daily quote calls the AI; the key lives only in this environment file (mode 600)
EnvironmentFile=-/etc/xhblogs-manager.env
ExecStart=/opt/xinghui-blog/server/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

| Service | Role | Listens on |
| --- | --- | --- |
| `xhblogs` | public site, `next start` serving the prebuilt output | `0.0.0.0:8080` |
| `xhblogs-manager-web` | console frontend, mounted at `/console` | `127.0.0.1:3001`, exposed through nginx |
| `xhblogs-manager-api` | **unified backend** (FastAPI), shared by the blog and the console | `127.0.0.1:8000`, local access only |

> The backend only listens on `127.0.0.1`, so the browser cannot reach it directly. Every API call from the public
> site and the console goes through that app's own same-origin proxy (the public site's `/api/*`, the console's
> `/api/proxy/*`), and the server forwards it to the local backend. That is why LAN and public access both work.

### 4. Build and start

```bash
cd /opt/xinghui-blog/XHBlogs && npm run build
cd /opt/xinghui-blog/my-blog-manager && npm run build

systemctl daemon-reload
systemctl enable --now xhblogs xhblogs-manager-web xhblogs-manager-api
```

The console frontend uses `output: 'standalone'`, so the static assets have to be copied into the standalone output and the backend port written next to them:

```bash
cd /opt/xinghui-blog/my-blog-manager
mkdir -p .next/standalone/.next/static .next/standalone/public
cp -a .next/static/. .next/standalone/.next/static/
printf '%s\n' '{"api_port": 8000}' > .next/standalone/public/backend_config.json
```

> The console is built to live under `/console`, so the prefix has to be present at build time (`basePath` is compiled in; changing it means rebuilding):
>
> ```bash
> NEXT_PUBLIC_CONSOLE_BASE_PATH=/console npm run build
> ```
>
> Leave the variable empty to run the console at the root path (for example when double-clicking `Start.bat` locally). `xhblogs-manager-rebuild` already sets `CONSOLE_BASE_PATH=/console`; override it with `XHBlogs_CONSOLE_BASE_PATH=`.

> **Rebuild the console after every console code change**: `next start` serves the prebuilt output, source edits do not show up on their own.

> The repository already turns these steps into scripts, so on the server you can just use them:
>
> ```bash
> sudo install -m 755 /opt/xinghui-blog/tools/xhblogs-rebuild        /usr/local/bin/
> sudo install -m 755 /opt/xinghui-blog/tools/xhblogs-manager-rebuild /usr/local/bin/
> sudo install -m 755 /opt/xinghui-blog/tools/xhblogs-publish         /usr/local/bin/
> sudo install -m 755 /opt/xinghui-blog/tools/xhblogs-deploy          /usr/local/bin/
> ```
>
> `xhblogs-deploy` is the manual update path: it pulls the latest code and then decides, from the changed paths,
> whether to rebuild the public site, rebuild the console or only restart the backend. The publish helper calls the
> first two when it needs them.

### 5. Public access and domains

In production nginx sits in front: the public site and the console share one host and are split by path.

| Path | Upstream | Notes |
| --- | --- | --- |
| `/` | `127.0.0.1:8080` | public site (`next start`) |
| `/console` | `127.0.0.1:3001` | console (built with `basePath=/console`) |

The unified backend still listens on `127.0.0.1:8000` only; each frontend forwards to it, so the internet never reaches it directly. The console systemd unit also binds `HOSTNAME=127.0.0.1`, and its only public entry point is nginx.

The security group only needs three ports:

| Port | Purpose | Suggested source |
| --- | --- | --- |
| 22 | SSH | your office IP |
| 80 | HTTP (nginx) | everyone |
| 443 | HTTPS (nginx) | everyone |

`8080` / `3001` no longer need to be public — nginx calls them on localhost. The `3001` rule opened for the console can be removed.

#### 5.1 Install and wire up nginx

The dnf configuration on Alibaba Cloud Linux 3 carries an `exclude=` that hides nginx, so it has to be lifted explicitly:

```bash
dnf install -y --disableexcludes=all nginx
```

[tools/nginx-xhblogs.conf](tools/nginx-xhblogs.conf) in the repository is the configuration running in production. Install it as `/etc/nginx/conf.d/xhblogs.conf` and drop the distribution's default site:

```bash
install -m 644 /opt/xinghui-blog/tools/nginx-xhblogs.conf /etc/nginx/conf.d/xhblogs.conf
rm -f /etc/nginx/conf.d/default.conf
nginx -t && systemctl enable --now nginx
```

> If `nginx -t` reports `conflicting server name "_"`, the stock `server { listen 80 default_server; … }` block in `/etc/nginx/nginx.conf` is still there. Back the file up, comment that block out and reload; the site is unaffected.

`xhblogs-deploy` keeps the configuration in sync afterwards: when the template changes it backs up the live file, reloads only if `nginx -t` passes and rolls back otherwise.

> The console's `location` **must not** be `proxy_pass http://127.0.0.1:3001/;`. The trailing slash strips the `/console` prefix, and the console is built with prefixed routes — stripping it returns 404 everywhere.

#### 5.2 DNS

Add two A records at your DNS provider, both pointing at the server's public IP:

| Host | Type | Value |
| --- | --- | --- |
| `@` | A | your server's public IP |
| `www` | A | your server's public IP |

Once they resolve (`dig +short your-domain`), set the real names in nginx:

```nginx
server_name example.com www.example.com;
```

```bash
nginx -t && systemctl reload nginx
```

`http://example.com/` now serves the blog and `http://example.com/console` serves the console, with all links and API calls on the same origin — no more IP and port to remember.

#### 5.3 Certificates and HTTPS

After issuing a certificate, uncomment the 443 block at the end of [tools/nginx-xhblogs.conf](tools/nginx-xhblogs.conf), fill in the certificate paths and turn the port 80 block into a redirect:

```nginx
location / { return 301 https://$host$request_uri; }
```

```bash
nginx -t && systemctl reload nginx
```

Then add one line to `/etc/xhblogs-manager.env` so the login cookie carries `Secure`:

```ini
MANAGER_COOKIE_SECURE=1
```

```bash
systemctl restart xhblogs-manager-api
```

The console frontend needs no change — it only cares about `basePath`, not the scheme.

For issuance, pick whatever is at hand: download an nginx-format free DV certificate from the Alibaba Cloud console, or install acme.sh on the server and issue via DNS (no need to stop nginx), pointing the 443 block at the resulting `fullchain` / `key`. Include both names (apex and `www`) in the certificate, otherwise `www` will warn.

#### 5.4 Post-launch checks

```bash
curl -I http://your-domain/                 # 200
curl -I http://your-domain/console          # 307, Location: /console/login
curl -I http://your-domain/console/login    # 200
ss -ltnp | grep -E ':(3001|8080|8000)'      # 3001 and 8000 on 127.0.0.1 only
```

### 6. Password login for the console

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
Environment=HOSTNAME=127.0.0.1
```

The unified backend uses the same `MANAGER_SESSION_SECRET`, so the console and the backend recognise each other's session cookie.

After the restart, `https://your-domain/console` redirects to `/console/login`; the session lasts 7 days and the cookie is HttpOnly. There is also a log-out button in the top right corner.

> The console listens on localhost only. For remote debugging use an SSH tunnel: `ssh -L 3001:127.0.0.1:3001 xhblogs@server-ip`, then open `http://127.0.0.1:3001/console`.

> **Security note**: over plain HTTP the password travels unencrypted, so restrict the source IP in the security group. Once you serve HTTPS, set `MANAGER_COOKIE_SECURE=1`.

> **Why remote access needs no code change**: the console used to call `http://127.0.0.1:<engine port>` straight from the browser, which only works on the machine running the engine. Every backend call now goes through the same-origin `/api/proxy`, which forwards to the local backend, so LAN and public access both work.

### 7. Local development (optional)

You can still double-click `my-blog-manager/Start.bat` to debug on Windows. The local backend configuration lives in `server/.env` (excluded by `.gitignore`; the repository only keeps a `.env.example` template):

```ini
# server/.env
XHS_DATABASE_URL=sqlite:///server/data/blog.db
DEEPSEEK_API_KEY=your-local-development-key
```

Run the backend locally:

```bash
cd server
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The local machine has no publish helper (`/usr/local/bin/xhblogs-publish` only exists on the server), so saving still
writes to the local database and **Push to GitHub** only exports the current content into `snapshots/`; committing
and deploying is up to you.

### 8. Working together with the server

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

## Appendix: The Unified Backend and the Database

Starting point for changing the content structure, adding a field or wiring up a new endpoint.

### Layout

```
server/app/
├── main.py          # application entry: registers all routes, middleware, startup tasks
├── config.py        # runtime configuration: read entirely from environment variables
├── db.py            # database connection and sessions
├── models.py        # ORM models (every table is here)
├── security.py      # password hashing, session tokens, admin check
├── snapshot.py      # exporting and importing content snapshots
├── helpers.py       # small shared helpers
├── markdown.py      # Markdown parsing
├── siteconfig.py    # reading and writing the site config
├── tsdata.py        # parses the legacy TS data files (used when importing old content)
└── api/
    ├── content.py       # articles / talks / about page / moments
    ├── collections.py   # albums / friend links / projects
    ├── config.py        # site config
    ├── drafts.py        # drafts
    ├── media.py         # image upload and reading
    ├── music.py         # local music
    ├── comments.py      # comments
    ├── dailyquote.py    # daily quote
    ├── chat.py          # the AI cat
    ├── auth.py          # login / logout
    └── deploy.py        # publish / rollback / live status
```

### Data tables

| Table | What it holds |
| --- | --- |
| `articles` | articles, talks and the about page (`type` distinguishes them, `slug` is unique) |
| `moments` | moments |
| `albums` / `album_photos` | albums and the photos inside them |
| `friends` / `projects` | friend links and the project grid |
| `site_config` | the site config (the whole JSON in one row) |
| `drafts` | the drafts box |
| `music_tracks` | local music (metadata; the audio files stay on disk) |
| `daily_quotes` | the daily quote (`date` is the primary key, one per day) |
| `media_assets` | metadata of the uploaded images |
| `settings` | other scattered settings (the daily quote config and friends) |
| `comments` / `comment_likes` | comments and likes (**not** in the snapshots, back the database file up separately) |

### Adding a table or changing a field

1. Change the ORM model in `server/app/models.py`;
2. Creating tables is automatic — `init_db()` fills in the missing tables on every start;
3. If the new table should also be part of a content snapshot, register it in the `TABLES` list in
   `server/app/snapshot.py`. Mind the order: **parent tables come before child tables** (inserts run forwards, deletes
   run backwards, otherwise the foreign keys stop you);
4. Write the route under `server/app/api/`; the frontends reach it through `/api/...`.

### How the content reaches the front end

```
console saves      ─→ POST /api/articles ─→ written into the database
public site renders ─→ GET  /api/articles ─→ read from the database
```

Both sides go through a same-origin proxy:

| Frontend | Proxy route | Forwarded to |
| --- | --- | --- |
| Public site | `/api/comments`, `/api/config`, `/api/daily-quote`, `/api/chat`, `/api/music/*` | `http://127.0.0.1:8000` |
| Console | `/api/proxy/<backend path>` | `http://127.0.0.1:8000` |

The public site's proxy is an **allowlist**: only the prefixes above get through, so no other backend endpoint is
exposed to the internet. The console's `/api/proxy` sits behind the admin authentication.

### How to verify a change

```bash
# Locally: start the backend and walk through the main endpoints
cd server
.venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
.venv/Scripts/python scripts/smoke_test.py --base http://127.0.0.1:8000

# On the server: the smoke test runs there too, with the session secret it can write
cd /opt/xinghui-blog/server
MANAGER_SESSION_SECRET=… .venv/bin/python scripts/smoke_test.py --base http://127.0.0.1:8000
```

The smoke test goes through the main read and write endpoints and cleans up its own test data afterwards.

---

## II. Editing Content and Pushing to the GitHub Repository

The console no longer has an operation staging area: articles, moments, albums, friend links, projects and the site
config are written to the database the moment you press **Save**, and a refresh of the public site shows them right
away - no publish step in between.

> If a save fails, the console tells you why on the spot and reloads the list from the server, so it never shows
> "saved" for data that did not land in the database.

**Pushing to the GitHub repository**

Content does not need a push to be live. The 📤 button in the top-right corner (and **Settings → Push to GitHub**)
exports the current content as a snapshot, commits it to the server repository and pushes it to the GitHub
repository, leaving a traceable, rollback-able version. Once confirmed, it does the following:

1. **Export a content snapshot** — the whole content of the database becomes one JSON file (`snapshots/content-<timestamp>.json`);
2. **Commit and push the server repository** — the snapshot is committed in the server working tree and pushed to the bare repository;
3. **Push to the GitHub repository** — the same commit is pushed to the `github` remote; the outcome (pushed / failed / remote not configured) shows up in the push status, and a GitHub failure never affects content that is already live;
4. **Rebuild only when the code changed** — changed public site code rebuilds the public site, changed console code rebuilds the console, changed backend code restarts the backend. A content-only change skips this step entirely.

> **🌟 A push keeps a version, it never overwrites content**: it commits a snapshot of the current content and does
> not roll anything back. The content has been live since you saved it.

The whole cycle usually takes a few seconds. Push logs land in `/var/log/xhblogs-publish.log`.

> If you edited the sources directly on the server, `sudo /usr/local/bin/xhblogs-deploy` pulls the latest code and
> rebuilds according to the changed paths; `sudo /usr/local/bin/xhblogs-rebuild` rebuilds just the public site.

Editing and publishing blog posts, moments, chatter and every other kind of content all follow this flow.

> **💡 Golden Rule**: Save is live, push keeps the version.

### What a content snapshot looks like

A snapshot is a full export of the content: articles, talks, moments, albums and their photos, friend links,
projects, the site config, drafts, local music, the daily quotes and the image metadata (comments are **not** in a
snapshot - they are visitor data, so back up the database file separately):

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

### Push history and rollback

The "4. Push History & Rollback" card under **Settings → Push to GitHub** lists the last 20 steps with commit id,
subject and time; pushes are `chore(publish)` and rollbacks are `chore(rollback)`, so the two are easy to tell apart.

Clicking **"回退到这里"** on any step loads the snapshot from that commit back into the database, so articles,
moments, album / friend / project data, the about page, the site config, local music and the image metadata are back
to that state right away, and a fresh snapshot is committed.

A rollback is a **new commit**, so the history is never broken and you can keep stepping backwards; the source code
itself is untouched. Rollback logs land in `/var/log/xhblogs-publish.log` as well.

> The snapshots live in Git, so a rollback does not depend on a database backup - as long as the repository is still
> there, every step can be restored.

### Online status panel

**Settings → Push to GitHub** shows the live state of the public site in real time: whether the service is running,
the time and build id of the last build, the newest commit in the source repository, the outcome of the previous
push (including whether it reached GitHub) and whether a change has been pushed yet. Content changes need no
rebuild, so what decides whether a change is live is the **effective timestamp** in the push status, not the build
time.

> **Why "Sync Blog" used to change nothing online**: the public site is `next start` serving a prebuilt output, so
> edits to files such as `siteConfig.ts` only reach the site after a `build` and a service restart. Now the site reads
> the database at request time, so it is live as soon as the data is saved.

---

## III. Image Upload (Local Image Repository)

The console no longer relies on any third-party image host. Pictures are uploaded straight from your own computer
into the **local image repository of the unified backend**, and both sites reference them with the same in-site
address: `/uploads/<file name>`.

**Upload flow:**

1. Open the console: "Photo Wall -> album -> add fragment", or the wallpaper drop zone in
   "Settings -> Visual Background", or the image workbench inside the article editor.
2. Press **[Upload]** or simply drop the picture into the dashed box. The file travels from your
   machine to the backend and is written to disk.
3. Once stored, the console previews it directly through `/uploads/<file name>`; pasting an external
   image URL still works exactly as before.
4. The public site and the console use the **same address** for these photos: the public site's
   `/uploads/<file name>` is forwarded by the server to the backend, which serves the file.

> The images in the local repository are binary files: they never enter Git and are never pushed to a remote by a
> publish. If your photos cannot be recreated, back up the `uploads/` subdirectory of the backend's data directory
> from time to time (on a live server that is `/var/lib/xhblogs/uploads/`).

---

## IV. AI Cat Assistant Settings

The blog system has a built-in AI Cat Assistant (connected to **DeepSeek** by default, using the OpenAI-compatible protocol). The model, endpoint and personality prompt can all be changed in the console, so any compatible provider can be plugged in.

First, you need to apply for a DeepSeek API Key. After obtaining the API Key, configure it in the console as follows:

![猫猫设置](picture/Pasted%20image%2020260427134211.png)

In **Settings → AI Cat Config 🐾** you can adjust: model id (default `deepseek-flash`, i.e. DeepSeek-V4.1-Flash), endpoint (default `https://api.deepseek.com`), personality prompt, generation budget, temperature and reasoning effort.

After setting the exclusive system prompt (personality) for the cat locally, we need to give the online environment the ability to call the AI. **Only the unified backend calls the AI now**, so the key only has to go into the backend's environment file:

```bash
echo 'DEEPSEEK_API_KEY=your-real-api-key' >> /etc/xhblogs-manager.env
chmod 600 /etc/xhblogs-manager.env
systemctl restart xhblogs-manager-api
```

`/etc/systemd/system/xhblogs-manager-api.service` already declares `EnvironmentFile=-/etc/xhblogs-manager.env`,
so the unified backend picks the key up. The public site and the console both call the AI through it, so neither of
them needs its own copy.

For local development, put the key in `server/.env` (already ignored by `.gitignore`, so it never reaches the repository).

> **The daily quote calls the AI from the backend too**, using the same key.

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
- **Where the data lives**: the settings and the archive live in the unified backend's database (the `settings` and `daily_quotes` tables), together with everything else.

> The scheduled generation runs inside the unified backend, so **the console page may be closed** — but `xhblogs-manager-api` has to stay up. If a visitor arrives before today's line exists, the backend writes it in the background and the page never waits.

---

## VI. Comment System Configuration

The comment system is **self-hosted**: visitor comments live in the unified backend's SQLite database (the `comments` and `comment_likes` tables). The public site reads and writes through the same backend, and the console can moderate, reply to, hide or delete them. **No GitHub repository and no OAuth app required.**

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

Comments live only on the server's disk and **never enter Git** (a content snapshot does not contain them either). To
back them up, copy the backend's database file along with the rest of the site (on a live server that is
`/var/lib/xhblogs/blog.db`); drop it back in place after a migration and every comment returns.

---

## VII. Local Music Widget Settings

Want to add BGM to your blog? Upload the audio straight to the console — the **unified backend** hosts the files and
the public site reads the same playlist.

Open the console → **音乐播放设置** (Music Settings):

1. Drop an audio file into the upload box, or click to pick one. Supported: `mp3 / m4a / aac / ogg / wav / flac / weba`, up to 100MB each.
2. Fill in the title (the filename is used if you skip it); the artist is optional. A cover image and a `.lrc` lyric file are optional too.
3. Click **上传并加入歌单**. The track shows up in the list right away, where you can preview it, replace the cover, add lyrics, or delete it.

Worth knowing:

- **The audio itself never enters Git.** Only the track metadata in the content snapshot is tracked; the audio files
  stay on the server's disk — a public backup repo is no place for copyrighted music, and it keeps the repo small.
- **No publish needed to hear it.** The backend keeps the audio in its own data directory, and the public site's
  player fetches it through the `/api/music/*` proxy, so the audio, the cover and the lyrics all travel through the
  same API.
- **The public site's proxy is restricted**: only `local / file / cover / lyrics` are let through, so no other
  backend endpoint is exposed to the public.

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