"""管理员登录。

会话 Cookie 与控制台原来的实现一致（xh_mgr_session），
两边共用 MANAGER_SESSION_SECRET，所以控制台的中间件与后端能互相认得。
"""

import time
from collections import defaultdict

from fastapi import APIRouter, Body, Request, Response

from .. import config, security

router = APIRouter()

LOGIN_WINDOW_SECONDS = 600
LOGIN_MAX_ATTEMPTS = 10

_attempts = defaultdict(list)


def _client_ip(request: Request) -> str:
    """取真实客户端 IP，用于登录限流。

    信任顺序：x-real-ip（nginx 会用 $remote_addr 覆写，客户端伪造不了）
    → x-forwarded-for 的最后一段（反代链上最近一跳追加的就是真实来源）
    → 直连地址。

    以前取 X-Forwarded-For 的第一段：nginx 的 $proxy_add_x_forwarded_for
    只是把客户端带来的旧值原样保留在前面，攻击者自带一个假 IP 就能
    每次换身份，限流形同虚设。
    """
    real_ip = (request.headers.get("x-real-ip") or "").strip()
    if real_ip:
        return real_ip[:64]
    forwarded = (request.headers.get("x-forwarded-for") or "").strip()
    if forwarded:
        last = forwarded.split(",")[-1].strip()
        if last:
            return last[:64]
    return request.client.host if request.client else "unknown"


def _too_many(ip: str) -> bool:
    now = time.time()
    hits = [t for t in _attempts[ip] if now - t < LOGIN_WINDOW_SECONDS]
    _attempts[ip] = hits
    return len(hits) >= LOGIN_MAX_ATTEMPTS


def _record_failure(ip: str) -> None:
    _attempts[ip].append(time.time())


@router.post("/login")
def login(request: Request, response: Response, payload: dict = Body(default={})):
    if not config.auth_enabled():
        return {"success": False, "message": "服务端未启用密码登录", "authEnabled": False}

    ip = _client_ip(request)
    if _too_many(ip):
        return {"success": False, "message": "尝试次数过多，请十分钟后再试", "authEnabled": True}

    password = str(payload.get("password", ""))
    if not security.verify_password(password):
        _record_failure(ip)
        return {"success": False, "message": "密码不正确", "authEnabled": True}

    _attempts.pop(ip, None)
    token = security.create_session_token()
    if not token:
        return {"success": False, "message": "服务端未配置会话密钥", "authEnabled": True}

    response.set_cookie(
        security.SESSION_COOKIE,
        token,
        path="/",
        httponly=True,
        samesite="lax",
        max_age=security.SESSION_TTL_SECONDS,
        secure=config._env("MANAGER_COOKIE_SECURE") == "1",
    )
    return {"success": True, "message": "登录成功", "authEnabled": True}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(security.SESSION_COOKIE, path="/")
    return {"success": True, "message": "已退出登录"}


@router.get("/session")
def session_info(request: Request):
    return {
        "success": True,
        "authEnabled": config.auth_enabled(),
        "authenticated": security.is_authenticated(request),
        "sessionTtl": security.SESSION_TTL_SECONDS,
    }
