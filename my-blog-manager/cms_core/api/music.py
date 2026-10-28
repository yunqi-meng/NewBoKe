import json
import os
import re
import time
from typing import Optional

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
import requests

router = APIRouter()

# --------------------------------------------------------------------------
# 本地音乐（控制台上传 → 镜像到公开站 public/audio）
#
# 目录结构：
#   <manager>/music/playlist.json     播放列表元数据（入库）
#   <manager>/music/xxx.mp3           音频本体（不入库，避免版权与仓库膨胀）
#   <manager>/music/xxx.lrc           歌词
#   <manager>/music/covers/xxx.jpg    封面
# --------------------------------------------------------------------------
CURRENT_API_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_API_DIR, "..", ".."))

MUSIC_DIR = os.path.join(PROJECT_ROOT, "music")
PLAYLIST_FILE = os.path.join(MUSIC_DIR, "playlist.json")
COVER_DIR = os.path.join(MUSIC_DIR, "covers")

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


def _ensure_music_dir():
    os.makedirs(MUSIC_DIR, exist_ok=True)
    os.makedirs(COVER_DIR, exist_ok=True)


def _read_playlist():
    try:
        with open(PLAYLIST_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and isinstance(data.get("tracks"), list):
            return data
    except Exception:
        pass
    return {"version": 1, "updatedAt": "", "tracks": []}


def _write_playlist(data):
    _ensure_music_dir()
    data["version"] = 1
    data["updatedAt"] = time.strftime("%Y-%m-%d %H:%M:%S")
    tmp_path = PLAYLIST_FILE + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, PLAYLIST_FILE)


def _safe_stem(name):
    """把原始文件名收拾成安全的文件名主干"""
    stem = os.path.splitext(os.path.basename(name or ""))[0]
    stem = re.sub(r"[\\/:*?\"<>|\r\n\t]+", "_", stem)
    stem = re.sub(r"\s+", " ", stem).strip(" ._")
    if not stem:
        stem = "track"
    return stem[:60]


def _unique_name(directory, stem, ext):
    """同一目录下避免重名"""
    candidate = "{0}{1}".format(stem, ext)
    index = 1
    while os.path.exists(os.path.join(directory, candidate)):
        candidate = "{0}-{1}{2}".format(stem, index, ext)
        index += 1
    return candidate


def _find_track(playlist, track_id):
    for track in playlist.get("tracks", []):
        if track.get("id") == track_id:
            return track
    return None


def _is_inside(base_dir, target):
    """严格判断目标路径是否落在 base_dir 内部（防目录穿越）"""
    base = os.path.abspath(base_dir)
    target = os.path.abspath(target)
    return target == base or target.startswith(base + os.sep)


def _remove_file(relative_path):
    if not relative_path:
        return
    target = os.path.normpath(os.path.join(MUSIC_DIR, relative_path))
    if not _is_inside(MUSIC_DIR, target):
        return
    try:
        if os.path.isfile(target):
            os.remove(target)
    except Exception:
        pass


@router.get("/query/{song_id}")
def query_netease_music(song_id: str):
    """通过网易云公开接口查询歌曲详情"""
    print(f"\n[API] 🎵 收到查询网易云音乐请求, ID: {song_id}")
    try:
        api_url = f"https://music.163.com/api/song/detail/?id={song_id}&ids=[{song_id}]"
        headers = {
            # 伪装得更像真实浏览器
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Referer": "https://music.163.com/"
        }
        response = requests.get(api_url, headers=headers, timeout=5)

        # 把 HTTP 状态码打出来，如果是 403 就是被网易云拦截了
        print(f"[API] 📡 网易云响应状态码: {response.status_code}")

        data = response.json()

        if data.get("songs") and len(data["songs"]) > 0:
            song = data["songs"][0]
            print(f"[API] ✅ 查询成功: {song['name']} - {song['artists'][0]['name']}")
            return {
                "success": True,
                "data": {
                    "id": song_id,
                    "name": song["name"],
                    "artist": song["artists"][0]["name"],
                    "album": song["album"]["name"],
                    "cover": song["album"]["picUrl"]
                }
            }
        print(f"[API] ❌ 查无此歌 (ID: {song_id})")
        return {"success": False, "message": "未找到该歌曲，可能是 VIP 歌曲或 ID 错误"}

    except Exception as e:
        # 【关键】：在终端里把真正的报错原因打印出来！
        print(f"[API] 💥 网易云接口发生严重错误: {str(e)}")
        return {"success": False, "message": f"后端请求失败: {str(e)}"}


# --------------------------------------------------------------------------
# 本地音乐管理
# --------------------------------------------------------------------------

@router.get("/local")
def list_local_music():
    """本地音乐播放列表（控制台与公开站共用的元数据）"""
    playlist = _read_playlist()
    tracks = []
    for track in playlist.get("tracks", []):
        item = dict(track)
        audio_path = os.path.join(MUSIC_DIR, item.get("file") or "")
        item["available"] = os.path.isfile(audio_path)
        tracks.append(item)

    return {
        "success": True,
        "data": {
            "version": playlist.get("version", 1),
            "updatedAt": playlist.get("updatedAt", ""),
            "tracks": tracks,
        },
    }


