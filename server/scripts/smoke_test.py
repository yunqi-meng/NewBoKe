"""接口冒烟测试。

    python scripts/smoke_test.py [--base http://127.0.0.1:8000] [--token <密钥>]

把统一后端的主要接口都走一遍，确认读写都通。
测试数据用独立前缀，跑完自动清理。

写操作需要管理员身份。传 --token（值就是会话密钥）即可，
它会以 X-Admin-Token 请求头带上；也可以用环境变量
XHS_ADMIN_TOKEN 或 MANAGER_SESSION_SECRET 提供。
没有配置口令的本地环境不需要传，直接放行。
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

PREFIX = "smoke-test"
_passed = 0
_failed = 0
# 写操作要带的管理员身份，由 main() 从命令行或环境变量里取
_token = ""


def request(base: str, method: str, path: str, payload: Any = None) -> Dict[str, Any]:
    url = base.rstrip("/") + path
    data = None
    headers = {}
    if _token:
        headers["X-Admin-Token"] = _token
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            body = response.read().decode("utf-8", "replace")
            status = response.status
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", "replace")
        status = error.code
    try:
        return {"status": status, "json": json.loads(body)}
    except ValueError:
        return {"status": status, "text": body}


def check(name: str, condition: bool, detail: str = "") -> None:
    global _passed, _failed
    if condition:
        _passed += 1
        print("  ✅ %s" % name)
    else:
        _failed += 1
        print("  ❌ %s %s" % (name, detail))


def main() -> int:
    global _token
    parser = argparse.ArgumentParser(description="统一后端接口冒烟测试")
    parser.add_argument("--base", default="http://127.0.0.1:8000")
    parser.add_argument(
        "--token",
        default="",
        help="管理员身份令牌（会话密钥）。默认从 XHS_ADMIN_TOKEN 或 MANAGER_SESSION_SECRET 读取",
    )
    args = parser.parse_args()
    base = args.base

    _token = (args.token or os.environ.get("XHS_ADMIN_TOKEN")
              or os.environ.get("MANAGER_SESSION_SECRET") or "").strip()

    print("🔍 测试目标：%s" % base)
    print("🔑 管理员身份：%s\n" % ("已带令牌" if _token else "未带令牌（后端未启用口令时应可正常写）"))

    print("▶ 基础状态")
    result = request(base, "GET", "/api/status")
    check("GET /api/status", result["status"] == 200 and result["json"].get("status") == "online",
          str(result)[:200])

    print("\n▶ 文章读写")
    slug = "%s-post" % PREFIX
    result = request(base, "POST", "/api/articles", {
        "slug": slug, "type": "post", "title": "冒烟测试文章",
        "description": "由冒烟测试创建", "content": "# 正文\n\n测试内容",
        "tags": ["测试"], "date": "2026-10-29 19:00:00",
    })
    check("POST /api/articles", result["status"] == 200 and result["json"].get("success"),
          str(result)[:200])

    result = request(base, "GET", "/api/articles/%s" % slug)
    article = result["json"].get("article") or {}
    check("GET /api/articles/{slug}", result["status"] == 200 and article.get("title") == "冒烟测试文章",
          str(result)[:200])
    check("正文已入库", "测试内容" in (article.get("content") or ""), str(article)[:160])

    result = request(base, "GET", "/api/articles?type=post")
    slugs = [item.get("slug") for item in result["json"].get("articles", [])]
    check("GET /api/articles?type=post", slug in slugs, str(slugs)[:160])

    print("\n▶ 说说读写")
    moment_id = "%s-moment" % PREFIX
    result = request(base, "POST", "/api/moments", {
        "id": moment_id, "content": "冒烟测试说说", "date": "2026-10-29 19:00:00", "images": [],
    })
    check("POST /api/moments", result["status"] == 200 and result["json"].get("success"),
          str(result)[:200])

    result = request(base, "GET", "/api/moments")
    ids = [item.get("id") for item in result["json"].get("moments", [])]
    check("GET /api/moments", moment_id in ids, str(ids)[:160])

    print("\n▶ 站点配置")
    result = request(base, "GET", "/api/config/get")
    check("GET /api/config/get", result["status"] == 200 and result["json"].get("success"),
          str(result)[:200])
    original_nav_title = (result["json"].get("data") or {}).get("navTitle")

    result = request(base, "POST", "/api/config/update", {"updates": {"navTitle": "冒烟测试导航"}})
    check("POST /api/config/update", result["status"] == 200 and result["json"].get("success"),
          str(result)[:200])

    result = request(base, "GET", "/api/config/get")
    check("配置已写入", (result["json"].get("data") or {}).get("navTitle") == "冒烟测试导航",
          str(result["json"])[:200])

    print("\n▶ 草稿与发布")
    result = request(base, "POST", "/api/drafts/save", {
        "id": "new", "type": "post", "title": "冒烟测试草稿", "content": "<p>草稿正文</p>",
    })
    draft_id = result["json"].get("id") or ""
    check("POST /api/drafts/save", result["status"] == 200 and bool(draft_id), str(result)[:200])

    result = request(base, "GET", "/api/drafts")
    drafts = result["json"].get("drafts", [])
    check("GET /api/drafts", any(item.get("id") == draft_id for item in drafts), str(drafts)[:200])

    result = request(base, "POST", "/api/drafts/publish", {
        "id": draft_id, "type": "post", "title": "冒烟测试发布",
        "content": "<p>由草稿发布出来的正文</p>", "tags": ["测试"], "date": "2026-10-29 19:05:00",
    })
    check("POST /api/drafts/publish", result["status"] == 200 and result["json"].get("success"),
          str(result)[:200])

    published_slug = draft_id
    result = request(base, "GET", "/api/articles/%s" % published_slug)
    check("草稿已变成文章", result["json"].get("article") is not None, str(result)[:200])

    print("\n▶ 评论")
    result = request(base, "POST", "/api/comments/create", {
        "target": slug, "author_name": "冒烟测试", "content": "这是一条测试评论",
    })
    check("POST /api/comments/create", result["status"] == 200 and result["json"].get("success"),
          str(result)[:200])

    result = request(base, "GET", "/api/comments/list?target=%s" % slug)
    items = (result["json"].get("data") or {}).get("items", [])
    check("GET /api/comments/list", len(items) >= 1, str(items)[:200])

    result = request(base, "GET", "/api/comments/admin/stats")
    check("GET /api/comments/admin/stats", result["status"] == 200, str(result)[:200])

    print("\n▶ 集合类接口")
    for path in ("/api/albums/list", "/api/friends/list", "/api/projects/list", "/api/tags"):
        result = request(base, "GET", path)
        check("GET %s" % path, result["status"] == 200 and result["json"].get("success"),
              str(result)[:200])

    print("\n▶ 音乐与每日一句")
    result = request(base, "GET", "/api/music/local")
    check("GET /api/music/local", result["status"] == 200, str(result)[:200])

    result = request(base, "GET", "/api/daily-quote")
    check("GET /api/daily-quote", result["status"] == 200, str(result)[:200])

    print("\n▶ 发布与快照")
    result = request(base, "GET", "/api/deploy/snapshots")
    check("GET /api/deploy/snapshots", result["status"] == 200, str(result)[:200])

    result = request(base, "GET", "/api/deploy/status")
    check("GET /api/deploy/status", result["status"] == 200, str(result)[:200])

    print("\n▶ 清理")
    request(base, "DELETE", "/api/articles/%s" % slug)
    request(base, "DELETE", "/api/articles/%s" % published_slug)
    request(base, "DELETE", "/api/moments/%s" % moment_id)

    # 删掉刚才那条测试评论：后台审核接口需要管理员身份，这里直接按作者清
    result = request(base, "GET", "/api/comments/list?target=%s" % slug)
    for item in (result["json"].get("data") or {}).get("items", []):
        if item.get("author_name") == "冒烟测试":
            request(base, "POST", "/api/comments/admin/delete", {"id": item.get("id")})

    # 站点配置改过要还原，不能把冒烟测试的痕迹留在正式数据里
    if original_nav_title is not None:
        request(base, "POST", "/api/config/update", {"updates": {"navTitle": original_nav_title}})

    result = request(base, "GET", "/api/articles/%s" % slug)
    check("测试文章已删除", result["json"].get("success") is False, str(result)[:160])

    result = request(base, "GET", "/api/config/get")
    check("配置已还原", (result["json"].get("data") or {}).get("navTitle") == original_nav_title,
          str(result["json"])[:160])

    print("\n%d 通过 / %d 失败" % (_passed, _failed))
    return 0 if _failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
