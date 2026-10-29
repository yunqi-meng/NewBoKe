"""每日励志语：让当前接入的 AI（默认是煤球）每天说一句话。

为什么放在内容引擎里：
  - 引擎是控制台与公开站共用的唯一数据源，励志语只有一份，不会两边打架；
  - 引擎常驻运行，可以自己按点生成，不必依赖谁来打开控制台；
  - AI 密钥只从环境变量读，仓库里不存任何口令。

对外接口：
  GET  /api/daily-quote           取今天的励志语（今天没有且开启了自动生成时顺手补一条）
  POST /api/daily-quote/generate  立刻重新生成一句
  POST /api/daily-quote/manual    手工写一句（覆盖今天的自动生成结果）
  GET  /api/daily-quote/config    读取设置
  PUT  /api/daily-quote/config    保存设置
  GET  /api/daily-quote/history   最近若干天的励志语
"""

import json
import os
import re
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse

router = APIRouter()

# --------------------------------------------------------------------------
# 路径与常量
# --------------------------------------------------------------------------
CURRENT_API_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_API_DIR, "..", ".."))
MANAGER_ROOT = os.environ.get("XHS_MANAGER_ROOT") or PROJECT_ROOT
DATA_DIR = os.path.join(MANAGER_ROOT, "data")
CONFIG_PATH = os.path.join(DATA_DIR, "dailyQuoteConfig.json")
STORE_PATH = os.path.join(DATA_DIR, "dailyQuote.json")

BEIJING = timezone(timedelta(hours=8))
HISTORY_LIMIT = 30
GENERATE_TIMEOUT = 90

DEFAULT_CONFIG = {
    # 是否在首页展示这一栏
    "enabled": True,
    # 是否每天定时自动生成
    "autoGenerate": True,
    # 卡片标题与副标题
    "title": "每日一句",
    "subtitle": "煤球的今日打气",
    # 是否展示日期与署名
    "showDate": True,
    "showSource": True,
    # 每日自动生成时间（北京时间，HH:MM）
    "generateTime": "07:00",
    # 送给模型的用户提示词，{date} 会被替换成当天日期
    "prompt": "今天是 {date}。请给主人一句简短的励志话语，一句话就好，不要解释，不要前缀，直接把这句话说出来。",
    # 单句最长字数，超出会截断
    "maxLength": 60,
    # 署名，会显示在卡片右下角
    "sourceLabel": "煤球",
}

# 设置里允许被改写的字段，其余一律忽略
CONFIG_FIELDS = {
    "enabled": bool,
    "autoGenerate": bool,
    "title": str,
    "subtitle": str,
    "showDate": bool,
    "showSource": bool,
    "generateTime": str,
    "prompt": str,
    "maxLength": int,
    "sourceLabel": str,
}

_write_lock = threading.RLock()
_scheduler_thread = None
_scheduler_stop = threading.Event()


def _log(*parts) -> None:
    """打日志，但绝不让日志本身把定时线程带崩。

    Windows 终端默认是 GBK，遇到表情符号会抛 UnicodeEncodeError；
    定时线程一崩，每天的自动生成就再也不会发生了。
    """
    try:
        print(*parts)
    except Exception:
        pass


# --------------------------------------------------------------------------
# 小工具
# --------------------------------------------------------------------------
def today_str(moment=None) -> str:
    """站点统一用 YYYY.MM.DD 的日期格式（与壁纸等保持一致）。"""
    return (moment or datetime.now(BEIJING)).strftime("%Y.%m.%d")


