"""草稿箱。

草稿是「还没发布」的内容，以前是 manager_data/drafts/<id>.json，
现在存进数据库的 drafts 表。
"""

import time
from typing import Any, Dict

from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..helpers import dumps_list, loads_list
from ..markdown import editor_html_to_markdown, markdown_to_editor_html
from ..models import Article, Draft
from ..security import require_admin

router = APIRouter()


def draft_to_dict(row: Draft, include_content: bool = True) -> dict:
    data = {
        "id": row.id,
        "type": row.type,
        "title": row.title,
        "description": row.description,
        "cover": row.cover,
        "tags": loads_list(row.tags),
        "mood": row.mood,
        "date": row.date,
        "lastModified": row.last_modified,
    }
    if include_content:
        data["content"] = row.content
    else:
        data["contentPreview"] = (row.content or "")[:100]
    return data


@router.get("")
@router.post("/list")
def list_drafts(db: Session = Depends(get_db)):
    rows = db.query(Draft).order_by(Draft.last_modified.desc()).all()
    return {"success": True, "drafts": [draft_to_dict(row, False) for row in rows]}


@router.post("/save")
@router.post("")
def save_draft(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db),
               _: None = Depends(require_admin)):
    draft_id = str(payload.get("id") or "").strip()
    if not draft_id or draft_id == "new":
        draft_id = f"draft_{int(time.time() * 1000)}"
    if payload.get("type") == "about":
        draft_id = "about"

    row = db.query(Draft).filter(Draft.id == draft_id).first()
    if row is None:
        row = Draft(id=draft_id)
        db.add(row)
    row.type = str(payload.get("type") or "post")
    row.title = str(payload.get("title", "") or "")
    row.description = str(payload.get("description", "") or "")
    row.content = str(payload.get("content", "") or "")
    row.cover = str(payload.get("cover", "") or "")
    row.tags = dumps_list(payload.get("tags", []))
    row.mood = str(payload.get("mood", "") or "")
    row.date = str(payload.get("date", "") or "")
    row.last_modified = int(time.time() * 1000)
    db.commit()
    return {"success": True, "message": "草稿已保存", "id": draft_id}


@router.post("/get")
def get_draft_by_body(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    """读草稿；草稿不存在时回落到已发布的内容（文章 / 杂谈 / 关于页）。"""
    return _load_draft(str(payload.get("id") or "").strip(), db)


@router.get("/{draft_id}")
def get_draft(draft_id: str, db: Session = Depends(get_db)):
    return _load_draft(draft_id, db)


def _load_draft(draft_id: str, db: Session) -> dict:
    row = db.query(Draft).filter(Draft.id == draft_id).first()
    if row:
        return {"success": True, "draft": draft_to_dict(row)}

    doc_type = "post"
    if draft_id == "about":
        doc_type = "about"
    elif db.query(Article).filter(Article.slug == draft_id, Article.type == "chatter").first():
        doc_type = "chatter"

    article = db.query(Article).filter(Article.slug == draft_id).first()
    if not article:
        return {"success": False, "message": "未找到相关内容"}
    return {
        "success": True,
        "draft": {
            "id": article.slug,
            "type": doc_type,
            "title": article.title,
            "content": markdown_to_editor_html(article.content),
            "tags": loads_list(article.tags),
            "cover": article.cover,
            "description": article.description,
            "mood": article.mood,
            "date": article.date,
        },
    }


@router.post("/delete")
def delete_draft_by_body(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db),
                         _: None = Depends(require_admin)):
    """删草稿；同名文章 / 杂谈也一并删除（与旧接口行为一致）。"""
    return _delete_draft(str(payload.get("id") or "").strip(), db)


@router.delete("/{draft_id}")
def delete_draft(draft_id: str, db: Session = Depends(get_db),
                 _: None = Depends(require_admin)):
    return _delete_draft(draft_id, db)


def _delete_draft(draft_id: str, db: Session) -> dict:
    removed = 0
    row = db.query(Draft).filter(Draft.id == draft_id).first()
    if row:
        db.delete(row)
        removed += 1
    article = db.query(Article).filter(Article.slug == draft_id).first()
    if article:
        db.delete(article)
        removed += 1
    db.commit()
    if removed:
        return {"success": True, "message": "已删除相关内容"}
    return {"success": False, "message": "未找到相关内容"}


@router.post("/sync_local")
@router.post("/publish")
def publish_draft(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db),
                   _: None = Depends(require_admin)):
    """把编辑器里的内容正式发布成文章 / 杂谈 / 关于页。"""
    operations = payload.get("operations")
    if not operations:
        operations = [{"type": "publish_article", "value": payload}]

    results = []
    for operation in operations:
        if operation.get("type") not in ("publish_article", "publish"):
            continue
        data = operation.get("value", operation)
        doc_type = data.get("type", "post")
        doc_id = str(data.get("id") or "").strip()
        if not doc_id or doc_id == "new":
            doc_id = f"{doc_type}_{int(time.time())}"
        if doc_type == "about":
            doc_id = "about"

        markdown = editor_html_to_markdown(data.get("content", ""))
        date = str(data.get("date", "")).strip()
        if not date:
            date = time.strftime("%Y-%m-%d %H:%M:%S")
        elif len(date) <= 10:
            date = f"{date} {time.strftime('%H:%M:%S')}"

        row = db.query(Article).filter(Article.slug == doc_id).first()
        created = row is None
        if created:
            row = Article(slug=doc_id, type=doc_type, created_at=time.strftime("%Y-%m-%d %H:%M:%S"))
            db.add(row)
        row.type = doc_type
        row.title = str(data.get("title", "") or "")
        row.description = str(data.get("description", "") or "")
        row.content = markdown
        row.cover = str(data.get("cover", "") or "")
        row.tags = dumps_list(data.get("tags", []))
        row.mood = str(data.get("mood", "") or "")
        row.date = date
        row.updated_at = time.strftime("%Y-%m-%d %H:%M:%S")

        draft = db.query(Draft).filter(Draft.id == str(data.get("id") or "")).first()
        if draft:
            db.delete(draft)
        results.append(f"✅ 已发布: {row.title or doc_id}")

    db.commit()
    return {"success": True, "message": "\n".join(results) or "没有需要发布的内容"}
