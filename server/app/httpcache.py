"""JSON 响应的 gzip 压缩与 ETag 条件请求。

    - 可压缩的文本响应（JSON、SVG、纯文本）在 Accept-Encoding 允许时压成 gzip，
      文章列表、站点配置这类大 JSON 传输量能降一个量级；
    - 公开读接口（文章、相册、配置、评论列表等）带 ETag 与 60 秒缓存，
      客户端带 If-None-Match 回来时直接回 304，正文一个字节都不用传。

图片、音频等二进制响应原样流式透传，绝不整张读进内存。
"""

import gzip
import hashlib
from typing import Iterable

from fastapi import Request
from fastapi.responses import Response

MIN_COMPRESS_BYTES = 1024

CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300"

# 可压缩的文本类型（图片 / 音频一律不碰，保持流式透传）
COMPRESSIBLE_PREFIXES = (
    "application/json",
    "application/xml",
    "application/javascript",
    "text/",
    "image/svg+xml",
)

# 公开读接口：加 ETag + Cache-Control，命中时回 304
CACHE_PATH_PREFIXES = (
    "/api/articles",
    "/api/about",
    "/api/moments",
    "/api/tags",
    "/api/albums",
    "/api/friends",
    "/api/projects",
    "/api/config",
    "/api/comments/list",
    "/api/comments/settings",
    "/api/daily-quote",
    "/api/music/local",
)


def _compressible(content_type: str) -> bool:
    value = (content_type or "").split(";")[0].strip().lower()
    return value.startswith(COMPRESSIBLE_PREFIXES)


def _cacheable(method: str, path: str) -> bool:
    if method.upper() != "GET":
        return False
    return path.startswith(CACHE_PATH_PREFIXES)


def _etag_matches(header_value: str, etag: str) -> bool:
    if not header_value:
        return False
    for candidate in header_value.split(","):
        candidate = candidate.strip()
        if candidate.startswith("W/"):
            candidate = candidate[2:]
        if candidate == etag:
            return True
    return False


def _strip(headers, names: Iterable[str]) -> dict:
    """复制响应头并去掉会与新响应体冲突的键。"""
    skipped = {"content-length", "content-encoding", "transfer-encoding", "etag"}
    return {k: v for k, v in headers.items() if k.lower() not in skipped}


async def apply(request: Request, response: Response) -> Response:
    """按请求头决定压缩与缓存，必要时重建响应（否则 body_iterator 已被读空）。"""
    path = request.url.path
    method = request.method
    content_type = response.headers.get("content-type", "")
    accept = request.headers.get("accept-encoding", "")
    want_gzip = "gzip" in accept
    cacheable = _cacheable(method, path)
    compressible = _compressible(content_type) and not response.headers.get("content-encoding")

    if not cacheable and not compressible:
        return response

    # 只有 200 才谈得上缓存命中
    if cacheable and response.status_code == 200:
        raw = bytearray()
        async for chunk in response.body_iterator:
            raw.extend(chunk)
        body = bytes(raw)
        etag = '"{0}"'.format(hashlib.md5(body).hexdigest())

        if _etag_matches(request.headers.get("if-none-match", ""), etag):
            return Response(
                status_code=304,
                headers={
                    "ETag": etag,
                    "Cache-Control": CACHE_CONTROL,
                    "Vary": "Accept-Encoding",
                },
            )

        headers = _strip(response.headers, None)
        headers["ETag"] = etag
        headers["Cache-Control"] = CACHE_CONTROL
        headers["Vary"] = "Accept-Encoding"
        if want_gzip and len(body) >= MIN_COMPRESS_BYTES:
            body = gzip.compress(body, 6)
            headers["Content-Encoding"] = "gzip"
        return _rebuild(response, body, headers)

    # 不缓存，但可压缩（管理后台的大 JSON 也吃这一口）
    if not compressible or not want_gzip:
        return response

    raw = bytearray()
    async for chunk in response.body_iterator:
        raw.extend(chunk)
    body = bytes(raw)
    if len(body) < MIN_COMPRESS_BYTES:
        return Response(content=body, status_code=response.status_code,
                        headers=_strip(response.headers, None))

    headers = _strip(response.headers, None)
    headers["Content-Encoding"] = "gzip"
    headers.setdefault("Vary", "Accept-Encoding")
    return _rebuild(response, gzip.compress(body, 6), headers)


def _rebuild(response: Response, body: bytes, headers: dict) -> Response:
    return Response(
        content=body,
        status_code=response.status_code,
        headers=headers,
        media_type=None,
    )
