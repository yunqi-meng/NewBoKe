"""内容写入后通知公开站刷新页面缓存。

公开站把后端数据缓存 60 秒；控制台改了内容，这里调一次公开站的
/api/revalidate，新内容立刻可见，不用等缓存过期。

    XHS_PUBLIC_SITE_URL   公开站地址，默认 http://127.0.0.1:8080
    XHS_REVALIDATE_SECRET 通知用的共享密钥，没配时退回 MANAGER_SESSION_SECRET；
                          两个都没配就不通知（公开站那边同样会拒绝）

通知在后台线程里做，并合并 1 秒内的连续写入，失败只记日志，不影响写接口本身。
"""

import threading
import urllib.request

from . import config

DEBOUNCE_SECONDS = 1.0
TIMEOUT_SECONDS = 5

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# 会改变公开站页面内容的写接口前缀
CONTENT_PREFIXES = (
    "/api/articles",
    "/api/about",
    "/api/moments",
    "/api/albums",
    "/api/friends",
    "/api/projects",
    "/api/config",
    "/api/music",
    "/api/comments",
    "/api/deploy/rollback",
)

# 草稿箱里只有这几条会动到已发布内容
DRAFT_PATHS = (
    "/api/drafts/publish",
    "/api/drafts/sync_local",
    "/api/drafts/delete",
)

_lock = threading.Lock()
_timer = None


def site_url() -> str:
    return config._env("XHS_PUBLIC_SITE_URL", "http://127.0.0.1:8080").rstrip("/")


def secret() -> str:
    return config._env("XHS_REVALIDATE_SECRET") or config.session_secret()


def should_revalidate(method: str, path: str) -> bool:
    if method.upper() not in WRITE_METHODS:
        return False
    if path.startswith("/api/drafts"):
        # 草稿只有发布 / 删除会动到公开站看到的内容
        return method.upper() == "DELETE" or path.startswith(DRAFT_PATHS)
    return path.startswith(CONTENT_PREFIXES)


def _send() -> None:
    global _timer
    with _lock:
        _timer = None
    token = secret()
    if not token:
        return
    request = urllib.request.Request(
        site_url() + "/api/revalidate",
        data=b"{}",
        headers={"Content-Type": "application/json", "X-Revalidate-Token": token},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            response.read()
    except Exception as error:
        print("[revalidate] 通知公开站刷新失败：{0}".format(error))


def schedule() -> None:
    """合并短时间内的多次写入，只发一次通知。"""
    global _timer
    if not secret():
        return
    with _lock:
        if _timer is not None:
            _timer.cancel()
        _timer = threading.Timer(DEBOUNCE_SECONDS, _send)
        _timer.daemon = True
        _timer.start()
