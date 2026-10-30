"""本地图片仓库。

控制台不再依赖任何第三方图床：图片直接从运营者的电脑上传，
落到 content_dir/uploads/ 目录，站点内统一以 /uploads/<文件名> 引用。
数据库只记一条元数据（文件名、大小、类型），方便后台管理与清理。
"""

import hashlib
import os
import time

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..helpers import now_stamp
from ..models import MediaAsset
from ..security import require_admin

router = APIRouter()

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg"}

# 单张上限 12MB，够用又不会把仓库塞爆
MAX_UPLOAD_BYTES = 12 * 1024 * 1024

MIME_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".svg": "image/svg+xml",
}


def uploads_dir() -> str:
    return str(config.uploads_dir())


def _safe_file_name(name: str) -> str:
    """只接受纯文件名，任何路径分隔符或上级目录一律拒绝"""
    if not name:
        return ""
    if name != os.path.basename(name):
        return ""
    if name.startswith(".") or len(name) > 200:
        return ""
    return name


@router.post("/upload")
def upload_image(file: UploadFile = File(...), db: Session = Depends(get_db),
                 _: None = Depends(require_admin)):
    """接收本机上传的图片，写入本地图片仓库。

    用同步 def：拷贝落盘属于阻塞 I/O，交给线程池跑，不占事件循环；
    落盘用流式拷贝，大图不会整张读进内存。
    """
    try:
        original_name = os.path.basename(file.filename or "")
        extension = os.path.splitext(original_name)[1].lower()

        if extension not in ALLOWED_EXTENSIONS:
            return {"success": False, "message": "只支持 jpg / png / gif / webp / avif / svg 图片"}

        content_type = (file.content_type or "").lower()
        if content_type and not content_type.startswith("image/"):
            return {"success": False, "message": "只能上传图片文件"}

        target_dir = uploads_dir()
        os.makedirs(target_dir, exist_ok=True)

        # 文件名要嵌内容哈希，先流式拷到临时文件、边拷边算哈希，再改名定稿
        temp_path = os.path.join(target_dir, ".uploading-{0}".format(int(time.time() * 1000)))
        hasher = hashlib.sha256()
        size = 0
        try:
            with open(temp_path, "wb") as target:
                while True:
                    chunk = file.file.read(1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > MAX_UPLOAD_BYTES:
                        return {"success": False, "message": "图片太大了，单张上限 12MB"}
                    hasher.update(chunk)
                    target.write(chunk)

            if not size:
                return {"success": False, "message": "文件内容为空"}

            file_name = "{0}-{1}{2}".format(
                time.strftime("%Y%m%d-%H%M%S"), hasher.hexdigest()[:12], extension
            )
            os.replace(temp_path, os.path.join(target_dir, file_name))
        finally:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass

        row = db.query(MediaAsset).filter(MediaAsset.name == file_name).first()
        if row is None:
            row = MediaAsset(name=file_name)
            db.add(row)
        row.size = size
        row.content_type = MIME_TYPES.get(extension, "")
        row.created_at = now_stamp()
        db.commit()

        return {
            "success": True,
            "message": "上传成功",
            "url": "/uploads/{0}".format(file_name),
            "name": file_name,
            "size": size,
        }
    except Exception as error:
        return {"success": False, "message": "上传失败：{0}".format(error)}


@router.get("/list")
def list_images(db: Session = Depends(get_db), _: None = Depends(require_admin)):
    """列出已上传的图片（后台管理用）。"""
    rows = db.query(MediaAsset).order_by(MediaAsset.id.desc()).all()
    return {
        "success": True,
        "images": [
            {
                "name": row.name,
                "url": "/uploads/{0}".format(row.name),
                "size": row.size,
                "contentType": row.content_type,
                "createdAt": row.created_at,
            }
            for row in rows
        ],
        "count": len(rows),
    }


@router.get("/file/{name}")
async def read_image(name: str):
    """读取本机图片仓库里的文件（控制台预览 / 调试用）"""
    safe_name = _safe_file_name(name)
    if not safe_name:
        return _not_found()

    file_path = os.path.join(uploads_dir(), safe_name)
    if not os.path.isfile(file_path):
        return _not_found()

    extension = os.path.splitext(safe_name)[1].lower()
    return FileResponse(
        file_path,
        media_type=MIME_TYPES.get(extension, "application/octet-stream"),
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


def _not_found():
    return Response(content="图片不存在", status_code=404, media_type="text/plain; charset=utf-8")
