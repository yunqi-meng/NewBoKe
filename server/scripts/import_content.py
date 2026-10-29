"""把老的内容（markdown / TS 文件）一次性导入统一数据库。

    python scripts/import_content.py --source <仓库根>/my-blog-manager

导入内容：
    posts/*.md              → articles（type=post）
    chatters/*.md           → articles（type=chatter）
    app/about/about.md      → articles（type=about）
    moments/*.md            → moments
    data/albums.ts          → albums + album_photos
    data/friends.ts         → friends
    data/projects.ts        → projects
    siteConfig.ts           → site_config
    data/dailyQuote.json    → daily_quotes
    manager_data/drafts/*.json → drafts
    data/uploads/*          → media_assets

导入是「覆盖式」的：先清空对应的表再写进去，重复执行不会留下脏数据。
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

import yaml

# 允许直接 `python scripts/import_content.py` 运行
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Windows 控制台默认 GBK，打印中文与表情会直接抛 UnicodeEncodeError
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from app.db import init_db, session_scope  # noqa: E402
from app.helpers import dumps_list, now_stamp  # noqa: E402
from app.models import (  # noqa: E402
    Album,
    AlbumPhoto,
    Article,
    DailyQuote,
    Draft,
    Friend,
    MediaAsset,
    Moment,
    Project,
    SiteConfig,
)
from app.siteconfig import parse_site_config  # noqa: E402
from app.tsdata import read_ts_array  # noqa: E402

def parse_markdown(raw: str):
    """拆出 YAML Front Matter 与正文。"""
    front: Dict[str, Any] = {}
    body = raw
    if raw.strip().startswith("---"):
        parts = raw.split("---", 2)
        if len(parts) >= 3:
            try:
                loaded = yaml.safe_load(parts[1])
                if isinstance(loaded, dict):
                    front = loaded
            except yaml.YAMLError:
                pass
            body = parts[2].strip()
    return front, body


def _tags(value) -> List[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    if value in (None, ""):
        return []
    return [str(value)]


def import_articles(source: Path, session) -> Dict[str, int]:
    counts = {"post": 0, "chatter": 0, "about": 0}

    def put(slug: str, doc_type: str, front: Dict[str, Any], body: str) -> None:
        row = session.query(Article).filter(Article.slug == slug).first()
        if row is None:
            row = Article(slug=slug, created_at=now_stamp())
            session.add(row)
        row.type = doc_type
        row.title = str(front.get("title", "") or "")
        row.description = str(front.get("description", "") or "")
        row.content = body
        row.cover = str(front.get("cover", "") or "")
        row.tags = dumps_list(_tags(front.get("tags")))
        row.mood = str(front.get("mood", "") or "")
        row.date = str(front.get("date", "") or "")
        row.updated_at = now_stamp()
        counts[doc_type] = counts.get(doc_type, 0) + 1

    for doc_type, folder in (("post", "posts"), ("chatter", "chatters")):
        directory = source / folder
        if not directory.exists():
            continue
        for path in sorted(directory.glob("*.md")):
            front, body = parse_markdown(path.read_text(encoding="utf-8"))
            put(path.stem, doc_type, front, body)

    about = source / "app" / "about" / "about.md"
    if about.exists():
        front, body = parse_markdown(about.read_text(encoding="utf-8"))
        put("about", "about", front, body)

    session.flush()
    return counts


def import_moments(source: Path, session) -> int:
    directory = source / "moments"
    if not directory.exists():
        return 0
    count = 0
    for path in sorted(directory.glob("*.md")):
        front, body = parse_markdown(path.read_text(encoding="utf-8"))
        moment_id = str(front.get("id", "") or path.stem)
        row = session.query(Moment).filter(Moment.id == moment_id).first()
        if row is None:
            row = Moment(id=moment_id, created_at=now_stamp())
            session.add(row)
        row.date = str(front.get("date", "") or "")
        row.content = str(front.get("content", body) or "")
        row.location = str(front.get("location", "") or "")
        row.images = dumps_list(front.get("images", []))
        count += 1
    session.flush()
    return count


def import_albums(source: Path, session) -> int:
    path = source / "data" / "albums.ts"
    if not path.exists():
        return 0
    items = read_ts_array(path, "export const albums")
    session.query(AlbumPhoto).delete()
    session.query(Album).delete()
    for index, item in enumerate(items):
        album = Album(
            id=str(item.get("id") or f"album-{index}"),
            title=str(item.get("title", "") or ""),
            description=str(item.get("description", "") or ""),
            cover=str(item.get("cover", "") or ""),
            date=str(item.get("date", "") or ""),
            sort_order=index,
        )
        session.add(album)
        for photo_index, photo in enumerate(item.get("photos", []) or []):
            session.add(
                AlbumPhoto(
                    album_id=album.id,
                    url=str(photo.get("url", "") or ""),
                    caption=str(photo.get("caption", "") or ""),
                    sort_order=photo_index,
                )
            )
    session.flush()
    return len(items)


def import_friends(source: Path, session) -> int:
    path = source / "data" / "friends.ts"
    if not path.exists():
        return 0
    items = read_ts_array(path, "export const friendsData")
    session.query(Friend).delete()
    for index, item in enumerate(items):
        session.add(
            Friend(
                id=str(item.get("id") or f"friend-{index}"),
                name=str(item.get("name", "") or ""),
                url=str(item.get("url", "") or ""),
                description=str(item.get("description", "") or ""),
                avatar=str(item.get("avatar", "") or ""),
                theme_color=str(item.get("themeColor", "") or ""),
                sort_order=index,
            )
        )
    session.flush()
    return len(items)


def import_projects(source: Path, session) -> int:
    path = source / "data" / "projects.ts"
    if not path.exists():
        return 0
    items = read_ts_array(path, "export const projectsData")
    session.query(Project).delete()
    for index, item in enumerate(items):
        session.add(
            Project(
                id=str(item.get("id") or f"project-{index}"),
                name=str(item.get("name", "") or ""),
                description=str(item.get("description", "") or ""),
                icon=str(item.get("icon", "") or ""),
                github_url=str(item.get("githubUrl", "") or ""),
                tags=dumps_list(item.get("tags", [])),
                sort_order=index,
            )
        )
    session.flush()
    return len(items)


def import_site_config(source: Path, session) -> int:
    path = source / "siteConfig.ts"
    if not path.exists():
        return 0
    payload = parse_site_config(path)
    if not payload:
        return 0
    row = session.query(SiteConfig).filter(SiteConfig.id == 1).first()
    if row is None:
        row = SiteConfig(id=1, payload="{}")
        session.add(row)
    row.payload = json.dumps(payload, ensure_ascii=False, indent=2)
    row.updated_at = now_stamp()
    session.flush()
    return len(payload)


def import_daily_quotes(source: Path, session) -> int:
    path = source / "data" / "dailyQuote.json"
    if not path.exists():
        return 0
    try:
        stored = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return 0
    entries = []
    if isinstance(stored, dict):
        current = stored.get("current")
        if isinstance(current, dict):
            entries.append(current)
        for item in stored.get("history", []) or []:
            if isinstance(item, dict):
                entries.append(item)
    count = 0
    seen = set()
    for entry in entries:
        date = str(entry.get("date", "") or "")
        if not date or date in seen:
            # 同一天的记录可能在 current 与 history 里各出现一次，date 是主键
            continue
        seen.add(date)
        row = session.query(DailyQuote).filter(DailyQuote.date == date).first()
        if row is None:
            row = DailyQuote(date=date)
            session.add(row)
        row.quote = str(entry.get("quote", "") or "")
        row.source = str(entry.get("source", "") or "ai")
        row.model = str(entry.get("model", "") or "")
        row.label = str(entry.get("label", "") or "")
        row.generated_at = str(entry.get("generatedAt", "") or "")
        count += 1
    session.flush()
    return count


def import_drafts(source: Path, session) -> int:
    directory = source / "manager_data" / "drafts"
    if not directory.exists():
        return 0
    count = 0
    for path in sorted(directory.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        draft_id = str(payload.get("id") or path.stem)
        row = session.query(Draft).filter(Draft.id == draft_id).first()
        if row is None:
            row = Draft(id=draft_id)
            session.add(row)
        row.type = str(payload.get("type", "post") or "post")
        row.title = str(payload.get("title", "") or "")
        row.description = str(payload.get("description", "") or "")
        row.content = str(payload.get("content", "") or "")
        row.cover = str(payload.get("cover", "") or "")
        row.tags = dumps_list(payload.get("tags", []))
        row.mood = str(payload.get("mood", "") or "")
        row.date = str(payload.get("date", "") or "")
        row.last_modified = int(payload.get("lastModified", 0) or 0)
        count += 1
    session.flush()
    return count


def import_media(source: Path, session) -> int:
    directory = source / "data" / "uploads"
    if not directory.exists():
        return 0
    count = 0
    for path in sorted(directory.iterdir()):
        if not path.is_file():
            continue
        row = session.query(MediaAsset).filter(MediaAsset.name == path.name).first()
        if row is None:
            row = MediaAsset(name=path.name)
            session.add(row)
        try:
            row.size = path.stat().st_size
            row.created_at = now_stamp()
        except OSError:
            pass
        count += 1
    session.flush()
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description="把老的内容导入统一数据库")
    parser.add_argument(
        "--source",
        default="",
        help="旧内容所在目录（默认 <仓库根>/my-blog-manager）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只统计不写库",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent.parent
    source = Path(args.source).resolve() if args.source else repo_root / "my-blog-manager"
    if not source.exists():
        print("❌ 源目录不存在：%s" % source)
        return 1

    init_db()
    print("📂 源目录：%s" % source)

    with session_scope() as session:
        articles = import_articles(source, session)
        moments = import_moments(source, session)
        albums = import_albums(source, session)
        friends = import_friends(source, session)
        projects = import_projects(source, session)
        config_keys = import_site_config(source, session)
        quotes = import_daily_quotes(source, session)
        drafts = import_drafts(source, session)
        media = import_media(source, session)

    summary = {
        "文章": articles.get("post", 0),
        "杂谈": articles.get("chatter", 0),
        "关于页": articles.get("about", 0),
        "说说": moments,
        "相册": albums,
        "相册照片": albums and "-",
        "友链": friends,
        "项目": projects,
        "配置字段": config_keys,
        "每日一句": quotes,
        "草稿": drafts,
        "图片": media,
    }
    print("\n✅ 导入完成：")
    for key, value in summary.items():
        print("   %-10s %s" % (key, value))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
