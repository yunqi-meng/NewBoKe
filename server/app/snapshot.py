"""内容快照：把数据库里的内容导出成一份 JSON，提交进 git 当历史。

用途：
    发布   —— 导出一份快照并提交，线上就有了一份可追溯的版本；
    回退   —— 把历史快照灌回数据库，内容回到当时的样子；
    备份   —— 数据库文件本身不进仓库，快照才是可长期保存的那一份。

快照只收录「内容」，不含评论（评论是访客数据，另行备份）。
"""

import json
from datetime import datetime
from pathlib import Path

from . import config
from .db import session_scope
from .models import (
    Album,
    AlbumPhoto,
    Article,
    DailyQuote,
    Draft,
    Friend,
    MediaAsset,
    Moment,
    MusicTrack,
    Project,
    Setting,
    SiteConfig,
)

SNAPSHOT_VERSION = 1

# 参与快照的表：表名 → 模型
#
# 顺序有讲究：父表排在子表前面（albums 在 album_photos 前面）。
# 插入时按这个顺序走，父行先落地；删除时按倒序走，先删子表再删父表，
# 否则外键约束会拦下来（album_photos 指向 albums.id）。
TABLES = {
    "articles": Article,
    "moments": Moment,
    "albums": Album,
    "album_photos": AlbumPhoto,
    "friends": Friend,
    "projects": Project,
    "site_config": SiteConfig,
    "drafts": Draft,
    "music_tracks": MusicTrack,
    "daily_quotes": DailyQuote,
    "media_assets": MediaAsset,
    "settings": Setting,
}


def _row_to_dict(row) -> dict:
    return {column.name: getattr(row, column.name) for column in row.__table__.columns}


def export_snapshot(target: Path = None, db=None) -> Path:
    """把当前内容导出成一份快照文件，返回写入的路径。

    target 为空时按 `snapshots/content-<时间戳>.json` 落盘。
    """
    if db is not None:
        return _export_to(target, db)
    with session_scope() as session:
        return _export_to(target, session)


def _export_to(target: Path, db) -> Path:
    payload = {
        "version": SNAPSHOT_VERSION,
        "createdAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "tables": {},
    }
    for name, model in TABLES.items():
        rows = db.query(model).all()
        payload["tables"][name] = [_row_to_dict(row) for row in rows]

    if target is None:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        target = config.snapshots_dir() / f"content-{stamp}.json"
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return target


def read_snapshot(path: Path) -> dict:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, dict) or "tables" not in data:
        raise ValueError("快照文件格式不对")
    return data


def import_snapshot(path: Path, db=None) -> dict:
    """把快照灌回数据库（整份覆盖）。返回各类内容的条数。"""
    data = read_snapshot(Path(path))
    tables = data.get("tables", {})
    if db is not None:
        return _import_into(tables, db)
    with session_scope() as session:
        return _import_into(tables, session)


def _import_into(tables: dict, db) -> dict:
    counts = {}
    # 分两步走：
    #   1) 先按倒序清空所有表（子表先删，否则外键约束会拦下来）
    #   2) 再按正序写入（父表先写，父行先落地，子表的外键才有得指）
    for name, model in reversed(list(TABLES.items())):
        if tables.get(name) is None:
            continue
        db.query(model).delete()
    db.flush()

    for name, model in TABLES.items():
        rows = tables.get(name)
        if rows is None:
            continue
        columns = {column.name for column in model.__table__.columns}
        for row in rows:
            db.add(model(**{k: v for k, v in row.items() if k in columns}))
        counts[name] = len(rows)
    db.flush()
    return counts
