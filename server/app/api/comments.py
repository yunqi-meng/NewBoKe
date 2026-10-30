"""评论系统：前台发表、后台审核。

旧实现用的是裸 sqlite3 + 独立文件 data/comments.db，
这里改成统一数据库里的 comments / comment_likes 两张表，
跟文章、说说、配置放在同一个库里，备份和迁移都只需要照顾一个文件。
"""

import hashlib
import json
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy import case, func, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..helpers import now_stamp
from ..models import Comment, CommentLike, Setting
from ..security import require_admin

router = APIRouter()

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

SETTINGS_KEY = "comment_settings"

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


# ---------------------------------------------------------
# ⚙️ 设置读写
# ---------------------------------------------------------
def get_settings(db: Session) -> Dict[str, Any]:
    """读取当前评论设置，任何缺失字段都用默认值兜底。"""
    settings = dict(DEFAULT_SETTINGS)
    row = db.query(Setting).filter(Setting.key == SETTINGS_KEY).first()
    if row:
        try:
            stored = json.loads(row.payload or "{}")
        except (TypeError, ValueError):
            stored = {}
        if isinstance(stored, dict):
            for key, value in stored.items():
                if key in DEFAULT_SETTINGS:
                    settings[key] = value
    return settings


def save_settings(patch: Dict[str, Any], db: Session) -> Dict[str, Any]:
    """合并并保存设置，只接受白名单里的键。"""
    current = get_settings(db)
    for key in DEFAULT_SETTINGS:
        if key not in patch:
            continue
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

    row = db.query(Setting).filter(Setting.key == SETTINGS_KEY).first()
    if row is None:
        row = Setting(key=SETTINGS_KEY, payload="{}")
        db.add(row)
    row.payload = json.dumps(current, ensure_ascii=False)
    row.updated_at = now_stamp()
    db.commit()
    return current


# ---------------------------------------------------------
# 🛠️ 小工具
# ---------------------------------------------------------
def _client_ip(request: Request) -> str:
    """尽量拿到真实访客 IP。

    信任顺序与登录限流一致：x-real-ip（nginx 覆写，伪造不了）
    → x-forwarded-for 的最后一段（反代追加的才是真实来源）→ 直连地址。
    公开站没有反向代理时拿不到 socket 地址，限流改用访客标识兜底。
    """
    real_ip = request.headers.get("x-real-ip")
    if real_ip and real_ip.strip():
        return real_ip.strip()[:64]
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        last = forwarded.split(",")[-1].strip()
        if last:
            return last[:64]
    client = request.client
    if client and client.host and client.host not in ("127.0.0.1", "::1"):
        return client.host[:64]
    return ""


def _visitor_id(request: Request) -> str:
    """访客标识：浏览器本地生成并持久化，随请求带上。

    这是限流与后台溯源的主要依据（服务器直连时拿不到真实 IP），
    只存哈希值，不存原始标识。
    """
    token = (request.headers.get("x-visitor-token") or "").strip()
    if not token:
        return ""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:24]


def _identity(request: Request) -> str:
    """限流用的身份键：优先访客标识，其次 IP。"""
    return _visitor_id(request) or _client_ip(request)


def _row_to_comment(row: Comment, admin_view: bool = False) -> Dict[str, Any]:
    item: Dict[str, Any] = {
        "id": row.id,
        "target": row.target,
        "parent_id": row.parent_id or 0,
        "author_name": row.author_name,
        "content": row.content,
        "status": row.status,
        "status_label": STATUS_LABELS.get(row.status, row.status),
        "is_admin": bool(row.is_admin),
        "likes": row.likes or 0,
        "created_at": row.created_at,
    }
    if admin_view:
        item.update(
            {
                "author_email": row.author_email or "",
                "author_website": row.author_website or "",
                "author_ip": row.author_ip or "",
                "visitor_id": row.visitor_id or "",
                "author_agent": row.author_agent or "",
                "target_label": row.target_label or "",
                "updated_at": row.updated_at or "",
            }
        )
    return item


def _clean_text(value: Any, limit: int) -> str:
    if value is None:
        return ""
    text = str(value).replace("\r\n", "\n").replace("\r", "\n").strip()
    return text[:limit]


