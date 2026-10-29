"""小工具：JSON 字段的存取与内容序列化。"""

import json
import sys
from datetime import datetime

from .models import Article, Moment


def configure_console_encoding() -> None:
    """把标准输出切到 UTF-8。

    Windows 的默认控制台编码是 GBK，日志里只要出现一个 emoji
    （例如「🎵 已上传本地音乐」）就会抛 UnicodeEncodeError，
    整个请求跟着 500。统一切成 UTF-8 后，日志里可以放心写中文与符号。
    """
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            # 没有控制台（被重定向成 GUI 程序）时忽略
            pass


def now_stamp() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def dumps_list(value) -> str:
    """把列表存成 JSON 文本。"""
    if value is None:
        return "[]"
    if isinstance(value, str):
        return value
    try:
        return json.dumps(list(value), ensure_ascii=False)
    except TypeError:
        return "[]"


def loads_list(raw) -> list:
    """从 JSON 文本读回列表，坏数据退回空列表。"""
    if raw is None:
        return []
    if isinstance(raw, list):
        return raw
    try:
        value = json.loads(raw or "[]")
    except (TypeError, ValueError):
        return []
    return value if isinstance(value, list) else []


def article_to_dict(article: Article, include_content: bool = True) -> dict:
    data = {
        "id": article.slug,
        "slug": article.slug,
        "type": article.type,
        "title": article.title,
        "description": article.description,
        "cover": article.cover,
        "tags": loads_list(article.tags),
        "mood": article.mood,
        "date": article.date,
        "createdAt": article.created_at,
        "updatedAt": article.updated_at,
    }
    if include_content:
        data["content"] = article.content
    return data


def moment_to_dict(moment: Moment) -> dict:
    return {
        "id": moment.id,
        "date": moment.date,
        "content": moment.content,
        "location": moment.location,
        "images": loads_list(moment.images),
        "createdAt": moment.created_at,
    }
