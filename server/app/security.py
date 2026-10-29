"""鉴权：管理员口令与会话令牌。

会话令牌格式与控制台原来的实现完全一致（`<过期毫秒>.<HMAC-SHA256 base64url>`），
所以控制台与后端共用同一个 MANAGER_SESSION_SECRET 就能互相认得对方的 Cookie。

密钥只从环境变量读取，仓库里不保存任何口令或哈希。
"""

import base64
import hashlib
import hmac
import time

from fastapi import Depends, HTTPException, Request, status

from . import config

SESSION_COOKIE = "xh_mgr_session"
SESSION_TTL_SECONDS = 7 * 24 * 60 * 60


# ---------------------------------------------------------------- 会话令牌
def _sign(payload: str) -> str:
    secret = config.session_secret()
    if not secret:
        return ""
    return base64.urlsafe_b64encode(
        hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    ).rstrip(b"=").decode("ascii")


def create_session_token() -> str:
    """签发一个 7 天有效的会话令牌。"""
    expires_at = int(time.time() * 1000) + SESSION_TTL_SECONDS * 1000
    payload = str(expires_at)
    signature = _sign(payload)
    if not signature:
        return ""
    return f"{payload}.{signature}"


def verify_session_token(token: str) -> bool:
    """校验会话令牌。"""
    if not token:
        return False
    separator = token.rfind(".")
    if separator <= 0:
        return False
    payload = token[:separator]
    signature = token[separator + 1:]
    try:
        expires_at = int(payload)
    except ValueError:
        return False
    if expires_at < int(time.time() * 1000):
        return False
    expected = _sign(payload)
    if not expected:
        return False
    return hmac.compare_digest(signature, expected)


# ---------------------------------------------------------------- 口令
def verify_password(password: str, stored: str = "") -> bool:
    """校验 scrypt 密码哈希，格式 scrypt$N$r$p$salt$hash。"""
    if not stored:
        stored = config.password_hash()
    if not stored:
        return False
    parts = stored.split("$")
    if len(parts) != 6 or parts[0] != "scrypt":
        return False
    _, n, r, p, salt_b64, hash_b64 = parts
    try:
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected),
        )
    except Exception:
        return False
    return hmac.compare_digest(actual, expected)


# ---------------------------------------------------------------- 依赖
def request_session(request: Request) -> str:
    return request.cookies.get(SESSION_COOKIE, "") or ""


def is_authenticated(request: Request) -> bool:
    """没有配置口令时视为免密模式（本地桌面版可用）。"""
    if not config.auth_enabled():
        return True
    return verify_session_token(request_session(request))


def require_admin(request: Request) -> None:
    """写操作都要过这一关。没有配置口令时直接放行。

    两种身份都认：
      1. 浏览器带来的会话 Cookie（控制台正常登录走这条）
      2. X-Admin-Token 请求头（脚本化调用走这条，例如冒烟测试、
         运维脚本；它的值就是会话密钥，能拿到它的人本来也能伪造会话）
    """
    if not config.auth_enabled():
        return
    if verify_session_token(request_session(request)):
        return
    token = request.headers.get("x-admin-token", "")
    if token and hmac.compare_digest(token, config.session_secret()):
        return
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未授权，请先登录管理后台")


# 兼容旧名字：语义已经完全并入 require_admin
require_admin_or_token = require_admin


AdminDep = Depends(require_admin)
