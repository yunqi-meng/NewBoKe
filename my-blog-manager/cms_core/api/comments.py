"""
评论系统：自建存储 + 接口

为什么要自己写？
    旧方案用 Gitalk（把评论塞进 GitHub Issues），有两个硬伤：
      1. 评论数据在 GitHub 上，服务器上根本存不下、也管不了；
      2. 控制台完全看不到评论，只能去 GitHub 页面手工翻。

现在的方案：
    - 评论存在本机 SQLite（data/comments.db），跟着服务器一起活着；
    - 公开站读写评论走 /api/comments/*；
    - 控制台的「评论管理」页面走 /api/comments/admin/*，能看到全部评论、
      审核、回复、删除、批量处理。

存储位置：my-blog-manager/data/comments.db（已 gitignore，不会进仓库）
"""

import hashlib
import json
import os
import re
import sqlite3
import threading
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Request

router = APIRouter()

# ---------------------------------------------------------
# 📍 路径定位：物理锁死 Manager 本地根目录
# ---------------------------------------------------------
CURRENT_API_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_API_DIR, "..", ".."))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
DB_PATH = os.path.join(DATA_DIR, "comments.db")

# ---------------------------------------------------------
# 🏷️ 评论状态
# ---------------------------------------------------------
STATUS_PENDING = "pending"    # 待审核
STATUS_APPROVED = "approved"  # 已发布
STATUS_SPAM = "spam"          # 垃圾
STATUS_HIDDEN = "hidden"      # 已隐藏
STATUSES = (STATUS_PENDING, STATUS_APPROVED, STATUS_SPAM, STATUS_HIDDEN)

STATUS_LABELS = {
    STATUS_PENDING: "待审核",
    STATUS_APPROVED: "已发布",
    STATUS_SPAM: "垃圾箱",
    STATUS_HIDDEN: "已隐藏",
}

# ---------------------------------------------------------
# ⚙️ 默认设置（后台可改，改完立刻对前台生效）
# ---------------------------------------------------------
DEFAULT_SETTINGS: Dict[str, Any] = {
    "enabled": True,           # 评论总开关
    "title": "留言板",          # 评论区标题
    "placeholder": "说点什么吧…",  # 输入框占位符
    "notice": "",              # 顶部提示语（留空则不显示）
    "allowGuest": True,        # 是否允许游客留言
    "requireApproval": False,  # 是否需要人工审核后才显示
    "maxLength": 500,          # 单条评论最大字数
    "allowLike": True,         # 是否开放点赞
}

# ---------------------------------------------------------
# 🛡️ 反垃圾参数
# ---------------------------------------------------------
RATE_WINDOW_MINUTES = 10
RATE_LIMIT_WINDOW = 5      # 10 分钟内最多 5 条
RATE_LIMIT_HOUR = 20       # 1 小时内最多 20 条
MAX_CONTENT_LENGTH = 2000  # 硬上限，防止有人绕过前端塞超长文本
MAX_NAME_LENGTH = 40
MAX_TARGET_LENGTH = 200
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# SQLite 写入串行化，避免并发提交时 database is locked
_write_lock = threading.Lock()


# ---------------------------------------------------------
# 🗄️ 数据库
# ---------------------------------------------------------
SCHEMA = """
CREATE TABLE IF NOT EXISTS comments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    target        TEXT    NOT NULL,
    target_label  TEXT    DEFAULT '',
    parent_id     INTEGER DEFAULT 0,
    author_name   TEXT    NOT NULL,
    author_email  TEXT    DEFAULT '',
    author_website TEXT   DEFAULT '',
    author_ip     TEXT    DEFAULT '',
    visitor_id    TEXT    DEFAULT '',
    author_agent  TEXT    DEFAULT '',
    content       TEXT    NOT NULL,
    status        TEXT    NOT NULL DEFAULT 'pending',
    is_admin      INTEGER NOT NULL DEFAULT 0,
    likes         INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_comments_target  ON comments(target);
CREATE INDEX IF NOT EXISTS idx_comments_status  ON comments(status);
CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at);
CREATE INDEX IF NOT EXISTS idx_comments_parent  ON comments(parent_id);

CREATE TABLE IF NOT EXISTS comment_settings (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    payload    TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comment_likes (
    comment_id INTEGER NOT NULL,
    visitor_id TEXT    NOT NULL,
    created_at TEXT    NOT NULL,
    PRIMARY KEY (comment_id, visitor_id)
);
"""


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=15, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_schema() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with _write_lock:
        conn = _connect()
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(SCHEMA)
            conn.commit()
        finally:
            conn.close()


