"""文章 / 杂谈 / 关于页 / 说说。

这四类内容以前散落在 posts/、chatters/、app/about/about.md、moments/ 四个目录里，
现在统一落在数据库的 articles 与 moments 两张表。
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..helpers import article_to_dict, dumps_list, loads_list, moment_to_dict, now_stamp
from ..models import Article, Moment
from ..security import require_admin

router = APIRouter()


# ------------------------------------------------------------------ 文章
@router.get("/articles")
def list_articles(
    type: Optional[str] = Query(default=None, description="post | chatter | about"),
    include_content: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    """文章列表。默认不返回正文，列表页只要元信息。"""
    query = db.query(Article)
    if type:
        query = query.filter(Article.type == type)
    rows = query.order_by(Article.date.desc(), Article.id.desc()).all()
    return {
        "success": True,
        "articles": [article_to_dict(row, include_content) for row in rows],
        "count": len(rows),
    }


@router.get("/articles/{slug}")
def get_article(slug: str, db: Session = Depends(get_db)):
    row = db.query(Article).filter(Article.slug == slug).first()
    if not row:
        return {"success": False, "message": "内容不存在"}
    return {"success": True, "article": article_to_dict(row)}


@router.post("/articles")
def upsert_article(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db),
                   _: None = Depends(require_admin)):
    """新增或更新一篇文章（slug 相同即覆盖）。"""
    slug = str(payload.get("slug") or payload.get("id") or "").strip()
    if not slug:
        return {"success": False, "message": "缺少 slug"}
    doc_type = str(payload.get("type") or "post").strip()
    if doc_type not in ("post", "chatter", "about"):
        return {"success": False, "message": f"不支持的内容类型：{doc_type}"}

    row = db.query(Article).filter(Article.slug == slug).first()
    created = row is None
    if created:
        row = Article(slug=slug, type=doc_type, created_at=now_stamp())
        db.add(row)
    row.type = doc_type
    row.title = str(payload.get("title", "") or "")
    row.description = str(payload.get("description", "") or "")
    row.content = str(payload.get("content", "") or "")
    row.cover = str(payload.get("cover", "") or "")
    row.tags = dumps_list(payload.get("tags", []))
    row.mood = str(payload.get("mood", "") or "")
    row.date = str(payload.get("date", "") or row.date or now_stamp())
    row.updated_at = now_stamp()
    db.commit()
    return {
        "success": True,
        "message": "内容已保存到数据库",
        "id": row.slug,
        "article": article_to_dict(row),
        "created": created,
    }


@router.delete("/articles/{slug}")
def delete_article(slug: str, db: Session = Depends(get_db),
                   _: None = Depends(require_admin)):
    row = db.query(Article).filter(Article.slug == slug).first()
    if not row:
        return {"success": False, "message": "内容不存在"}
    db.delete(row)
    db.commit()
    return {"success": True, "message": "内容已删除"}


@router.get("/about")
def get_about(db: Session = Depends(get_db)):
    row = db.query(Article).filter(Article.type == "about").first()
    if not row:
        return {"success": True, "about": None}
    return {"success": True, "about": article_to_dict(row)}


@router.put("/about")
def put_about(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db),
              _: None = Depends(require_admin)):
    payload = dict(payload)
    payload.setdefault("slug", "about")
    payload["type"] = "about"
    return upsert_article(payload, db)


# ------------------------------------------------------------------ 说说
@router.get("/moments")
def list_moments(db: Session = Depends(get_db)):
    rows = db.query(Moment).order_by(Moment.date.desc(), Moment.id.desc()).all()
    return {"success": True, "moments": [moment_to_dict(row) for row in rows], "count": len(rows)}


@router.post("/moments")
def save_moment(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db),
                _: None = Depends(require_admin)):
    moment_id = str(payload.get("id") or "").strip()
    if not moment_id:
        return {"success": False, "message": "缺少说说 id"}
    row = db.query(Moment).filter(Moment.id == moment_id).first()
    if row is None:
        row = Moment(id=moment_id, created_at=now_stamp())
        db.add(row)
    row.date = str(payload.get("date", "") or row.date or now_stamp())
    row.content = str(payload.get("content", "") or "")
    row.location = str(payload.get("location", "") or "")
    row.images = dumps_list(payload.get("images", []))
    db.commit()
    return {"success": True, "message": "说说已保存", "moment": moment_to_dict(row)}


@router.delete("/moments/{moment_id}")
def delete_moment(moment_id: str, db: Session = Depends(get_db),
                  _: None = Depends(require_admin)):
    row = db.query(Moment).filter(Moment.id == moment_id).first()
    if not row:
        return {"success": False, "message": "说说不存在"}
    db.delete(row)
    db.commit()
    return {"success": True, "message": "说说已删除"}


# ------------------------------------------------------- 兼容旧控制台的别名
@router.get("/tags")
def all_tags(db: Session = Depends(get_db)):
    """历史上用过的标签（编辑器补全用）。"""
    post_tags = set()
    chatter_tags = set()
    for row in db.query(Article).all():
        if row.type == "post":
            target = post_tags
        elif row.type == "chatter":
            target = chatter_tags
        else:
            # 关于页不参与标签补全
            continue
        for tag in loads_list(row.tags):
            target.add(str(tag))
    return {
        "success": True,
        "postTags": sorted(post_tags),
        "chatterTags": sorted(chatter_tags),
    }


def article_payload_list(articles: List[dict]) -> List[dict]:
    return articles
