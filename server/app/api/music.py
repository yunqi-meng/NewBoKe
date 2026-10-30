"""本地音乐。

目录结构（文件仍落在磁盘上，数据库只存元数据）：
    <content_dir>/music/xxx.mp3           音频本体
    <content_dir>/music/xxx.lrc           歌词
    <content_dir>/music/covers/xxx.jpg    封面

播放列表元数据存在 music_tracks 表里，两个前端读同一份。
"""

import os
import re
import time
from typing import Any, Dict

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..helpers import now_stamp
from ..models import MusicTrack
from ..security import require_admin

router = APIRouter()

AUDIO_EXTS = {".mp3", ".m4a", ".aac", ".ogg", ".oga", ".wav", ".flac", ".weba"}
LYRIC_EXTS = {".lrc"}
COVER_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_AUDIO_BYTES = 100 * 1024 * 1024
MAX_COVER_BYTES = 8 * 1024 * 1024

CONTENT_TYPES = {
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".weba": "audio/webm",
    ".lrc": "text/plain; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


def music_dir() -> str:
    return str(config.music_dir())


def cover_dir() -> str:
    return os.path.join(music_dir(), "covers")


def _ensure_music_dir() -> None:
    os.makedirs(music_dir(), exist_ok=True)
    os.makedirs(cover_dir(), exist_ok=True)


def _safe_stem(name: str) -> str:
    """把原始文件名收拾成安全的文件名主干"""
    stem = os.path.splitext(os.path.basename(name or ""))[0]
    stem = re.sub(r"[\\/:*?\"<>|\r\n\t]+", "_", stem)
    stem = re.sub(r"\s+", " ", stem).strip(" ._")
    if not stem:
        stem = "track"
    return stem[:60]


def _unique_name(directory: str, stem: str, ext: str) -> str:
    """同一目录下避免重名"""
    candidate = "{0}{1}".format(stem, ext)
    index = 1
    while os.path.exists(os.path.join(directory, candidate)):
        candidate = "{0}-{1}{2}".format(stem, index, ext)
        index += 1
    return candidate


def _is_inside(base_dir: str, target: str) -> bool:
    """严格判断目标路径是否落在 base_dir 内部（防目录穿越）"""
    base = os.path.abspath(base_dir)
    target = os.path.abspath(target)
    return target == base or target.startswith(base + os.sep)


def _remove_file(relative_path: str) -> None:
    if not relative_path:
        return
    target = os.path.normpath(os.path.join(music_dir(), relative_path))
    if not _is_inside(music_dir(), target):
        return
    try:
        if os.path.isfile(target):
            os.remove(target)
    except Exception:
        pass


def track_to_dict(row: MusicTrack, existing: set) -> Dict[str, Any]:
    return {
        "id": row.id,
        "title": row.title,
        "artist": row.artist,
        "file": row.file,
        "cover": row.cover,
        "lyrics": row.lyrics,
        "size": row.size,
        "addedAt": row.added_at,
        "available": row.file in existing,
    }


# ------------------------------------------------------------------ 播放列表
@router.get("/local")
def list_local_music(db: Session = Depends(get_db)):
    """本地音乐播放列表（控制台与公开站共用的元数据）"""
    rows = db.query(MusicTrack).order_by(MusicTrack.sort_order, MusicTrack.id).all()
    # 目录扫一遍拿文件名集合：几百首歌逐首 isfile 就是几百次系统调用
    existing = set()
    try:
        with os.scandir(music_dir()) as entries:
            existing = {entry.name for entry in entries if entry.is_file()}
    except OSError:
        pass
    tracks = [track_to_dict(row, existing) for row in rows]
    return {
        "success": True,
        "data": {
            "version": 1,
            "updatedAt": now_stamp(),
            "tracks": tracks,
        },
    }


@router.post("/upload")
def upload_local_music(
    file: UploadFile = File(...),
    title: str = Form(""),
    artist: str = Form(""),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    """上传本地音频文件，自动追加进播放列表。

    同步 def + 流式落盘：音频动辄几十 MB，不能整份读进内存，
    阻塞 I/O 也不该占着事件循环。
    """
    original_name = file.filename or ""
    ext = os.path.splitext(original_name)[1].lower()

    if ext not in AUDIO_EXTS:
        return {"success": False,
                "message": "只支持音频文件（{}）".format("、".join(sorted(AUDIO_EXTS)))}

    _ensure_music_dir()

    stem = _safe_stem(title or original_name)
    file_name = _unique_name(music_dir(), stem, ext)
    size = 0
    with open(os.path.join(music_dir(), file_name), "wb") as f:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_AUDIO_BYTES:
                f.close()
                _remove_file(file_name)
                return {"success": False, "message": "单个音频不能超过 100MB"}
            f.write(chunk)
    if not size:
        _remove_file(file_name)
        return {"success": False, "message": "文件内容为空"}

    track_id = "t{0}".format(int(time.time() * 1000))
    suffix = 1
    while db.query(MusicTrack).filter(MusicTrack.id == track_id).first():
        # 同一毫秒并发上传时给 id 追加序号，避免主键撞车
        track_id = "t{0}-{1}".format(int(time.time() * 1000), suffix)
        suffix += 1
    row = MusicTrack(
        id=track_id,
        title=(title or stem).strip(),
        artist=(artist or "").strip(),
        file=file_name,
        cover="",
        lyrics="",
        size=size,
        added_at=now_stamp(),
        sort_order=db.query(MusicTrack).count(),
    )
    db.add(row)
    db.commit()

    print("[API] 🎵 已上传本地音乐: {0}".format(file_name))
    return {"success": True, "message": "上传成功", "data": {"id": track_id, "file": file_name}}


@router.post("/cover/{track_id}")
def upload_local_cover(track_id: str, file: UploadFile = File(...),
                       db: Session = Depends(get_db),
                       _: None = Depends(require_admin)):
    """给已上传的曲目补一张封面"""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in COVER_EXTS:
        return {"success": False, "message": "封面只支持图片文件"}

    row = db.query(MusicTrack).filter(MusicTrack.id == track_id).first()
    if not row:
        return {"success": False, "message": "找不到对应的曲目"}

    _ensure_music_dir()
    cover_name = _unique_name(cover_dir(), track_id, ext)
    size = 0
    with open(os.path.join(cover_dir(), cover_name), "wb") as f:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_COVER_BYTES:
                f.close()
                _remove_file("covers/{0}".format(cover_name))
                return {"success": False, "message": "封面不能超过 8MB"}
            f.write(chunk)
    if not size:
        _remove_file("covers/{0}".format(cover_name))
        return {"success": False, "message": "封面内容为空"}

    old_cover = row.cover
    row.cover = "covers/{0}".format(cover_name)
    db.commit()

    # 换封面时把旧图清掉，避免目录里堆垃圾
    if old_cover and old_cover != row.cover:
        _remove_file(old_cover)

    return {"success": True, "message": "封面已更新"}


@router.get("/cover/{track_id}")
def get_local_cover(track_id: str, db: Session = Depends(get_db)):
    """按曲目 ID 取封面（控制台同源代理会编码路径，这里只走单段 ID）"""
    row = db.query(MusicTrack).filter(MusicTrack.id == track_id).first()
    if not row or not row.cover:
        return JSONResponse({"success": False, "message": "该曲目没有封面"}, status_code=404)

    target = os.path.normpath(os.path.join(music_dir(), row.cover))
    if not _is_inside(music_dir(), target) or not os.path.isfile(target):
        return JSONResponse({"success": False, "message": "封面文件不存在"}, status_code=404)

    ext = os.path.splitext(target)[1].lower()
    return FileResponse(
        target,
        media_type=CONTENT_TYPES.get(ext, "application/octet-stream"),
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.post("/lyrics/{track_id}")
def upload_local_lyrics(track_id: str, file: UploadFile = File(...),
                        db: Session = Depends(get_db),
                        _: None = Depends(require_admin)):
    """给已上传的曲目补一份 LRC 歌词"""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in LYRIC_EXTS:
        return {"success": False, "message": "歌词只支持 .lrc 文件"}

    row = db.query(MusicTrack).filter(MusicTrack.id == track_id).first()
    if not row:
        return {"success": False, "message": "找不到对应的曲目"}

    _ensure_music_dir()
    audio_stem = os.path.splitext(row.file or "track")[0]
    lrc_name = _unique_name(music_dir(), audio_stem, ".lrc")
    size = 0
    with open(os.path.join(music_dir(), lrc_name), "wb") as f:
        while True:
            chunk = file.file.read(64 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > 1024 * 1024:
                f.close()
                _remove_file(lrc_name)
                return {"success": False, "message": "歌词文件不能超过 1MB"}
            f.write(chunk)
    if not size:
        _remove_file(lrc_name)
        return {"success": False, "message": "歌词内容为空"}

    row.lyrics = lrc_name
    db.commit()
    return {"success": True, "message": "歌词已更新"}


@router.get("/lyrics/{track_id}")
def get_local_lyrics(track_id: str, db: Session = Depends(get_db)):
    """按曲目 ID 取歌词原文（返回纯文本，播放器的 lrcUrl 分支直接解析）"""
    row = db.query(MusicTrack).filter(MusicTrack.id == track_id).first()
    if not row or not row.lyrics:
        return PlainTextResponse("", status_code=404)

    target = os.path.normpath(os.path.join(music_dir(), row.lyrics))
    if not _is_inside(music_dir(), target) or not os.path.isfile(target):
        return PlainTextResponse("", status_code=404)

    # 交给 FileResponse 流式返回，不用把整份歌词读进内存
    return FileResponse(
        target,
        media_type="text/plain; charset=utf-8",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.delete("/local/{track_id}")
def delete_local_music(track_id: str, db: Session = Depends(get_db),
                       _: None = Depends(require_admin)):
    """删除一首本地音乐，连同音频、歌词与封面"""
    row = db.query(MusicTrack).filter(MusicTrack.id == track_id).first()
    if not row:
        return {"success": False, "message": "找不到对应的曲目"}

    _remove_file(row.file)
    _remove_file(row.lyrics)
    _remove_file(row.cover)

    db.delete(row)
    db.commit()
    return {"success": True, "message": "已删除"}


@router.get("/file/{filename:path}")
def get_local_music_file(filename: str):
    """把本地音乐文件读出来，供控制台内试听（公开站走 public/audio 静态目录）"""
    _ensure_music_dir()
    target = os.path.normpath(os.path.join(music_dir(), filename))
    if not _is_inside(music_dir(), target):
        return JSONResponse({"success": False, "message": "非法路径"}, status_code=400)
    if not os.path.isfile(target):
        return JSONResponse({"success": False, "message": "文件不存在"}, status_code=404)

    ext = os.path.splitext(target)[1].lower()
    return FileResponse(
        target,
        media_type=CONTENT_TYPES.get(ext, "application/octet-stream"),
        headers={"Cache-Control": "public, max-age=86400"},
    )