@router.post("/upload")
async def upload_local_music(
    file: UploadFile = File(...),
    title: str = Form(""),
    artist: str = Form(""),
):
    """上传本地音频文件，自动追加进播放列表"""
    original_name = file.filename or ""
    ext = os.path.splitext(original_name)[1].lower()

    if ext not in AUDIO_EXTS:
        return {"success": False,
                "message": "只支持音频文件（{}）".format("、".join(sorted(AUDIO_EXTS)))}

    content = await file.read()
    if not content:
        return {"success": False, "message": "文件内容为空"}
    if len(content) > MAX_AUDIO_BYTES:
        return {"success": False, "message": "单个音频不能超过 100MB"}

    _ensure_music_dir()

    stem = _safe_stem(title or original_name)
    file_name = _unique_name(MUSIC_DIR, stem, ext)
    with open(os.path.join(MUSIC_DIR, file_name), "wb") as f:
        f.write(content)

    track_id = "t{0}".format(int(time.time() * 1000))
    playlist = _read_playlist()
    playlist.setdefault("tracks", []).append({
        "id": track_id,
        "title": (title or stem).strip(),
        "artist": (artist or "").strip(),
        "file": file_name,
        "cover": "",
        "lyrics": "",
        "size": len(content),
        "addedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
    })
    _write_playlist(playlist)

    print("[API] 🎵 已上传本地音乐: {0}".format(file_name))
    return {"success": True, "message": "上传成功", "data": {"id": track_id, "file": file_name}}


@router.post("/cover/{track_id}")
async def upload_local_cover(track_id: str, file: UploadFile = File(...)):
    """给已上传的曲目补一张封面"""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in COVER_EXTS:
        return {"success": False, "message": "封面只支持图片文件"}

    content = await file.read()
    if not content:
        return {"success": False, "message": "封面内容为空"}
    if len(content) > MAX_COVER_BYTES:
        return {"success": False, "message": "封面不能超过 8MB"}

    playlist = _read_playlist()
    track = _find_track(playlist, track_id)
    if not track:
        return {"success": False, "message": "找不到对应的曲目"}

    _ensure_music_dir()
    cover_name = _unique_name(COVER_DIR, track_id, ext)
    with open(os.path.join(COVER_DIR, cover_name), "wb") as f:
        f.write(content)

    old_cover = track.get("cover")
    track["cover"] = "covers/{0}".format(cover_name)
    _write_playlist(playlist)

    # 换封面时把旧图清掉，避免目录里堆垃圾
    if old_cover and old_cover != track["cover"]:
        _remove_file(old_cover)

    return {"success": True, "message": "封面已更新"}


@router.get("/cover/{track_id}")
def get_local_cover(track_id: str):
    """按曲目 ID 取封面（控制台同源代理会编码路径，这里只走单段 ID）"""
    playlist = _read_playlist()
    track = _find_track(playlist, track_id)
    if not track or not track.get("cover"):
        return {"success": False, "message": "该曲目没有封面"}

    target = os.path.normpath(os.path.join(MUSIC_DIR, track["cover"]))
    if not _is_inside(MUSIC_DIR, target) or not os.path.isfile(target):
        return {"success": False, "message": "封面文件不存在"}

    ext = os.path.splitext(target)[1].lower()
    return FileResponse(target, media_type=CONTENT_TYPES.get(ext, "application/octet-stream"))


@router.post("/lyrics/{track_id}")
async def upload_local_lyrics(track_id: str, file: UploadFile = File(...)):
    """给已上传的曲目补一份 LRC 歌词"""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in LYRIC_EXTS:
        return {"success": False, "message": "歌词只支持 .lrc 文件"}

    content = await file.read()
    if not content:
        return {"success": False, "message": "歌词内容为空"}

    playlist = _read_playlist()
    track = _find_track(playlist, track_id)
    if not track:
        return {"success": False, "message": "找不到对应的曲目"}

    _ensure_music_dir()
    audio_stem = os.path.splitext(track.get("file") or "track")[0]
    lrc_name = _unique_name(MUSIC_DIR, audio_stem, ".lrc")
    with open(os.path.join(MUSIC_DIR, lrc_name), "wb") as f:
        f.write(content)

    track["lyrics"] = lrc_name
    _write_playlist(playlist)
    return {"success": True, "message": "歌词已更新"}


@router.get("/lyrics/{track_id}")
def get_local_lyrics(track_id: str):
    """按曲目 ID 取歌词原文（返回纯文本，播放器的 lrcUrl 分支直接解析）"""
    playlist = _read_playlist()
    track = _find_track(playlist, track_id)
    if not track or not track.get("lyrics"):
        return PlainTextResponse("", status_code=404)

    target = os.path.normpath(os.path.join(MUSIC_DIR, track["lyrics"]))
    if not _is_inside(MUSIC_DIR, target) or not os.path.isfile(target):
        return PlainTextResponse("", status_code=404)

    with open(target, "r", encoding="utf-8", errors="replace") as f:
        return PlainTextResponse(f.read(), media_type="text/plain; charset=utf-8")


@router.delete("/local/{track_id}")
def delete_local_music(track_id: str):
    """删除一首本地音乐，连同音频、歌词与封面"""
    playlist = _read_playlist()
    track = _find_track(playlist, track_id)
    if not track:
        return {"success": False, "message": "找不到对应的曲目"}

    _remove_file(track.get("file"))
    _remove_file(track.get("lyrics"))
    _remove_file(track.get("cover"))

    playlist["tracks"] = [t for t in playlist.get("tracks", []) if t.get("id") != track_id]
    _write_playlist(playlist)
    return {"success": True, "message": "已删除"}


@router.get("/file/{filename:path}")
def get_local_music_file(filename: str):
    """把本地音乐文件读出来，供控制台内试听（公开站走 public/audio 静态目录）"""
    _ensure_music_dir()
    target = os.path.normpath(os.path.join(MUSIC_DIR, filename))
    if not _is_inside(MUSIC_DIR, target):
        return {"success": False, "message": "非法路径"}
    if not os.path.isfile(target):
        return {"success": False, "message": "文件不存在"}

    ext = os.path.splitext(target)[1].lower()
    return FileResponse(target, media_type=CONTENT_TYPES.get(ext, "application/octet-stream"))