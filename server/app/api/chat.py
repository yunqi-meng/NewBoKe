"""AI 煤球的对话接口。

放在后端的原因：
  - 密钥只从环境变量读，仓库里不存任何口令，而且只有这一处读密钥；
  - 煤球的模型、人设、生成预算都存在站点配置里（数据库），前后台共用同一份；
  - 公开站与控制台都通过同一套 /api/chat 说话，不会两套人设。

对外接口：
  POST /api/chat        发一句话给煤球
  GET  /api/chat        看当前接的模型与渠道（不涉及密钥）
"""

import json
import os
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse

from ..db import session_scope
from .config import read_config

router = APIRouter()

CHAT_TIMEOUT = 90

DEFAULT_SETTINGS = {
    "modelId": "deepseek-flash",
    "baseUrl": "https://api.deepseek.com",
    "systemPrompt": "",
    "maxOutputTokens": 256,
    "temperature": 0.85,
    "effort": "",
}


def _log(*parts) -> None:
    """打日志，但绝不让日志把请求带崩（Windows 终端默认 GBK）。"""
    try:
        print(*parts)
    except Exception:
        pass


def _api_key() -> str:
    """密钥只从环境变量读，仓库里不保存任何口令。"""
    for name in ("DEEPSEEK_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"):
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return ""


def _ai_settings() -> Dict[str, Any]:
    """站点配置里的 aiConfig，缺字段用默认值补齐。"""
    settings = dict(DEFAULT_SETTINGS)
    try:
        with session_scope() as session:
            parsed = read_config(session)
        ai = parsed.get("aiConfig") or {}
        if ai.get("modelId"):
            settings["modelId"] = str(ai["modelId"]).strip()
        if ai.get("baseUrl"):
            settings["baseUrl"] = str(ai["baseUrl"]).strip().rstrip("/")
        if ai.get("systemPrompt"):
            settings["systemPrompt"] = str(ai["systemPrompt"])
        if ai.get("maxOutputTokens"):
            settings["maxOutputTokens"] = int(ai["maxOutputTokens"])
        if ai.get("temperature") is not None:
            settings["temperature"] = float(ai["temperature"])
        if ai.get("effort"):
            settings["effort"] = str(ai["effort"]).strip()
    except Exception as error:
        _log("⚠️ 读取站点配置的 aiConfig 失败，改用默认模型：", error)
    return settings


def _base_url(settings: Dict[str, Any]) -> str:
    """接口地址，环境变量优先；末尾斜杠去掉，避免拼出双斜杠。"""
    override = os.environ.get("AI_BASE_URL", "").strip()
    raw = override or settings["baseUrl"] or DEFAULT_SETTINGS["baseUrl"]
    return raw.rstrip("/")


def _request(base_url: str, key: str, body: Dict[str, Any]) -> Dict[str, Any]:
    outgoing = urllib.request.Request(
        base_url + "/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + key},
        method="POST",
    )
    with urllib.request.urlopen(outgoing, timeout=CHAT_TIMEOUT) as response:
        return json.loads(response.read().decode("utf-8"))


@router.post("")
@router.post("/")
def chat(payload: Dict[str, Any] = Body(default={})):
    """发一句话给煤球。"""
    message = str((payload or {}).get("message") or "")
    settings = _ai_settings()

    key = _api_key()
    if not key:
        _log("❌ 找不到 API Key")
        return JSONResponse({"error": "Key missing"}, status_code=500)

    base_url = _base_url(settings)
    model_id = settings["modelId"]
    body = {
        "model": model_id,
        "messages": [
            {"role": "system", "content": settings["systemPrompt"]},
            {"role": "user", "content": message},
        ],
        "max_tokens": settings["maxOutputTokens"],
        "temperature": settings["temperature"],
    }
    # 推理强度：低配省时间，高配让煤球多想一会儿
    if settings.get("effort"):
        body["effort"] = settings["effort"]

    _log(f"📡 正在呼叫模型: {model_id} @ {base_url}")

    try:
        data = _request(base_url, key, body)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:300]
        # 有些兼容渠道不认识 effort 参数，遇到 400 就摘掉重试一次
        if error.code == 400 and body.get("effort"):
            _log("⚠️ 接口不接受 effort 参数，摘掉后重试")
            body.pop("effort", None)
            try:
                data = _request(base_url, key, body)
            except urllib.error.HTTPError as retry_error:
                retry_detail = retry_error.read().decode("utf-8", "replace")[:300]
                _log("🚨 模型拒绝了请求:", retry_detail)
                return JSONResponse(
                    {
                        "error": f"模型拒绝访问: {retry_error.code}",
                        "details": retry_detail or "未知错误",
                    },
                    status_code=retry_error.code,
                )
            except Exception as retry_error:
                _log("🔥 调用模型失败:", retry_error)
                return JSONResponse(
                    {"error": f"调用模型失败：{retry_error}"}, status_code=502
                )
        else:
            _log("🚨 模型拒绝了请求:", detail)
            return JSONResponse(
                {"error": f"模型拒绝访问: {error.code}", "details": detail or "未知错误"},
                status_code=error.code,
            )
    except Exception as error:
        _log("🔥 调用模型失败:", error)
        return JSONResponse({"error": f"调用模型失败：{error}"}, status_code=502)

    choices = data.get("choices") or []
    first: Optional[Dict[str, Any]] = choices[0] if choices else None
    content = ""
    if isinstance(first, dict):
        raw_content = (first.get("message") or {}).get("content")
        if isinstance(raw_content, str):
            content = raw_content.strip()

    if not content:
        # 推理模型可能把预算全花在思考上，正文就空了，这时给个兜底台词
        _log("⚠️ 模型没有返回正文（可能推理预算用尽）")
        return {"reply": "本喵想得太入神，话卡在嘴边了喵…"}

    _log("✅ 回复已生成，准备传回前端")
    return {"reply": content}


@router.get("")
@router.get("/")
def chat_status():
    """看当前接的模型与渠道，不涉及密钥。"""
    settings = _ai_settings()
    return {
        "status": "Ready",
        "model": settings["modelId"],
        "provider": _base_url(settings),
        "hasKey": bool(_api_key()),
    }