def _check_rate_limit(identity: str, db: Session) -> Optional[str]:
    """返回限流提示语；None 表示放行。"""
    if not identity:
        return None
    now = datetime.now()
    window_start = (now - timedelta(minutes=RATE_WINDOW_MINUTES)).strftime("%Y-%m-%d %H:%M:%S")
    hour_start = (now - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")
    # 两个窗口一条查询搞定：访客刚发完一条时，这里跟着插入一起走，越快越好
    recent, hourly = (
        db.query(
            func.sum(case((Comment.created_at >= window_start, 1), else_=0)),
            func.sum(case((Comment.created_at >= hour_start, 1), else_=0)),
        )
        .filter(Comment.visitor_id == identity)
        .one()
    )
    if int(recent or 0) >= RATE_LIMIT_WINDOW:
        return f"留言太频繁啦，{RATE_WINDOW_MINUTES} 分钟内最多发表 {RATE_LIMIT_WINDOW} 条"
    if int(hourly or 0) >= RATE_LIMIT_HOUR:
        return "留言太频繁啦，1 小时内最多发表 20 条，请稍后再试"
    return None


def _insert_comment(payload: Dict[str, Any], db: Session) -> int:
    row = Comment(
        target=payload["target"],
        target_label=payload.get("target_label", ""),
        parent_id=payload.get("parent_id", 0),
        author_name=payload["author_name"],
        author_email=payload.get("author_email", ""),
        author_website=payload.get("author_website", ""),
        author_ip=payload.get("author_ip", ""),
        visitor_id=payload.get("visitor_id", ""),
        author_agent=payload.get("author_agent", ""),
        content=payload["content"],
        status=payload.get("status", STATUS_PENDING),
        is_admin=bool(payload.get("is_admin")),
        likes=0,
        created_at=now_stamp(),
        updated_at="",
    )
    db.add(row)
    db.commit()
    return int(row.id)


# =========================================================
# 🌐 公开接口（前台评论区用）
# =========================================================
@router.get("/list")
def list_comments(
    target: str = "",
    page: int = 1,
    size: int = 20,
    db: Session = Depends(get_db),
):
    """按主题拉取已发布的评论（顶层 + 回复）。"""
    settings = get_settings(db)
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

    base = db.query(Comment).filter(Comment.target == target, Comment.parent_id == 0)
    total = base.filter(Comment.status == STATUS_APPROVED).count()
    rows = (
        base.filter(Comment.status == STATUS_APPROVED)
        .order_by(Comment.created_at.desc(), Comment.id.desc())
        .limit(size)
        .offset(offset)
        .all()
    )

    items = [_row_to_comment(row) for row in rows]
    if items:
        ids = [item["id"] for item in items]
        reply_rows = (
            db.query(Comment)
            .filter(Comment.parent_id.in_(ids), Comment.status == STATUS_APPROVED)
            .order_by(Comment.created_at.asc(), Comment.id.asc())
            .all()
        )
        grouped: Dict[int, List[Dict[str, Any]]] = {}
        for row in reply_rows:
            grouped.setdefault(row.parent_id, []).append(_row_to_comment(row))
        for item in items:
            item["replies"] = grouped.get(item["id"], [])

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
def read_settings(db: Session = Depends(get_db)):
    """前台需要的评论设置。"""
    return {"success": True, "data": get_settings(db)}


@router.post("/create")
def create_comment(request: Request, payload: Dict[str, Any] = Body(...),
                   db: Session = Depends(get_db)):
    """访客发表留言。

    同步 def：里面全是数据库读写，交给线程池执行，不占事件循环。
    """
    settings = get_settings(db)
    if not settings.get("enabled", True):
        return {"success": False, "message": "评论功能已关闭"}

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

    limit_message = _check_rate_limit(_identity(request), db)
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
        parent = db.query(Comment).filter(Comment.id == parent_id).first()
        if not parent or parent.target != target:
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
            "author_ip": _client_ip(request),
            "visitor_id": _visitor_id(request),
            "author_agent": _clean_text(request.headers.get("user-agent"), 300),
            "content": content,
            "status": status,
            "is_admin": False,
        },
        db,
    )

    return {
        "success": True,
        "message": "留言已提交，等待站长审核后展示" if status == STATUS_PENDING else "留言已发布",
        "data": {"id": comment_id, "status": status},
    }


