"""公开 JSON 接口的条件请求与压缩；管理接口禁止缓存，文件保持流式传输。"""

import gzip
import hashlib

from fastapi import Request
from fastapi.responses import Response

MIN_COMPRESS_BYTES = 1024
# 每次使用前校验：保存后的第一次读取即可拿到新内容。
CACHE_CONTROL = "public, no-cache"
PUBLIC_PATHS = frozenset({
    "/api/articles", "/api/about", "/api/moments", "/api/tags",
    "/api/albums", "/api/albums/list", "/api/friends", "/api/friends/list",
    "/api/projects", "/api/projects/list", "/api/config/public",
    "/api/comments/list", "/api/comments/settings",
    "/api/daily-quote", "/api/daily-quote/history", "/api/music/local",
})


def _cacheable(method: str, path: str) -> bool:
    if method.upper() != "GET":
        return False
    path = path.rstrip("/")
    return path in PUBLIC_PATHS or (
        path.startswith("/api/articles/") and path.count("/") == 3
    )


def _accepts_gzip(value: str) -> bool:
    qualities = {}
    for item in value.lower().split(","):
        encoding, *parameters = item.strip().split(";")
        quality = 1.0
        for parameter in parameters:
            name, _, raw = parameter.strip().partition("=")
            if name == "q":
                try:
                    quality = float(raw)
                except ValueError:
                    quality = 0.0
        qualities[encoding] = quality
    return qualities.get("gzip", qualities.get("*", 0)) > 0


def _etag_matches(value: str, etag: str) -> bool:
    def normalize(tag: str) -> str:
        return tag.removeprefix("W/")

    return any(
        tag.strip() == "*" or normalize(tag.strip()) == normalize(etag)
        for tag in value.split(",") if tag.strip()
    )


async def apply(request: Request, response: Response) -> Response:
    """仅收集 JSON；音频 Range、图片及事件流不读取 body_iterator。"""
    path = request.url.path
    is_json = response.headers.get("content-type", "").split(";")[0].strip() == "application/json"
    cacheable = (
        is_json and response.status_code == 200
        and _cacheable(request.method, path)
        and "set-cookie" not in response.headers
        and not any(directive in response.headers.get("cache-control", "").lower()
                    for directive in ("private", "no-store"))
    )
    if path.startswith("/api/") and is_json and not cacheable:
        response.headers["Cache-Control"] = "no-store"

    if not is_json or response.status_code != 200 or response.headers.get("content-encoding"):
        return response

    # 所有可能压缩的响应均声明 Vary，防止共享缓存混用编码版本。
    response.headers.add_vary_header("Accept-Encoding")
    want_gzip = _accepts_gzip(request.headers.get("accept-encoding", ""))
    if not cacheable and not want_gzip:
        return response

    body = b"".join([chunk async for chunk in response.body_iterator])
    if cacheable:
        # 不同编码共享语义等价的弱 ETag。
        etag = 'W/"' + hashlib.sha256(body).hexdigest() + '"'
        response.headers["ETag"] = etag
        response.headers["Cache-Control"] = CACHE_CONTROL
        if _etag_matches(request.headers.get("if-none-match", ""), etag):
            result = Response(status_code=304, background=response.background)
            result.raw_headers = [
                (key, value) for key, value in response.raw_headers
                if key.lower() not in {b"content-length", b"content-type", b"content-encoding"}
            ]
            return result

    if want_gzip and len(body) >= MIN_COMPRESS_BYTES:
        body = gzip.compress(body, compresslevel=6, mtime=0)
        response.headers["Content-Encoding"] = "gzip"

    result = Response(content=body, status_code=response.status_code, background=response.background)
    # raw_headers 保留重复的 Set-Cookie 与 CORS/Vary 等响应头。
    result.raw_headers = [
        (key, value) for key, value in response.raw_headers
        if key.lower() not in {b"content-length", b"transfer-encoding"}
    ]
    result.headers["Content-Length"] = str(len(body))
    return result
