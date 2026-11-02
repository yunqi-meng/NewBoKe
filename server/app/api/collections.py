"""相册、友链、项目矩阵。

控制台原来是「整份覆盖」的写法（gallery/sync 之类的接口一次传全量），
这里既保留这种批量写法，也补上单条增删改，改起来更顺手。
"""

from typing import Any, Dict, List

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..helpers import dumps_list, loads_list
from ..models import Album, AlbumPhoto, Friend, Project
from ..security import require_admin

albums_router = APIRouter()
friends_router = APIRouter()
projects_router = APIRouter()


def _sync_items(payload: dict, key: str) -> List[dict]:
    """删除旧数据之前验证整份输入；只有显式空数组才能清空集合。"""
    if key in payload:
        items = payload[key]
    elif payload.get("id"):
        items = [payload]
    else:
        raise HTTPException(status_code=422, detail=f"缺少 {key} 数组")
    if not isinstance(items, list) or any(not isinstance(item, dict) for item in items):
        raise HTTPException(status_code=422, detail=f"{key} 必须是对象数组")
    prefix = {"albums": "album", "friends": "friend", "projects": "project"}[key]
    ids = [str(item.get("id") or f"{prefix}-{index}") for index, item in enumerate(items)]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=422, detail="存在重复的 ID")
    if key == "albums":
        for item in items:
            photos = item.get("photos")
            if photos is None:
                photos = []
            if not isinstance(photos, list) or any(not isinstance(photo, dict) for photo in photos):
                raise HTTPException(status_code=422, detail="photos 必须是对象数组")
    return items


# ------------------------------------------------------------------ 相册
def album_to_dict(album: Album) -> dict:
    return {
        "id": album.id,
        "title": album.title,
        "description": album.description,
        "cover": album.cover,
        "date": album.date,
        "photos": [
            {"url": photo.url, "caption": photo.caption} for photo in album.photos
        ],
    }


@albums_router.get("/list")
@albums_router.get("")
def list_albums(db: Session = Depends(get_db)):
    # 照片一次性预取：否则每个相册都会再查一次 album_photos（N+1）
    rows = (
        db.query(Album)
        .options(selectinload(Album.photos))
        .order_by(Album.sort_order, Album.id)
        .all()
    )
    albums = [album_to_dict(row) for row in rows]
    return {"success": True, "albums": albums, "count": len(albums)}


@albums_router.post("/sync")
@albums_router.post("")
def sync_albums(payload: Dict[str, Any] = Body(default={}), db: Session = Depends(get_db),
                _: None = Depends(require_admin)):
    """整份覆盖相册。传单本相册对象时也可以（自动包一层）。"""
    items = _sync_items(payload, "albums")
    db.query(AlbumPhoto).delete()
    db.query(Album).delete()
    for index, item in enumerate(items):
        album = Album(
            id=str(item.get("id") or f"album-{index}"),
            title=str(item.get("title", "") or ""),
            description=str(item.get("description", "") or ""),
            cover=str(item.get("cover", "") or ""),
            date=str(item.get("date", "") or ""),
            sort_order=index,
        )
        db.add(album)
        for photo_index, photo in enumerate(item.get("photos", []) or []):
            db.add(
                AlbumPhoto(
                    album_id=album.id,
                    url=str(photo.get("url", "") or ""),
                    caption=str(photo.get("caption", "") or ""),
                    sort_order=photo_index,
                )
            )
    db.commit()
    return {"success": True, "message": "相册已保存", "count": len(items)}


@albums_router.delete("/{album_id}")
def delete_album(album_id: str, db: Session = Depends(get_db),
                 _: None = Depends(require_admin)):
    row = db.query(Album).filter(Album.id == album_id).first()
    if not row:
        return {"success": False, "message": "相册不存在"}
    db.delete(row)
    db.commit()
    return {"success": True, "message": "相册已删除"}


# ------------------------------------------------------------------ 友链
def friend_to_dict(row: Friend) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "url": row.url,
        "description": row.description,
        "avatar": row.avatar,
        "themeColor": row.theme_color,
    }


@friends_router.get("/list")
@friends_router.get("")
def list_friends(db: Session = Depends(get_db)):
    rows = db.query(Friend).order_by(Friend.sort_order, Friend.id).all()
    friends = [friend_to_dict(row) for row in rows]
    return {"success": True, "friends": friends, "count": len(friends)}


@friends_router.post("/sync")
@friends_router.post("")
def sync_friends(payload: Dict[str, Any] = Body(default={}), db: Session = Depends(get_db),
                 _: None = Depends(require_admin)):
    items = _sync_items(payload, "friends")
    db.query(Friend).delete()
    for index, item in enumerate(items):
        db.add(
            Friend(
                id=str(item.get("id") or f"friend-{index}"),
                name=str(item.get("name", "") or ""),
                url=str(item.get("url", "") or ""),
                description=str(item.get("description", "") or ""),
                avatar=str(item.get("avatar", "") or ""),
                theme_color=str(item.get("themeColor", item.get("theme_color", "")) or ""),
                sort_order=index,
            )
        )
    db.commit()
    return {"success": True, "message": "友链已保存", "count": len(items)}


@friends_router.delete("/{friend_id}")
def delete_friend(friend_id: str, db: Session = Depends(get_db),
                  _: None = Depends(require_admin)):
    row = db.query(Friend).filter(Friend.id == friend_id).first()
    if not row:
        return {"success": False, "message": "友链不存在"}
    db.delete(row)
    db.commit()
    return {"success": True, "message": "友链已删除"}


# ------------------------------------------------------------------ 项目
def project_to_dict(row: Project) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "icon": row.icon,
        "githubUrl": row.github_url,
        "tags": loads_list(row.tags),
    }


@projects_router.get("/list")
@projects_router.get("")
def list_projects(db: Session = Depends(get_db)):
    rows = db.query(Project).order_by(Project.sort_order, Project.id).all()
    projects = [project_to_dict(row) for row in rows]
    return {"success": True, "projects": projects, "count": len(projects)}


@projects_router.post("/sync")
@projects_router.post("")
def sync_projects(payload: Dict[str, Any] = Body(default={}), db: Session = Depends(get_db),
                  _: None = Depends(require_admin)):
    items = _sync_items(payload, "projects")
    db.query(Project).delete()
    for index, item in enumerate(items):
        db.add(
            Project(
                id=str(item.get("id") or f"project-{index}"),
                name=str(item.get("name", "") or ""),
                description=str(item.get("description", "") or ""),
                icon=str(item.get("icon", "") or ""),
                github_url=str(item.get("githubUrl", item.get("github_url", "")) or ""),
                tags=dumps_list(item.get("tags", [])),
                sort_order=index,
            )
        )
    db.commit()
    return {"success": True, "message": "项目已保存", "count": len(items)}


@projects_router.delete("/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db),
                   _: None = Depends(require_admin)):
    row = db.query(Project).filter(Project.id == project_id).first()
    if not row:
        return {"success": False, "message": "项目不存在"}
    db.delete(row)
    db.commit()
    return {"success": True, "message": "项目已删除"}