@router.post("/like")
def like_comment(request: Request, payload: Dict[str, Any] = Body(...),
                 db: Session = Depends(get_db)):
    """给评论点赞。同一个访客对同一条评论只计一次。"""
    try:
        comment_id = int(payload.get("id") or 0)
    except (TypeError, ValueError):
        comment_id = 0
    if not comment_id:
        return {"success": False, "message": "缺少评论 ID"}

    if not get_settings(db).get("allowLike", True):
        return {"success": False, "message": "评论点赞已关闭"}

    visitor_id = _visitor_id(request)
    row = db.query(Comment).filter(Comment.id == comment_id).first()
    if not row or row.status != STATUS_APPROVED:
        return {"success": False, "message": "评论不存在"}

    if visitor_id:
        existing = db.query(CommentLike).filter(
            CommentLike.comment_id == comment_id, CommentLike.visitor_id == visitor_id
        ).first()
        if existing:
            return {"success": True, "data": {"likes": row.likes, "duplicated": True}}
        db.add(CommentLike(comment_id=comment_id, visitor_id=visitor_id, created_at=now_stamp()))
        try:
            db.flush()
        except IntegrityError:
            # 两个请求同时点赞：主键冲突说明已经计过了，按重复处理
            db.rollback()
            fresh = db.query(Comment).filter(Comment.id == comment_id).first()
            return {"success": True, "data": {"likes": fresh.likes if fresh else 0, "duplicated": True}}

    # 原子自增：读-改-写换成一条 UPDATE，并发下计数不会丢；
    # synchronize_session="fetch" 让随后读回的就是加完后的新值
    db.execute(
        update(Comment)
        .where(Comment.id == comment_id)
        .values(likes=Comment.likes + 1)
        .execution_options(synchronize_session="fetch")
    )
    db.commit()
    fresh = db.query(Comment).filter(Comment.id == comment_id).first()
    return {"success": True, "data": {"likes": fresh.likes if fresh else 0, "duplicated": False}}


# =========================================================
# 🛠️ 后台接口（控制台「评论管理」页面用）
# =========================================================
@router.get("/admin/list")
def admin_list(
    status: str = "",
    target: str = "",
    keyword: str = "",
    page: int = 1,
    size: int = 20,
    sort: str = "new",
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    """列出评论（包含全部状态），后台审核用。"""
    page = max(1, int(page or 1))
    size = max(1, min(100, int(size or 20)))
    offset = (page - 1) * size

    query = db.query(Comment)
    if status in STATUSES:
        query = query.filter(Comment.status == status)
    target = _clean_text(target, MAX_TARGET_LENGTH)
    if target:
        query = query.filter(Comment.target == target)
    keyword = _clean_text(keyword, 100)
    if keyword:
        like = f"%{keyword}%"
        query = query.filter(
            Comment.content.like(like)
            | Comment.author_name.like(like)
            | Comment.author_email.like(like)
            | Comment.author_ip.like(like)
        )

    total = query.count()
    if sort == "old":
        rows = query.order_by(Comment.created_at.asc(), Comment.id.asc()).limit(size).offset(offset).all()
    elif sort == "likes":
        rows = query.order_by(Comment.likes.desc(), Comment.created_at.desc()).limit(size).offset(offset).all()
    else:
        rows = query.order_by(Comment.created_at.desc(), Comment.id.desc()).limit(size).offset(offset).all()

    items = [_row_to_comment(row, admin_view=True) for row in rows]
    if items:
        ids = [item["id"] for item in items]
        # 只取分组计数，不把回复整行读出来
        count_rows = (
            db.query(Comment.parent_id, func.count(Comment.id))
            .filter(Comment.parent_id.in_(ids))
            .group_by(Comment.parent_id)
            .all()
        )
        counts: Dict[int, int] = {parent_id: count for parent_id, count in count_rows}
        for item in items:
            item["reply_count"] = counts.get(item["id"], 0)

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
def admin_stats(db: Session = Depends(get_db), _: None = Depends(require_admin)):
    """后台概览统计。"""
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%d %H:%M:%S")
    week_start = (now - timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")

    by_status = {
        row[0]: row[1]
        for row in db.query(Comment.status, func.count(Comment.id)).group_by(Comment.status).all()
    }
    # 各状态之和就是总数；今天的、近 7 天的、去重主题数合成一条查询
    total = sum(by_status.values())
    today, week, targets = (
        db.query(
            func.sum(case((Comment.created_at >= today_start, 1), else_=0)),
            func.sum(case((Comment.created_at >= week_start, 1), else_=0)),
            func.count(func.distinct(Comment.target)),
        )
        .one()
    )

    return {
        "success": True,
        "data": {
            "total": total,
            "pending": by_status.get(STATUS_PENDING, 0),
            "approved": by_status.get(STATUS_APPROVED, 0),
            "spam": by_status.get(STATUS_SPAM, 0),
            "hidden": by_status.get(STATUS_HIDDEN, 0),
            "today": int(today or 0),
            "week": int(week or 0),
            "targets": int(targets or 0),
        },
    }


@router.get("/admin/targets")
def admin_targets(db: Session = Depends(get_db), _: None = Depends(require_admin)):
    """所有出现过评论的主题，供后台筛选下拉使用。"""
    rows = (
        db.query(
            Comment.target,
            func.count(Comment.id),
            func.max(Comment.target_label),
            func.max(Comment.created_at),
        )
        .group_by(Comment.target)
        .order_by(func.count(Comment.id).desc(), func.max(Comment.created_at).desc())
        .all()
    )
    return {
        "success": True,
        "data": [
            {
                "target": row[0],
                "count": row[1],
                "label": row[2] or "",
                "last_at": row[3] or "",
            }
            for row in rows
        ],
    }


@router.get("/admin/settings")
def admin_read_settings(db: Session = Depends(get_db), _: None = Depends(require_admin)):
    return {"success": True, "data": get_settings(db)}


@router.post("/admin/settings")
def admin_save_settings(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db),
                        _: None = Depends(require_admin)):
    """保存评论设置，保存后前台立即生效（无需重新发布）。"""
    patch = payload.get("settings")
    if not isinstance(patch, dict):
        return {"success": False, "message": "设置格式不正确"}
    data = save_settings(patch, db)
    return {"success": True, "message": "评论设置已保存并生效", "data": data}


@router.post("/admin/reply")
def admin_reply(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db),
                _: None = Depends(require_admin)):
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

    parent = db.query(Comment).filter(Comment.id == parent_id).first()
    if not parent:
        return {"success": False, "message": "被回复的评论不存在"}

    comment_id = _insert_comment(
        {
            "target": parent.target,
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
        },
        db,
    )
    return {"success": True, "message": "回复已发布", "data": {"id": comment_id}}