# 引擎启动时就把表建好，避免第一个请求去抢锁
_ensure_schema()


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# ---------------------------------------------------------
# ⚙️ 设置读写
# ---------------------------------------------------------
def get_settings() -> Dict[str, Any]:
    """读取当前评论设置，任何缺失字段都用默认值兜底。"""
    settings = dict(DEFAULT_SETTINGS)
    try:
        conn = _connect()
        try:
            row = conn.execute("SELECT payload FROM comment_settings WHERE id = 1").fetchone()
        finally:
            conn.close()
        if row:
            stored = json.loads(row["payload"])
            if isinstance(stored, dict):
                settings.update(stored)
    except Exception as exc:  # noqa: BLE001 - 设置读失败不能拖垮整个接口
        print(f"⚠️ 读取评论设置失败，使用默认值: {exc}")
    return settings


def save_settings(patch: Dict[str, Any]) -> Dict[str, Any]:
    """合并并保存设置，只接受白名单里的键。"""
    current = get_settings()
    for key in DEFAULT_SETTINGS:
        if key in patch:
            value = patch[key]
            if isinstance(DEFAULT_SETTINGS[key], bool):
                current[key] = bool(value)
            elif isinstance(DEFAULT_SETTINGS[key], int):
                try:
                    current[key] = max(1, min(MAX_CONTENT_LENGTH, int(value)))
                except (TypeError, ValueError):
                    continue
            else:
                current[key] = str(value)[:500]
    with _write_lock:
        conn = _connect()
        try:
            conn.execute(
                "INSERT INTO comment_settings (id, payload, updated_at) VALUES (1, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
                (json.dumps(current, ensure_ascii=False), _now()),
            )
            conn.commit()
        finally:
            conn.close()
    return current