def _atomic_write(path: str, payload) -> None:
    """先写临时文件再改名，避免读到半截 JSON。"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as stream:
        json.dump(payload, stream, ensure_ascii=False, indent=2)
    os.replace(temporary, path)


def _read_json(path: str, default):
    try:
        with open(path, "r", encoding="utf-8") as stream:
            return json.load(stream)
    except (OSError, ValueError):
        return default


def _api_key() -> str:
    """密钥只从环境变量读，仓库里不保存任何口令。"""
    for name in ("DEEPSEEK_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"):
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return ""


def _ai_settings() -> dict:
    """复用控制台 siteConfig.ts 里的 aiConfig，保证跟煤球用的是同一套模型与人设。"""
    settings = {
        "modelId": "deepseek-flash",
        "baseUrl": "https://api.deepseek.com",
        "systemPrompt": "",
        "maxOutputTokens": 256,
        "temperature": 0.85,
        "effort": "",
    }
    try:
        from cms_core.api.config import get_site_config

        parsed = get_site_config() or {}
        ai = (parsed.get("data") or {}).get("aiConfig") or {}
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
    except Exception as error:  # 配置读不到时用默认值，不影响励志语功能
        _log("⚠️ 读取 siteConfig.ts 的 aiConfig 失败，改用默认模型：", error)
    return settings


def _clean_quote(text: str, max_length: int) -> str:
    """把模型的话收拾成一句干净的励志语。"""
    value = (text or "").strip()
    if not value:
        return ""
    # 去掉代码块包裹
    value = re.sub(r"^```[a-zA-Z]*\s*|\s*```$", "", value).strip()
    # 去掉常见的「今日一句：」「励志话语：」之类前缀
    value = re.sub(r"^(?:今日一句|今日励志|励志话语|励志语|每日一句|一句话)\s*[:：]\s*", "", value)
    # 换行压成空格，只保留一句
    value = re.sub(r"\s+", " ", value).strip()
    # 去掉包裹引号
    value = value.strip("「」『』\"'“”‘’")
    value = value.strip()
    if max_length > 0 and len(value) > max_length:
        value = value[:max_length].rstrip("，。、；：,.;: ") + "…"
    return value


# --------------------------------------------------------------------------
# 配置与存储
# --------------------------------------------------------------------------
def read_config() -> dict:
    """读取设置，缺字段用默认值补齐。"""
    stored = _read_json(CONFIG_PATH, {})
    config = dict(DEFAULT_CONFIG)
    if isinstance(stored, dict):
        for key, value in stored.items():
            if key in CONFIG_FIELDS and isinstance(value, CONFIG_FIELDS[key]):
                config[key] = value
    if not re.match(r"^([01]\d|2[0-3]):[0-5]\d$", str(config["generateTime"])):
        config["generateTime"] = DEFAULT_CONFIG["generateTime"]
    config["maxLength"] = max(10, min(200, int(config["maxLength"])))
    return config


def write_config(payload: dict) -> dict:
    """保存设置，只接受白名单字段。"""
    if not isinstance(payload, dict):
        raise ValueError("设置内容必须是一个对象")
    current = read_config()
    for key, expected in CONFIG_FIELDS.items():
        if key not in payload:
            continue
        value = payload[key]
        if expected is bool:
            current[key] = bool(value)
        elif expected is int:
            try:
                current[key] = int(value)
            except (TypeError, ValueError):
                raise ValueError(f"{key} 需要是一个整数")
        elif expected is str:
            current[key] = str(value)
    if not re.match(r"^([01]\d|2[0-3]):[0-5]\d$", str(current["generateTime"])):
        raise ValueError("生成时间格式应为 HH:MM（24 小时制，北京时间）")
    current["maxLength"] = max(10, min(200, int(current["maxLength"])))
    with _write_lock:
        _atomic_write(CONFIG_PATH, current)
    return current


def read_store() -> dict:
    """读取今日励志语与历史。"""
    stored = _read_json(STORE_PATH, {})
    if not isinstance(stored, dict):
        stored = {}
    current = stored.get("current") if isinstance(stored.get("current"), dict) else None
    history = stored.get("history") if isinstance(stored.get("history"), list) else []
    return {"version": 1, "current": current, "history": history[:HISTORY_LIMIT]}


def write_store(store: dict) -> None:
    with _write_lock:
        _atomic_write(STORE_PATH, store)


def _save_quote(quote: str, source: str, model: str = "", label: str = "") -> dict:
    """把一句话写进存储，并把上一条挪进历史。"""
    date = today_str()
    entry = {
        "date": date,
        "quote": quote,
        "source": source,          # ai / manual
        "model": model,
        "label": label,
        "generatedAt": datetime.now(BEIJING).isoformat(timespec="seconds"),
    }
    with _write_lock:
        store = read_store()
        previous = store.get("current")
        history = [item for item in store.get("history", []) if isinstance(item, dict)]
        if previous and previous.get("quote") and previous.get("quote") != quote:
            history = [previous] + [item for item in history if item.get("date") != previous.get("date")]
        history = [entry] + [item for item in history if item.get("date") != date]
        store = {"version": 1, "current": entry, "history": history[:HISTORY_LIMIT]}
        _atomic_write(STORE_PATH, store)
    return entry


# --------------------------------------------------------------------------
# 调用 AI 生成
# --------------------------------------------------------------------------
def generate_quote(prompt_template: str = "", date: str = "") -> dict:
    """调用当前接入的模型生成一句励志语。"""
    config = read_config()
    key = _api_key()
    if not key:
        raise RuntimeError("服务器上没有配置 AI 密钥（DEEPSEEK_API_KEY），无法自动生成")

    settings = _ai_settings()
    moment = today_str()
    template = prompt_template or config["prompt"]
    prompt = template.replace("{date}", date or moment)

    payload = {
        "model": settings["modelId"],
        "messages": [
            {"role": "system", "content": settings["systemPrompt"]},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": settings["maxOutputTokens"],
        "temperature": settings["temperature"],
    }
    # 推理强度：低配省时间，高配让煤球多想一会儿
    if settings.get("effort"):
        payload["effort"] = settings["effort"]

    def request(body: dict) -> dict:
        outgoing = urllib.request.Request(
            settings["baseUrl"] + "/chat/completions",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + key},
            method="POST",
        )
        with urllib.request.urlopen(outgoing, timeout=GENERATE_TIMEOUT) as response:
            return json.loads(response.read().decode("utf-8"))

    _log(f"📡 正在请求 {settings['modelId']} 生成每日一句…")
    try:
        body = request(payload)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:300]
        # 有些兼容渠道不认识 effort 参数，遇到 400 就摘掉重试一次
        if error.code == 400 and "effort" in payload:
            _log("⚠️ 接口不接受 effort 参数，摘掉后重试")
            payload.pop("effort")
            try:
                body = request(payload)
            except urllib.error.HTTPError as retry_error:
                raise RuntimeError(f"模型拒绝了请求（{retry_error.code}）：{retry_error.read().decode('utf-8', 'replace')[:300]}")
            except Exception as retry_error:
                raise RuntimeError(f"调用模型失败：{retry_error}")
        else:
            raise RuntimeError(f"模型拒绝了请求（{error.code}）：{detail}")
    except Exception as error:
        raise RuntimeError(f"调用模型失败：{error}")

    choice = (body.get("choices") or [{}])[0]
    content = (choice.get("message") or {}).get("content")
    if not isinstance(content, str):
        content = ""
    quote = _clean_quote(content, int(config["maxLength"]))
    if not quote:
        raise RuntimeError("模型没有返回可用的一句话")

    return _save_quote(quote, "ai", settings["modelId"], config["sourceLabel"])


_generation_lock = threading.Lock()
_generation_running = False


def start_background_generation() -> bool:
    """后台生成今天的励志语，不阻塞访客等页面。

    首页只是来「看一眼」，让访客在门口等模型写完一句话不合适，
    所以这里放到后台慢慢写，写好了下一次刷新就能看到。
    """
    global _generation_running
    if not _generation_lock.acquire(blocking=False):
        return False
    try:
        if _generation_running:
            return False
        _generation_running = True
    finally:
        _generation_lock.release()

    def worker() -> None:
        global _generation_running
        try:
            generate_quote()
        except Exception as error:
            _log("⚠️ 后台生成每日一句失败：", error)
        finally:
            with _generation_lock:
                _generation_running = False

    threading.Thread(target=worker, name="daily-quote-on-demand", daemon=True).start()
    return True


# --------------------------------------------------------------------------
# 定时生成
# --------------------------------------------------------------------------
def _generate_time_minutes(config: dict) -> int:
    hour, minute = str(config["generateTime"]).split(":")
    return int(hour) * 60 + int(minute)


def _scheduler_loop() -> None:
    """每 30 秒看一眼：到点且今天还没生成，就生成一句。"""
    while not _scheduler_stop.is_set():
        try:
            config = read_config()
            if config.get("enabled", True) and config.get("autoGenerate", True):
                now = datetime.now(BEIJING)
                store = read_store()
                current = store.get("current")
                done_today = bool(current and current.get("date") == today_str(now))
                if not done_today and now.hour * 60 + now.minute >= _generate_time_minutes(config):
                    _log(f"⏰ 到达每日生成时间 {config['generateTime']}，开始生成…")
                    try:
                        generate_quote()
                    except Exception as error:
                        _log("⚠️ 定时生成失败：", error)
        except Exception as error:
            _log("⚠️ 定时任务异常：", error)
        _scheduler_stop.wait(30)


def start_scheduler() -> None:
    """引擎启动时拉起定时线程。"""
    global _scheduler_thread
    if _scheduler_thread and _scheduler_thread.is_alive():
        return
    _scheduler_stop.clear()
    _scheduler_thread = threading.Thread(target=_scheduler_loop, name="daily-quote-scheduler", daemon=True)
    _scheduler_thread.start()
    _log("⏰ 每日励志语定时任务已启动")


def stop_scheduler() -> None:
    _scheduler_stop.set()


# --------------------------------------------------------------------------
# 接口
# --------------------------------------------------------------------------
def _payload() -> dict:
    config = read_config()
    store = read_store()
    current = store.get("current") or {}
    return {
        "success": True,
        "enabled": bool(config["enabled"]),
        "autoGenerate": bool(config["autoGenerate"]),
        "title": config["title"],
        "subtitle": config["subtitle"],
        "showDate": bool(config["showDate"]),
        "showSource": bool(config["showSource"]),
        "sourceLabel": config["sourceLabel"],
        "date": current.get("date", ""),
        "quote": current.get("quote", ""),
        "source": current.get("source", ""),
        "model": current.get("model", ""),
        "generatedAt": current.get("generatedAt", ""),
        "hasQuote": bool(current.get("quote")),
    }


@router.get("")
@router.get("/")
def get_daily_quote():
    """取今天的励志语。

    今天还没有的话，丢到后台去生成，访客不用在门口等模型写完。

    带斜杠和不带斜杠都注册一份：控制台的转发器不跟随重定向，
    两个地址都存在，两边调用都不用操心斜杠。
    """
    store = read_store()
    current = store.get("current") or {}
    fresh = bool(current.get("quote") and current.get("date") == today_str())
    config = read_config()
    if not fresh and config.get("enabled", True) and config.get("autoGenerate", True):
        start_background_generation()
    return _payload()


@router.get("/config")
def get_daily_quote_config():
    config = read_config()
    return {"success": True, "config": config}


@router.put("/config")
def update_daily_quote_config(payload: dict = Body(...)):
    try:
        config = write_config(payload)
    except ValueError as error:
        return JSONResponse({"success": False, "message": str(error)}, status_code=422)
    return {"success": True, "config": config, "message": "每日一句设置已保存"}


@router.post("/generate")
def regenerate_daily_quote(payload: dict = Body(default={})):
    """立刻重新生成一句（控制台的「换一句」）。"""
    prompt = ""
    if isinstance(payload, dict):
        prompt = str(payload.get("prompt") or "")
    try:
        entry = generate_quote(prompt)
    except RuntimeError as error:
        return JSONResponse({"success": False, "message": str(error)}, status_code=502)
    return {"success": True, "message": "已生成新的一句", **entry}


@router.post("/manual")
def set_manual_daily_quote(payload: dict = Body(...)):
    """手工写一句，覆盖今天的自动生成结果。"""
    quote = str((payload or {}).get("quote") or "").strip()
    if not quote:
        return JSONResponse({"success": False, "message": "励志语不能为空"}, status_code=422)
    config = read_config()
    entry = _save_quote(_clean_quote(quote, int(config["maxLength"])), "manual", "", config["sourceLabel"])
    return {"success": True, "message": "已保存今天的手写励志语", **entry}


@router.get("/history")
def get_daily_quote_history(limit: int = 14):
    store = read_store()
    try:
        count = max(1, min(HISTORY_LIMIT, int(limit)))
    except (TypeError, ValueError):
        count = 14
    history = [item for item in store.get("history", []) if isinstance(item, dict)]
    return {"success": True, "history": history[:count]}