@router.post("/admin/status")
def admin_update_status(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db),
                        _: None = Depends(require_admin)):
    """修改单条评论状态（通过 / 隐藏 / 垃圾）。"""
    status = str(payload.get("status") or "")
    if status not in STATUSES:
        return {"success": False, "message": "状态不合法"}

    clean_ids = _clean_ids(payload)
    if not clean_ids:
        return {"success": False, "message": "缺少评论 ID"}

    db.query(Comment).filter(Comment.id.in_(clean_ids)).update(
        {Comment.status: status, Comment.updated_at: now_stamp()}, synchronize_session=False
    )
    db.commit()
    return {"success": True, "message": f"已更新 {len(clean_ids)} 条评论的状态"}


@router.post("/admin/delete")
def admin_delete(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db),
                 _: None = Depends(require_admin)):
    """删除评论（连带删除它的回复）。"""
    clean_ids = _clean_ids(payload)
    if not clean_ids:
        return {"success": False, "message": "缺少评论 ID"}

    db.query(Comment).filter(Comment.parent_id.in_(clean_ids)).delete(synchronize_session=False)
    db.query(CommentLike).filter(CommentLike.comment_id.in_(clean_ids)).delete(synchronize_session=False)
    db.query(Comment).filter(Comment.id.in_(clean_ids)).delete(synchronize_session=False)
    db.commit()
    return {"success": True, "message": f"已删除 {len(clean_ids)} 条评论"}


@router.post("/admin/bulk")
def admin_bulk(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db),
               _: None = Depends(require_admin)):
    """批量操作：status（改状态）或 delete（删除）。"""
    action = str(payload.get("action") or "")
    clean_ids = _clean_ids(payload)
    if not clean_ids:
        return {"success": False, "message": "请先勾选要处理的评论"}

    if action == "delete":
        db.query(Comment).filter(Comment.parent_id.in_(clean_ids)).delete(synchronize_session=False)
        db.query(CommentLike).filter(CommentLike.comment_id.in_(clean_ids)).delete(synchronize_session=False)
        db.query(Comment).filter(Comment.id.in_(clean_ids)).delete(synchronize_session=False)
        db.commit()
        return {"success": True, "message": f"已删除 {len(clean_ids)} 条评论"}

    status = str(payload.get("status") or "")
    if status not in STATUSES:
        return {"success": False, "message": "状态不合法"}
    db.query(Comment).filter(Comment.id.in_(clean_ids)).update(
        {Comment.status: status, Comment.updated_at: now_stamp()}, synchronize_session=False
    )
    db.commit()
    return {"success": True, "message": f"已批量处理 {len(clean_ids)} 条评论"}


def _clean_ids(payload: Dict[str, Any]) -> List[int]:
    ids = payload.get("ids")
    if not isinstance(ids, list):
        ids = [payload.get("id")]
    clean_ids = []
    for value in ids:
        try:
            clean_ids.append(int(value))
        except (TypeError, ValueError):
            continue
    return clean_ids
