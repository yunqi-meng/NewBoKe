import os
import time
import hashlib

from fastapi import APIRouter, UploadFile, File
from fastapi.responses import FileResponse, Response

router = APIRouter()

# ---------------------------------------------------------
# 📁 本地图片仓库
#
# 控制台不再依赖任何第三方图床：图片直接从运营者的电脑上传，
# 落到控制台本机 data/uploads/ 目录，站点内统一以 /uploads/<文件名> 引用。
# 发布上线时，sync.py 会把这个目录镜像到公开站的 public/uploads/。
# ---------------------------------------------------------
CURRENT_API_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_API_DIR, "..", ".."))

# 服务器部署与桌面版都会注入 XHS_MANAGER_ROOT，指向控制台根目录；
# 没注入时回落到源码根目录（本地开发模式）。
MANAGER_ROOT = os.environ.get("XHS_MANAGER_ROOT") or PROJECT_ROOT
UPLOAD_DIR = os.path.join(MANAGER_ROOT, "data", "uploads")

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
async def upload_image(file: UploadFile = File(...)):
    """接收本机上传的图片，写入本地图片仓库"""
    try:
        original_name = os.path.basename(file.filename or "")
        extension = os.path.splitext(original_name)[1].lower()

        if extension not in ALLOWED_EXTENSIONS:
            return {"success": False, "message": "只支持 jpg / png / gif / webp / avif / svg 图片"}

        content_type = (file.content_type or "").lower()
        if content_type and not content_type.startswith("image/"):
            return {"success": False, "message": "只能上传图片文件"}

        content = await file.read()
        if not content:
            return {"success": False, "message": "文件内容为空"}

        if len(content) > MAX_UPLOAD_BYTES:
            return {"success": False, "message": "图片太大了，单张上限 12MB"}

        digest = hashlib.sha256(content).hexdigest()[:12]
        file_name = "{0}-{1}{2}".format(time.strftime("%Y%m%d-%H%M%S"), digest, extension)

        os.makedirs(UPLOAD_DIR, exist_ok=True)
        with open(os.path.join(UPLOAD_DIR, file_name), "wb") as target:
            target.write(content)

        return {
            "success": True,
            "message": "上传成功",
            "url": "/uploads/{0}".format(file_name),
            "name": file_name,
            "size": len(content),
        }
    except Exception as error:
        return {"success": False, "message": "上传失败：{0}".format(error)}


@router.get("/file/{name}")
async def read_image(name: str):
    """读取本机图片仓库里的文件（控制台预览 / 调试用）"""
    safe_name = _safe_file_name(name)
    if not safe_name:
        return _not_found()

    file_path = os.path.join(UPLOAD_DIR, safe_name)
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