# ---------------------------------------------------------
# 🛠️ 小工具
# ---------------------------------------------------------
def _client_ip(request: Request) -> str:
    """尽量拿到真实访客 IP。

    公开站没有反向代理，Next 的路由处理器拿不到 socket 地址，
    所以这里主要依赖反代补充的 x-forwarded-for / x-real-ip；
    都没有时返回空串，限流改用访客标识兜底。
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first[:64]
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()[:64]
    client = request.client
    if client and client.host and client.host not in ("127.0.0.1", "::1"):
        return client.host[:64]
    return ""


def _visitor_id(request: Request) -> str:
    """访客标识：浏览器本地生成并持久化，随请求带上。

    这是限流与后台溯源的主要依据（服务器直连时拿不到真实 IP），
    只存哈希值，不存原始标识。
    """
    token = request.headers.get("x-visitor-token") or ""
    token = token.strip()
    if not token:
        return ""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:24]


def _identity(request: Request) -> str:
    """限流用的身份键：优先访客标识，其次 IP。"""
    return _visitor_id(request) or _client_ip(request)


def _row_to_comment(row: sqlite3.Row, admin_view: bool = False) -> Dict[str, Any]:
    item: Dict[str, Any] = {
        "id": row["id"],
        "target": row["target"],
        "parent_id": row["parent_id"] or 0,
        "author_name": row["author_name"],
        "content": row["content"],
        "status": row["status"],
        "status_label": STATUS_LABELS.get(row["status"], row["status"]),
        "is_admin": bool(row["is_admin"]),
        "likes": row["likes"] or 0,
        "created_at": row["created_at"],
    }
    if admin_view:
        item.update(
            {
                "author_email": row["author_email"] or "",
                "author_website": row["author_website"] or "",
                "author_ip": row["author_ip"] or "",
                "visitor_id": row["visitor_id"] or "",
                "author_agent": row["author_agent"] or "",
                "target_label": row["target_label"] or "",
                "updated_at": row["updated_at"] or "",
            }
        )
    return item


def _clean_text(value: Any, limit: int) -> str:
    if value is None:
        return ""
    text = str(value).replace("\r\n", "\n").replace("\r", "\n").strip()
    return text[:limit]


def _check_rate_limit(identity: str) -> Optional[str]:
    """返回限流提示语；None 表示放行。"""
    if not identity:
        return None
    now = datetime.now()
    window_start = (now - timedelta(minutes=RATE_WINDOW_MINUTES)).strftime("%Y-%m-%d %H:%M:%S")
    hour_start = (now - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")
    conn = _connect()
    try:
        recent = conn.execute(
            "SELECT COUNT(*) AS c FROM comments WHERE visitor_id = ? AND created_at >= ?",
            (identity, window_start),
        ).fetchone()["c"]
        hourly = conn.execute(
            "SELECT COUNT(*) AS c FROM comments WHERE visitor_id = ? AND created_at >= ?",
            (identity, hour_start),
        ).fetchone()["c"]
    finally:
        conn.close()
    if recent >= RATE_LIMIT_WINDOW:
        return f"留言太频繁啦，{RATE_WINDOW_MINUTES} 分钟内最多发表 {RATE_LIMIT_WINDOW} 条"
    if hourly >= RATE_LIMIT_HOUR:
        return "留言太频繁啦，1 小时内最多发表 20 条，请稍后再试"
    return None


def _insert_comment(payload: Dict[str, Any]) -> int:
    with _write_lock:
        conn = _connect()
        try:
            cursor = conn.execute(
                "INSERT INTO comments (target, target_label, parent_id, author_name, author_email, "
                "author_website, author_ip, visitor_id, author_agent, content, status, is_admin, likes, created_at, updated_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    payload["target"],
                    payload.get("target_label", ""),
                    payload.get("parent_id", 0),
                    payload["author_name"],
                    payload.get("author_email", ""),
                    payload.get("author_website", ""),
                    payload.get("author_ip", ""),
                    payload.get("visitor_id", ""),
                    payload.get("author_agent", ""),
                    payload["content"],
                    payload.get("status", STATUS_PENDING),
                    1 if payload.get("is_admin") else 0,
                    0,
                    _now(),
                    "",
                ),
            )
            conn.commit()
            return int(cursor.lastrowid)
        finally:
            conn.close()


# =========================================================
# 🌐 公开接口（前台评论区用）
# =========================================================
@router.get("/list")
async def list_comments(
    target: str = "",
    page: int = 1,
    size: int = 20,
):
    """按主题拉取已发布的评论（顶层 + 回复）。"""
    settings = get_settings()
    if not settings.get("enabled", True):
        return {
            "success": True,
            "data": {"items": [], "total": 0, "page": 1, "size": size, "has_more": False},
            "settings": settings,
        }

    target = _clean_text(target, MAX_TARGET_LENGTH)
    if not target:
        return {"success": False, "message": "缺少评论主题标识"}

    page = max(1, int(page or 1))
    size = max(1, min(50, int(size or 20)))
    offset = (page - 1) * size

    conn = _connect()
    try:
        total = conn.execute(
            "SELECT COUNT(*) AS c FROM comments WHERE target = ? AND parent_id = 0 AND status = ?",
            (target, STATUS_APPROVED),
        ).fetchone()["c"]

        rows = conn.execute(
            "SELECT * FROM comments WHERE target = ? AND parent_id = 0 AND status = ? "
            "ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
            (target, STATUS_APPROVED, size, offset),
        ).fetchall()

        items = [_row_to_comment(row) for row in rows]

        if items:
            placeholders = ",".join("?" for _ in items)
            reply_rows = conn.execute(
                f"SELECT * FROM comments WHERE parent_id IN ({placeholders}) AND status = ? "
                "ORDER BY created_at ASC, id ASC",
                [item["id"] for item in items] + [STATUS_APPROVED],
            ).fetchall()
            grouped: Dict[int, List[Dict[str, Any]]] = {}
            for row in reply_rows:
                grouped.setdefault(row["parent_id"], []).append(_row_to_comment(row))
            for item in items:
                item["replies"] = grouped.get(item["id"], [])
    finally:
        conn.close()

    return {
        "success": True,
        "data": {
            "items": items,
            "total": total,
            "page": page,
            "size": size,
            "has_more": offset + len(items) < total,
        },
        "settings": settings,
    }


@router.get("/settings")
async def read_settings():
    """前台需要的评论设置。"""
    return {"success": True, "data": get_settings()}


@router.post("/create")
async def create_comment(request: Request):
    """访客发表留言。"""
    settings = get_settings()
    if not settings.get("enabled", True):
        return {"success": False, "message": "评论功能已关闭"}

    try:
        payload = await request.json()
    except Exception:
        return {"success": False, "message": "请求格式不正确"}
    if not isinstance(payload, dict):
        return {"success": False, "message": "请求格式不正确"}

    # 蜜罐字段：正常用户看不见，填了就是机器人
    if _clean_text(payload.get("hp"), 50):
        return {"success": True, "message": "留言已收到"}

    target = _clean_text(payload.get("target"), MAX_TARGET_LENGTH)
    if not target:
        return {"success": False, "message": "缺少评论主题标识"}

    name = _clean_text(payload.get("author_name"), MAX_NAME_LENGTH)
    if not name:
        return {"success": False, "message": "请填写昵称"}

    email = _clean_text(payload.get("author_email"), 120)
    if email and not EMAIL_PATTERN.match(email):
        return {"success": False, "message": "邮箱格式不正确"}

    # 关闭游客留言后，访客必须留下邮箱（本站没有账号体系，用邮箱做最低限度识别）
    if not settings.get("allowGuest", True) and not email:
        return {"success": False, "message": "本站已关闭匿名留言，请填写邮箱后再提交"}

    website = _clean_text(payload.get("author_website"), 200)
    if website and not re.match(r"^https?://", website, re.IGNORECASE):
        website = ""

    # 先按硬上限清洗，再按站点配置的字数上限判定。
    # ⚠️ 顺序很重要：若先按 max_length 截断，下面的超长判断就永远不成立，
    #    超长留言会被悄悄截断而不是被拒绝。
    max_length = min(int(settings.get("maxLength") or DEFAULT_SETTINGS["maxLength"]), MAX_CONTENT_LENGTH)
    content = _clean_text(payload.get("content"), MAX_CONTENT_LENGTH)
    if not content:
        return {"success": False, "message": "评论内容不能为空"}
    if len(content) > max_length:
        return {"success": False, "message": f"评论内容不能超过 {max_length} 字"}

    ip = _client_ip(request)
    visitor_id = _visitor_id(request)
    agent = _clean_text(request.headers.get("user-agent"), 300)
    limit_message = _check_rate_limit(_identity(request))
    if limit_message:
        return {"success": False, "message": limit_message}

    parent_id = 0
    raw_parent = payload.get("parent_id")
    if raw_parent:
        try:
            parent_id = int(raw_parent)
        except (TypeError, ValueError):
            parent_id = 0
    if parent_id:
        conn = _connect()
        try:
            parent = conn.execute(
                "SELECT id, target FROM comments WHERE id = ?", (parent_id,)
            ).fetchone()
        finally:
            conn.close()
        if not parent or parent["target"] != target:
            return {"success": False, "message": "回复的评论不存在"}

    status = STATUS_PENDING if settings.get("requireApproval") else STATUS_APPROVED
    comment_id = _insert_comment(
        {
            "target": target,
            "target_label": _clean_text(payload.get("target_label"), 200),
            "parent_id": parent_id,
            "author_name": name,
            "author_email": email,
            "author_website": website,
            "author_ip": ip,
            "visitor_id": visitor_id,
            "author_agent": agent,
            "content": content,
            "status": status,
            "is_admin": False,
        }
    )

    return {
        "success": True,
        "message": "留言已提交，等待站长审核后展示" if status == STATUS_PENDING else "留言已发布",
        "data": {"id": comment_id, "status": status},
    }


@router.post("/like")
async def like_comment(request: Request, payload: Dict[str, Any] = Body(...)):
    """给评论点赞。同一个访客对同一条评论只计一次。"""
    try:
        comment_id = int(payload.get("id") or 0)
    except (TypeError, ValueError):
        comment_id = 0
    if not comment_id:
        return {"success": False, "message": "缺少评论 ID"}

    if not get_settings().get("allowLike", True):
        return {"success": False, "message": "评论点赞已关闭"}

    visitor_id = _visitor_id(request)
    with _write_lock:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT likes, status FROM comments WHERE id = ?", (comment_id,)
            ).fetchone()
            if not row or row["status"] != STATUS_APPROVED:
                return {"success": False, "message": "评论不存在"}
            if visitor_id:
                existing = conn.execute(
                    "SELECT 1 FROM comment_likes WHERE comment_id = ? AND visitor_id = ?",
                    (comment_id, visitor_id),
                ).fetchone()
                if existing:
                    return {"success": True, "data": {"likes": row["likes"], "duplicated": True}}
                conn.execute(
                    "INSERT OR IGNORE INTO comment_likes (comment_id, visitor_id, created_at) VALUES (?,?,?)",
                    (comment_id, visitor_id, _now()),
                )
            conn.execute("UPDATE comments SET likes = likes + 1 WHERE id = ?", (comment_id,))
            conn.commit()
            updated = conn.execute("SELECT likes FROM comments WHERE id = ?", (comment_id,)).fetchone()
        finally:
            conn.close()
    return {"success": True, "data": {"likes": updated["likes"] if updated else 0, "duplicated": False}}


# =========================================================
# 🛠️ 后台接口（控制台「评论管理」页面用）
# =========================================================
@router.get("/admin/list")
async def admin_list(
    status: str = "",
    target: str = "",
    keyword: str = "",
    page: int = 1,
    size: int = 20,
    sort: str = "new",
):
    """列出评论（包含全部状态），后台审核用。"""
    page = max(1, int(page or 1))
    size = max(1, min(100, int(size or 20)))
    offset = (page - 1) * size

    where = ["1 = 1"]
    params: List[Any] = []
    if status in STATUSES:
        where.append("status = ?")
        params.append(status)
    target = _clean_text(target, MAX_TARGET_LENGTH)
    if target:
        where.append("target = ?")
        params.append(target)
    keyword = _clean_text(keyword, 100)
    if keyword:
        where.append("(content LIKE ? OR author_name LIKE ? OR author_email LIKE ? OR author_ip LIKE ?)")
        like = f"%{keyword}%"
        params.extend([like, like, like, like])

    clause = " AND ".join(where)
    order = {
        "new": "created_at DESC, id DESC",
        "old": "created_at ASC, id ASC",
        "likes": "likes DESC, created_at DESC",
    }.get(sort, "created_at DESC, id DESC")

    conn = _connect()
    try:
        total = conn.execute(f"SELECT COUNT(*) AS c FROM comments WHERE {clause}", params).fetchone()["c"]
        rows = conn.execute(
            f"SELECT * FROM comments WHERE {clause} ORDER BY {order} LIMIT ? OFFSET ?",
            params + [size, offset],
        ).fetchall()
        items = [_row_to_comment(row, admin_view=True) for row in rows]
        if items:
            placeholders = ",".join("?" for _ in items)
            counts = conn.execute(
                f"SELECT parent_id, COUNT(*) AS c FROM comments WHERE parent_id IN ({placeholders}) GROUP BY parent_id",
                [item["id"] for item in items],
            ).fetchall()
            reply_counts = {row["parent_id"]: row["c"] for row in counts}
            for item in items:
                item["reply_count"] = reply_counts.get(item["id"], 0)
    finally:
        conn.close()

    return {
        "success": True,
        "data": {
            "items": items,
            "total": total,
            "page": page,
            "size": size,
            "has_more": offset + len(items) < total,
        },
    }


@router.get("/admin/stats")
async def admin_stats():
    """后台概览统计。"""
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%d %H:%M:%S")
    week_start = (now - timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")

    conn = _connect()
    try:
        by_status = {row["status"]: row["c"] for row in conn.execute(
            "SELECT status, COUNT(*) AS c FROM comments GROUP BY status"
        ).fetchall()}
        total = conn.execute("SELECT COUNT(*) AS c FROM comments").fetchone()["c"]
        today = conn.execute(
            "SELECT COUNT(*) AS c FROM comments WHERE created_at >= ?", (today_start,)
        ).fetchone()["c"]
        week = conn.execute(
            "SELECT COUNT(*) AS c FROM comments WHERE created_at >= ?", (week_start,)
        ).fetchone()["c"]
        target_count = conn.execute(
            "SELECT COUNT(DISTINCT target) AS c FROM comments"
        ).fetchone()["c"]
    finally:
        conn.close()

    return {
        "success": True,
        "data": {
            "total": total,
            "pending": by_status.get(STATUS_PENDING, 0),
            "approved": by_status.get(STATUS_APPROVED, 0),
            "spam": by_status.get(STATUS_SPAM, 0),
            "hidden": by_status.get(STATUS_HIDDEN, 0),
            "today": today,
            "week": week,
            "targets": target_count,
        },
    }


@router.get("/admin/targets")
async def admin_targets():
    """所有出现过评论的主题，供后台筛选下拉使用。"""
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT target, COUNT(*) AS count, MAX(target_label) AS label, MAX(created_at) AS last_at "
            "FROM comments GROUP BY target ORDER BY count DESC, last_at DESC"
        ).fetchall()
    finally:
        conn.close()
    return {
        "success": True,
        "data": [
            {
                "target": row["target"],
                "count": row["count"],
                "label": row["label"] or "",
                "last_at": row["last_at"] or "",
            }
            for row in rows
        ],
    }


@router.get("/admin/settings")
async def admin_read_settings():
    return {"success": True, "data": get_settings()}


@router.post("/admin/settings")
async def admin_save_settings(payload: Dict[str, Any] = Body(...)):
    """保存评论设置，保存后前台立即生效（无需重新发布）。"""
    patch = payload.get("settings")
    if not isinstance(patch, dict):
        return {"success": False, "message": "设置格式不正确"}
    data = save_settings(patch)
    return {"success": True, "message": "评论设置已保存并生效", "data": data}


@router.post("/admin/reply")
async def admin_reply(payload: Dict[str, Any] = Body(...)):
    """站长回复某条评论，直接以管理员身份发布。"""
    try:
        parent_id = int(payload.get("parent_id") or 0)
    except (TypeError, ValueError):
        parent_id = 0
    if not parent_id:
        return {"success": False, "message": "缺少被回复的评论 ID"}

    content = _clean_text(payload.get("content"), MAX_CONTENT_LENGTH)
    if not content:
        return {"success": False, "message": "回复内容不能为空"}

    author_name = _clean_text(payload.get("author_name"), MAX_NAME_LENGTH) or "站长"

    conn = _connect()
    try:
        parent = conn.execute("SELECT id, target FROM comments WHERE id = ?", (parent_id,)).fetchone()
    finally:
        conn.close()
    if not parent:
        return {"success": False, "message": "被回复的评论不存在"}

    comment_id = _insert_comment(
        {
            "target": parent["target"],
            "target_label": _clean_text(payload.get("target_label"), 200),
            "parent_id": parent_id,
            "author_name": author_name,
            "author_email": "",
            "author_website": "",
            "author_ip": "",
            "author_agent": "console",
            "content": content,
            "status": STATUS_APPROVED,
            "is_admin": True,
        }
    )
    return {"success": True, "message": "回复已发布", "data": {"id": comment_id}}


@router.post("/admin/status")
async def admin_update_status(payload: Dict[str, Any] = Body(...)):
    """修改单条评论状态（通过 / 隐藏 / 垃圾）。"""
    status = str(payload.get("status") or "")
    if status not in STATUSES:
        return {"success": False, "message": "状态不合法"}

    ids = payload.get("ids")
    if not isinstance(ids, list):
        ids = [payload.get("id")]
    clean_ids = []
    for value in ids:
        try:
            clean_ids.append(int(value))
        except (TypeError, ValueError):
            continue
    if not clean_ids:
        return {"success": False, "message": "缺少评论 ID"}

    placeholders = ",".join("?" for _ in clean_ids)
    with _write_lock:
        conn = _connect()
        try:
            conn.execute(
                f"UPDATE comments SET status = ?, updated_at = ? WHERE id IN ({placeholders})",
                [status, _now()] + clean_ids,
            )
            conn.commit()
        finally:
            conn.close()
    return {"success": True, "message": f"已更新 {len(clean_ids)} 条评论的状态"}


@router.post("/admin/delete")
async def admin_delete(payload: Dict[str, Any] = Body(...)):
    """删除评论（连带删除它的回复）。"""
    ids = payload.get("ids")
    if not isinstance(ids, list):
        ids = [payload.get("id")]
    clean_ids = []
    for value in ids:
        try:
            clean_ids.append(int(value))
        except (TypeError, ValueError):
            continue
    if not clean_ids:
        return {"success": False, "message": "缺少评论 ID"}

    placeholders = ",".join("?" for _ in clean_ids)
    with _write_lock:
        conn = _connect()
        try:
            conn.execute(f"DELETE FROM comments WHERE id IN ({placeholders})", clean_ids)
            conn.execute(f"DELETE FROM comments WHERE parent_id IN ({placeholders})", clean_ids)
            conn.commit()
        finally:
            conn.close()
    return {"success": True, "message": f"已删除 {len(clean_ids)} 条评论"}


@router.post("/admin/bulk")
async def admin_bulk(payload: Dict[str, Any] = Body(...)):
    """批量操作：status（改状态）或 delete（删除）。"""
    action = str(payload.get("action") or "")
    ids = payload.get("ids")
    if not isinstance(ids, list):
        ids = []
    clean_ids = []
    for value in ids:
        try:
            clean_ids.append(int(value))
        except (TypeError, ValueError):
            continue
    if not clean_ids:
        return {"success": False, "message": "请先勾选要处理的评论"}

    if action == "delete":
        placeholders = ",".join("?" for _ in clean_ids)
        with _write_lock:
            conn = _connect()
            try:
                conn.execute(f"DELETE FROM comments WHERE id IN ({placeholders})", clean_ids)
                conn.execute(f"DELETE FROM comments WHERE parent_id IN ({placeholders})", clean_ids)
                conn.commit()
            finally:
                conn.close()
        return {"success": True, "message": f"已删除 {len(clean_ids)} 条评论"}

    status = str(payload.get("status") or "")
    if status not in STATUSES:
        return {"success": False, "message": "状态不合法"}
    placeholders = ",".join("?" for _ in clean_ids)
    with _write_lock:
        conn = _connect()
        try:
            conn.execute(
                f"UPDATE comments SET status = ?, updated_at = ? WHERE id IN ({placeholders})",
                [status, _now()] + clean_ids,
            )
            conn.commit()
        finally:
            conn.close()
    return {"success": True, "message": f"已批量处理 {len(clean_ids)} 条评论"}
