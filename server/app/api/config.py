"""站点配置。

以前配置是两份 siteConfig.ts（控制台一份、公开站一份），还有三套不同的解析器
（引擎的正则、公开站的 new Function、构建期快照），改一次要同步好几处。
现在整份配置存进数据库的一个 JSON 字段，两个前端都从后端读同一份。
"""

import json
from typing import Any, Dict

from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..helpers import now_stamp
from ..models import SiteConfig
from ..security import require_admin

router = APIRouter()

# 允许从控制台改的根字段，其余一律忽略，避免误写把站点改坏
VALID_ROOT_KEYS = {
    "title", "authorName", "bio", "avatarUrl", "useGradient", "themeColors",
    "bgImages", "defaultPostCover", "photoWallImage", "social",
    "counts", "chatterTitle", "chatterDescription",
    "danmakuList", "buildDate", "footerBadges",
    "icpConfig", "aiConfig", "geminiConfig",
    "faviconUrl",
    "navTitle",
    "navSuffix",
    "navAfter",
    "friendLinkApplyFormat",
    "bgGroups",
    "activeBgGroup",
}


def read_config(db: Session) -> Dict[str, Any]:
    row = db.query(SiteConfig).filter(SiteConfig.id == 1).first()
    if not row:
        return {}
    try:
        data = json.loads(row.payload or "{}")
    except (TypeError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def write_config(db: Session, payload: Dict[str, Any]) -> Dict[str, Any]:
    row = db.query(SiteConfig).filter(SiteConfig.id == 1).first()
    if not row:
        row = SiteConfig(id=1, payload="{}")
        db.add(row)
    row.payload = json.dumps(payload, ensure_ascii=False, indent=2)
    row.updated_at = now_stamp()
    db.commit()
    return payload


@router.get("")
@router.get("/get")
def get_site_config(db: Session = Depends(get_db)):
    return {"success": True, "data": read_config(db)}


@router.post("/update")
@router.put("")
def update_site_config(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db),
                       _: None = Depends(require_admin)):
    """更新站点配置。

    传 {"updates": {...}} 只改这几项；直接传 {...} 也按「要改的项」处理。
    """
    body = payload or {}
    updates = body.get("updates")
    if not isinstance(updates, dict):
        updates = {k: v for k, v in body.items() if k != "updates"}
    if not updates:
        return {"success": False, "message": "没有收到需要更新的数据"}

    current = read_config(db)
    changed = []
    skipped = []
    for key, value in updates.items():
        if key not in VALID_ROOT_KEYS:
            skipped.append(key)
            continue
        current[key] = value
        changed.append(key)
    write_config(db, current)
    return {
        "success": True,
        "message": "站点配置已保存到数据库",
        "changed": changed,
        "skipped": skipped,
        "data": current,
    }


@router.get("/public")
def get_public_config(db: Session = Depends(get_db)):
    """公开站用的配置：不含 aiConfig（里面有模型提示词，不该下发到浏览器）。"""
    data = read_config(db)
    data.pop("aiConfig", None)
    data.pop("geminiConfig", None)
    return {"success": True, "data": data}
