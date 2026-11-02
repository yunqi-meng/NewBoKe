"""离线回归测试：始终使用临时数据库，不接触本地内容或外部模型。

运行：python -m unittest discover -s tests -v（在 server 目录下）。
"""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

# 必须在导入 app 前隔离环境，避免 config 自动读取 server/.env 中的真实数据地址。
_temporary = tempfile.TemporaryDirectory(prefix="xhblogs-tests-")
os.environ.update({
    "XHS_DATABASE_URL": "sqlite:///" + str(Path(_temporary.name) / "blog.db").replace("\\", "/"),
    "XHS_DATA_DIR": _temporary.name,
    "XHS_CONTENT_DIR": _temporary.name,
    "MANAGER_ADMIN_PASSWORD_HASH": "test-auth-enabled",
    "MANAGER_SESSION_SECRET": "regression-test-secret",
    "XHS_REVALIDATE_SECRET": "",
    "XHS_CORS_ORIGINS": "http://localhost:3001",
})

from fastapi import FastAPI  # noqa: E402
from fastapi.responses import JSONResponse, StreamingResponse  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import httpcache, security  # noqa: E402
from app.db import Base, SessionLocal, engine, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Comment, CommentLike  # noqa: E402


class ApiRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.scheduler = patch("app.api.dailyquote.start_scheduler")
        cls.revalidation = patch("app.revalidate.schedule")
        cls.scheduler.start()
        cls.revalidation.start()
        cls.client = TestClient(app)
        cls.client.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)
        cls.scheduler.stop()
        cls.revalidation.stop()
        engine.dispose()

    def setUp(self):
        with engine.begin() as connection:
            for table in reversed(Base.metadata.sorted_tables):
                connection.execute(table.delete())
        self.client.cookies.clear()

    def admin(self, method, path, **kwargs):
        return self.client.request(method, path, headers={"X-Admin-Token": "regression-test-secret"}, **kwargs)

    def comment(self, token="visitor", ip="203.0.113.8", **payload):
        return self.client.post("/api/comments/create", headers={
            "X-Visitor-Token": token, "X-Real-IP": ip,
        }, json={"target": "/posts/test", "author_name": "读者", "content": "留言", **payload}).json()

    def test_full_config_requires_admin_and_public_config_omits_ai(self):
        self.admin("PUT", "/api/config", json={"title": "博客", "aiConfig": {"systemPrompt": "private"}})
        for path in ("/api/config", "/api/config/get"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.headers["cache-control"], "no-store")
            response = self.admin("GET", path)
            self.assertEqual(response.json()["data"]["aiConfig"]["systemPrompt"], "private")
            self.assertEqual(response.headers["cache-control"], "no-store")
            self.assertNotIn("etag", response.headers)
        response = self.client.get("/api/config/public")
        self.assertNotIn("aiConfig", response.json()["data"])
        self.assertEqual(response.headers["cache-control"], "public, no-cache")

    def test_admin_daily_quote_config_is_not_publicly_cacheable(self):
        response = self.admin("GET", "/api/daily-quote/config")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertNotIn("etag", response.headers)

    def test_etag_revalidates_after_write_and_304_keeps_cors(self):
        before = self.client.get("/api/articles")
        etag = before.headers["etag"]
        response = self.client.get("/api/articles", headers={
            "If-None-Match": etag, "Origin": "http://localhost:3001",
        })
        self.assertEqual(response.status_code, 304)
        self.assertEqual(response.content, b"")
        self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:3001")
        self.assertIn("Origin", response.headers["vary"])
        self.assertIn("Accept-Encoding", response.headers["vary"])
        self.admin("POST", "/api/articles", json={"slug": "new", "title": "新内容"})
        response = self.client.get("/api/articles", headers={"If-None-Match": etag})
        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(response.headers["etag"], etag)

    def test_etag_wildcard_and_weak_comparison(self):
        response = self.client.get("/api/articles")
        for etag in ("*", response.headers["etag"].removeprefix("W/")):
            self.assertEqual(self.client.get("/api/articles", headers={"If-None-Match": etag}).status_code, 304)

    def test_gzip_negotiation_and_roundtrip(self):
        self.admin("POST", "/api/articles", json={"slug": "large", "description": "测试内容" * 2000})
        for accept in ("identity", "gzip;q=0", "gzip;q=0, *;q=1"):
            response = self.client.get("/api/articles", headers={"Accept-Encoding": accept})
            self.assertNotIn("content-encoding", response.headers)
        response = self.client.get("/api/articles", headers={"Accept-Encoding": "gzip"})
        self.assertEqual(response.headers["content-encoding"], "gzip")
        self.assertEqual(response.json()["articles"][0]["description"], "测试内容" * 2000)

    def test_session_response_never_cached_and_cookie_is_accepted(self):
        response = self.client.get("/api/auth/session")
        self.assertFalse(response.json()["authenticated"])
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.client.cookies.set(security.SESSION_COOKIE, security.create_session_token())
        self.assertTrue(self.client.get("/api/auth/session").json()["authenticated"])

    def test_malformed_collection_sync_preserves_existing_rows(self):
        for key in ("albums", "friends", "projects"):
            path = f"/api/{key}/sync"
            item = {"id": "keep", "title": "相册", "photos": [{"url": "/uploads/a.png"}]}
            self.assertTrue(self.admin("POST", path, json={key: [item]}).json()["success"])
            for malformed in ({}, {key: None}, {key: "oops"}, {key: [None]}, {key: [item, item]}):
                self.assertEqual(self.admin("POST", path, json=malformed).status_code, 422)
                self.assertEqual(self.client.get(f"/api/{key}/list").json()["count"], 1)
            self.assertTrue(self.admin("POST", path, json={key: []}).json()["success"])
            self.assertEqual(self.client.get(f"/api/{key}/list").json()["count"], 0)

    def test_malformed_photos_preserve_albums(self):
        self.admin("POST", "/api/albums/sync", json={"albums": [{"id": "keep"}]})
        for photos in ([1], {}, ""):
            response = self.admin("POST", "/api/albums/sync", json={"albums": [{"id": "bad", "photos": photos}]})
            self.assertEqual(response.status_code, 422)
            self.assertEqual(self.client.get("/api/albums/list").json()["albums"][0]["id"], "keep")

    def test_reply_to_reply_is_visible_under_root(self):
        root = self.comment()["data"]["id"]
        reply = self.comment(parent_id=root)["data"]["id"]
        third = self.comment(parent_id=reply)["data"]["id"]
        items = self.client.get("/api/comments/list", params={"target": "/posts/test"}).json()["data"]["items"]
        self.assertEqual([row["id"] for row in items[0]["replies"]], [reply, third])

    def test_admin_reply_to_reply_is_visible(self):
        root = self.comment()["data"]["id"]
        reply = self.comment(parent_id=root)["data"]["id"]
        response = self.admin("POST", "/api/comments/admin/reply", json={"parent_id": reply, "content": "站长回复"})
        items = self.client.get("/api/comments/list", params={"target": "/posts/test"}).json()["data"]["items"]
        self.assertIn(response.json()["data"]["id"], [item["id"] for item in items[0]["replies"]])

    def test_cannot_reply_to_hidden_comment(self):
        root = self.comment()["data"]["id"]
        self.admin("POST", "/api/comments/admin/status", json={"id": root, "status": "hidden"})
        self.assertFalse(self.comment(parent_id=root)["success"])

    def test_rate_limit_survives_visitor_token_rotation(self):
        for index in range(5):
            self.assertTrue(self.comment(token=f"visitor-{index}")["success"])
        self.assertFalse(self.comment(token="another-visitor")["success"])

    def test_rate_limit_without_token_uses_persisted_ip(self):
        for _ in range(5):
            self.assertTrue(self.comment(token="")["success"])
        self.assertFalse(self.comment(token="")["success"])

    def test_overlong_comment_is_rejected_at_hard_limit(self):
        self.admin("POST", "/api/comments/admin/settings", json={"settings": {"maxLength": 2000}})
        self.assertFalse(self.comment(content="字" * 2001)["success"])

    def test_like_without_token_deduplicates_by_ip(self):
        root = self.comment()["data"]["id"]
        headers = {"X-Real-IP": "203.0.113.9"}
        first = self.client.post("/api/comments/like", json={"id": root}, headers=headers).json()
        second = self.client.post("/api/comments/like", json={"id": root}, headers=headers).json()
        self.assertEqual(first["data"]["likes"], 1)
        self.assertEqual(second["data"]["likes"], 1)
        self.assertTrue(second["data"]["duplicated"])

    def test_comments_disabled_also_disables_likes(self):
        root = self.comment()["data"]["id"]
        self.admin("POST", "/api/comments/admin/settings", json={"settings": {"enabled": False}})
        response = self.client.post("/api/comments/like", json={"id": root}, headers={"X-Visitor-Token": "visitor"})
        self.assertFalse(response.json()["success"])

    def test_delete_thread_cleans_legacy_descendants_and_likes(self):
        for endpoint, extra in (("delete", {}), ("bulk", {"action": "delete"})):
            root = self.comment()["data"]["id"]
            with SessionLocal() as db:
                child = Comment(target="/posts/test", parent_id=root, status="approved")
                db.add(child)
                db.flush()
                grandchild = Comment(target="/posts/test", parent_id=child.id, status="approved")
                db.add(grandchild)
                db.flush()
                for comment_id in (root, child.id, grandchild.id):
                    db.add(CommentLike(comment_id=comment_id, visitor_id="visitor"))
                db.commit()
            self.admin("POST", f"/api/comments/admin/{endpoint}", json={"id": root, **extra})
            with SessionLocal() as db:
                self.assertEqual(db.query(Comment).count(), 0)
                self.assertEqual(db.query(CommentLike).count(), 0)

    def test_media_svg_has_sandbox_and_path_escape_is_rejected(self):
        response = self.admin("POST", "/api/media/upload", files={"file": ("test.svg", b'<svg xmlns="http://www.w3.org/2000/svg"/>', "image/svg+xml")})
        name = response.json()["name"]
        response = self.client.get(f"/api/media/file/{name}")
        self.assertIn("sandbox", response.headers["content-security-policy"])
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")
        for name in ("..%5Csecret.txt", "C:secret.txt", "%00"):
            self.assertEqual(self.client.get(f"/api/media/file/{name}").status_code, 404)

    def test_music_range_remains_partial_and_uncompressed(self):
        directory = Path(_temporary.name) / "music"
        directory.mkdir(exist_ok=True)
        (directory / "range.mp3").write_bytes(b"0123456789" * 1000)
        response = self.client.get("/api/music/file/range.mp3", headers={"Range": "bytes=10-19"})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, b"0123456789")
        self.assertEqual(response.headers["content-range"], "bytes 10-19/10000")
        self.assertNotIn("content-encoding", response.headers)


