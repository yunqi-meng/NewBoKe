"""统一后端：博客与管理后台共用的唯一数据源。

    前台（博客，Next.js）  ─┐
                            ├─→ server/app/main.py → SQLite
    后台（管理控制台）      ─┘

启动：
    uvicorn app.main:app --host 0.0.0.0 --port 8000
（在 server/ 目录下执行）
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from . import config, httpcache, revalidate
from .api import (
    auth,
    chat,
    collections,
    comments,
    config as site_config,
    content,
    dailyquote,
    deploy,
    drafts,
    media,
    music,
)
from .db import init_db
from .helpers import configure_console_encoding

# Windows 控制台默认 GBK，日志里的 emoji 会直接把请求打成 500，先统一切 UTF-8
configure_console_encoding()


@asynccontextmanager
async def lifespan(_: FastAPI):
    """启动时建表，并拉起每日励志语的定时线程。"""
    init_db()
    configure_console_encoding()
    dailyquote.start_scheduler()
    try:
        yield
    finally:
        dailyquote.stop_scheduler()


app = FastAPI(title="XingHuiSama Unified API", version="2.0.0", lifespan=lifespan)

# 🌟 核心修复：添加跨域中间件，彻底解决 Failed to fetch 报错
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def optimize_response(request: Request, call_next):
    """JSON 压缩 + 公开读接口 ETag 缓存；内容写入成功后通知公开站刷新页面缓存。"""
    response = await call_next(request)
    response = await httpcache.apply(request, response)
    if response.status_code < 400 and revalidate.should_revalidate(request.method, request.url.path):
        revalidate.schedule()
    return response


@app.get("/api/status")
def get_status():
    return {
        "status": "online",
        "message": "统一后端已连接",
    }


# ---------------------------------------------------------------------------
# 路由注册
# ---------------------------------------------------------------------------
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(content.router, prefix="/api", tags=["Content"])
app.include_router(collections.albums_router, prefix="/api/albums", tags=["Albums"])
app.include_router(collections.friends_router, prefix="/api/friends", tags=["Friends"])
app.include_router(collections.projects_router, prefix="/api/projects", tags=["Projects"])
app.include_router(site_config.router, prefix="/api/config", tags=["Config"])
app.include_router(drafts.router, prefix="/api/drafts", tags=["Drafts"])
app.include_router(media.router, prefix="/api/media", tags=["Media"])
app.include_router(music.router, prefix="/api/music", tags=["Music"])
app.include_router(comments.router, prefix="/api/comments", tags=["Comments"])
app.include_router(dailyquote.router, prefix="/api/daily-quote", tags=["DailyQuote"])
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])
app.include_router(deploy.router, prefix="/api/deploy", tags=["Deploy"])
