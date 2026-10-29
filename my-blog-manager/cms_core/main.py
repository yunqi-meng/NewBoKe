from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 引入所有 API 路由
from cms_core.api import music, config, drafts, moments
from cms_core.api import gallery, friends, projects
from cms_core.api import sync, deploy
from cms_core.api import comments
from cms_core.api import media
from cms_core.api import dailyquote


@asynccontextmanager
async def lifespan(_: FastAPI):
    """引擎启动时拉起每日励志语的定时线程，退出时收尾。"""
    dailyquote.start_scheduler()
    try:
        yield
    finally:
        dailyquote.stop_scheduler()


app = FastAPI(title="XingHuiSama CMS Backend", version="1.0.0", lifespan=lifespan)

# 🌟 核心修复：添加跨域中间件，彻底解决 Failed to fetch 报错
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有来源请求
    allow_credentials=True,
    allow_methods=["*"],  # 允许所有请求方法 (GET, POST 等)
    allow_headers=["*"],  # 允许所有请求头
)

@app.get("/api/status")
def get_status():
    return {"status": "online", "message": "中枢神经已连接"}

# 注册所有路由
app.include_router(music.router, prefix="/api/music", tags=["Music"])
app.include_router(config.router, prefix="/api/config", tags=["Config"])
app.include_router(drafts.router, prefix="/api/drafts", tags=["Drafts"])
app.include_router(gallery.router, prefix="/api/gallery", tags=["Gallery"])
# 📸 本地图片仓库：控制台从运营者电脑直接上传，落盘到 data/uploads/
app.include_router(media.router, prefix="/api/media", tags=["Media"])
app.include_router(friends.router, prefix="/api/friends", tags=["Friends"])
app.include_router(projects.router, prefix="/api/projects", tags=["Projects"])
app.include_router(moments.router, prefix="/api/moments", tags=["Moments"])
app.include_router(sync.router, prefix="/api/sync", tags=["Sync"])
app.include_router(deploy.router, prefix="/api/deploy", tags=["Deploy"])
# 🌟 自建评论系统：前台读写 + 后台审核（控制台「评论管理」页面用）
app.include_router(comments.router, prefix="/api/comments", tags=["Comments"])
# ☀️ 每日励志语：每天定时让当前接入的 AI 说一句话（控制台可管理）
app.include_router(dailyquote.router, prefix="/api/daily-quote", tags=["DailyQuote"])