class MiddlewareRegressionTests(unittest.TestCase):
    def test_compression_preserves_multiple_cookies(self):
        application = FastAPI()

        @application.middleware("http")
        async def middleware(request, call_next):
            return await httpcache.apply(request, await call_next(request))

        @application.get("/api/private")
        def private():
            response = JSONResponse({"value": "x" * 3000})
            response.set_cookie("one", "1")
            response.set_cookie("two", "2")
            return response

        with TestClient(application) as client:
            response = client.get("/api/private")
            self.assertEqual(len(response.headers.get_list("set-cookie")), 2)
            self.assertEqual(response.json()["value"], "x" * 3000)
            self.assertEqual(response.headers["cache-control"], "no-store")

    def test_event_stream_is_not_compressed(self):
        application = FastAPI()

        @application.middleware("http")
        async def middleware(request, call_next):
            return await httpcache.apply(request, await call_next(request))

        @application.get("/api/events")
        def events():
            return StreamingResponse(iter(["data: " + "x" * 3000 + "\n\n"]), media_type="text/event-stream")

        with TestClient(application) as client:
            response = client.get("/api/events")
            self.assertNotIn("content-encoding", response.headers)


if __name__ == "__main__":
    try:
        unittest.main()
    finally:
        engine.dispose()
        _temporary.cleanup()
