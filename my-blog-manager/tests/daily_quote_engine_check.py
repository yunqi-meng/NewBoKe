"""每日一句引擎端到端自检：设置、存储、手写、历史、AI 调用（用假模型）。用完即删。"""
import os
import sys
import json
import shutil
import tempfile
import types
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO)

from fastapi.testclient import TestClient  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from cms_core.api import dailyquote  # noqa: E402

# 用临时目录存数据，别污染真实 data/
tmpdir = tempfile.mkdtemp(prefix="daily_quote_test_")
dailyquote.DATA_DIR = tmpdir
dailyquote.CONFIG_PATH = os.path.join(tmpdir, "dailyQuoteConfig.json")
dailyquote.STORE_PATH = os.path.join(tmpdir, "dailyQuote.json")

app = FastAPI()
app.include_router(dailyquote.router, prefix="/api/daily-quote")
client = TestClient(app)

BASE = "/api/daily-quote"
ok = True


def check(label, condition, detail=""):
    global ok
    if condition:
        print(f"  PASS  {label}")
    else:
        ok = False
        print(f"  FAIL  {label} {detail}")


class FakeResponse:
    """假装自己是 urllib 的响应对象。"""

    def __init__(self, payload):
        self._body = json.dumps(payload).encode("utf-8")

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


print("=== 1. 默认设置 ===")
r = client.get(f"{BASE}/config")
check("GET /config 200", r.status_code == 200, r.text[:200])
config = r.json()["config"]
check("默认开启", config["enabled"] is True, r.text[:200])
check("默认每天自动生成", config["autoGenerate"] is True, r.text[:200])
check("默认生成时间 07:00", config["generateTime"] == "07:00", r.text[:200])
check("提示词含 {date} 占位", "{date}" in config["prompt"], r.text[:200])

print("=== 2. 保存设置 ===")
r = client.put(f"{BASE}/config", json={
    "title": "今日打气",
    "subtitle": "煤球的早安",
    "generateTime": "08:30",
    "maxLength": 40,
    "sourceLabel": "煤球",
})
check("PUT /config 200", r.status_code == 200, r.text[:200])
check("标题已更新", r.json()["config"]["title"] == "今日打气", r.text[:200])
check("时间已更新", r.json()["config"]["generateTime"] == "08:30", r.text[:200])
check("未提供的字段保持默认", r.json()["config"]["enabled"] is True, r.text[:200])

r = client.put(f"{BASE}/config", json={"generateTime": "25:00"})
check("非法时间被拒", r.status_code == 422, f"status={r.status_code}")
r = client.put(f"{BASE}/config", json={"generateTime": "abc"})
check("非时间字符串被拒", r.status_code == 422, f"status={r.status_code}")
r = client.put(f"{BASE}/config", json={"totallyUnknown": 1})
check("未知字段被忽略", r.status_code == 200 and "totallyUnknown" not in r.json()["config"], r.text[:200])

print("=== 3. 手写今天这句 ===")
r = client.post(f"{BASE}/manual", json={"quote": "慢慢来，比较快。"})
check("POST /manual 200", r.status_code == 200, r.text[:200])
check("来源标记为 manual", r.json()["source"] == "manual", r.text[:200])
check("引号被剥掉", r.json()["quote"] == "慢慢来，比较快。", r.text[:200])
r = client.post(f"{BASE}/manual", json={"quote": "   "})
check("空内容被拒", r.status_code == 422, f"status={r.status_code}")

r = client.get(f"{BASE}/")
check("GET / 能读到今天这句", r.json()["quote"] == "慢慢来，比较快。", r.text[:200])
check("GET / 带出标题", r.json()["title"] == "今日打气", r.text[:200])
check("GET / 带出日期", bool(r.json()["date"]), r.text[:200])
check("GET / hasQuote 为真", r.json()["hasQuote"] is True, r.text[:200])

print("=== 4. 手写会被长度上限截断 ===")
r = client.put(f"{BASE}/config", json={"maxLength": 12})
r = client.post(f"{BASE}/manual", json={"quote": "这是一句很长很长很长的话"})
check("超长被截断", len(r.json()["quote"]) <= 13, r.json()["quote"])
r = client.put(f"{BASE}/config", json={"maxLength": 60})

print("=== 5. AI 生成（假模型） ===")
captured = {}


def fake_urlopen(request, timeout=None):
    captured["url"] = request.full_url
    captured["auth"] = request.get_header("Authorization")
    captured["body"] = json.loads(request.data.decode("utf-8"))
    return FakeResponse({
        "choices": [{"message": {"content": "今日一句：别怕慢，就怕站。喵~"}}]
    })


os.environ["DEEPSEEK_API_KEY"] = "test-key-not-a-real-secret"
dailyquote._ai_settings = lambda: {
    "modelId": "deepseek-flash",
    "baseUrl": "https://api.deepseek.com",
    "systemPrompt": "你是煤球。",
    "maxOutputTokens": 256,
    "temperature": 0.85,
    "effort": "low",
}
dailyquote.urllib.request.urlopen = fake_urlopen

r = client.post(f"{BASE}/generate", json={})
check("POST /generate 200", r.status_code == 200, r.text[:200])
check("来源标记为 ai", r.json()["source"] == "ai", r.text[:200])
check("前缀被剥掉", r.json()["quote"] == "别怕慢，就怕站。喵~", r.text[:200])
check("请求打到 chat/completions", captured["url"] == "https://api.deepseek.com/chat/completions", captured.get("url", ""))
check("带上了 Authorization", captured["auth"] == "Bearer test-key-not-a-real-secret", str(captured.get("auth")))
check("用了配置里的模型", captured["body"]["model"] == "deepseek-flash", str(captured["body"]))
check("带上人设 system prompt", captured["body"]["messages"][0]["content"] == "你是煤球。", str(captured["body"]["messages"][0]))
check("带上推理强度", captured["body"].get("effort") == "low", str(captured["body"]))
check("提示词里的 {date} 已替换", "{" not in captured["body"]["messages"][1]["content"], captured["body"]["messages"][1]["content"])

print("=== 6. 模型接口报错时的提示 ===")


def failing_urlopen(request, timeout=None):
    raise urllib.error.HTTPError(request.full_url, 401, "Unauthorized", {}, None)


dailyquote.urllib.request.urlopen = failing_urlopen
r = client.post(f"{BASE}/generate", json={})
check("报错返回 502", r.status_code == 502, f"status={r.status_code}")
check("带上了可读原因", "401" in r.json()["message"], r.text[:200])
dailyquote.urllib.request.urlopen = fake_urlopen

print("=== 7. 没有密钥时的提示 ===")
os.environ.pop("DEEPSEEK_API_KEY", None)
os.environ.pop("OPENAI_API_KEY", None)
os.environ.pop("GEMINI_API_KEY", None)
r = client.post(f"{BASE}/generate", json={})
check("无密钥返回 502", r.status_code == 502, f"status={r.status_code}")
check("提示去配置密钥", "密钥" in r.json()["message"], r.text[:200])
os.environ["DEEPSEEK_API_KEY"] = "test-key-not-a-real-secret"

print("=== 8. 历史 ===")
r = client.get(f"{BASE}/history?limit=5")
check("GET /history 200", r.status_code == 200, r.text[:200])
history = r.json()["history"]
check("历史有记录", len(history) >= 1, str(history))
check("历史按时间倒序", history[0]["generatedAt"] >= history[-1]["generatedAt"], str(history))
r = client.get(f"{BASE}/history?limit=0")
check("limit 非法时兜底", r.status_code == 200, r.text[:200])

print("=== 9. 关闭展示后不再自动生成 ===")
r = client.put(f"{BASE}/config", json={"enabled": False, "autoGenerate": False})
check("两个开关都能关", r.json()["config"]["enabled"] is False and r.json()["config"]["autoGenerate"] is False, r.text[:200])
check("关闭后 GET / 不再声称有内容", client.get(f"{BASE}/").json()["enabled"] is False, "")

print("=== 10. 存储文件格式 ===")
store = json.load(open(dailyquote.STORE_PATH, encoding="utf-8"))
check("存储里有 current", isinstance(store.get("current"), dict), str(store)[:200])
check("存储里有 history 列表", isinstance(store.get("history"), list), str(store)[:200])
check("历史长度不超过上限", len(store["history"]) <= dailyquote.HISTORY_LIMIT, str(len(store["history"])))
config_on_disk = json.load(open(dailyquote.CONFIG_PATH, encoding="utf-8"))
check("设置单独存一份", config_on_disk.get("generateTime") == "08:30", str(config_on_disk)[:200])

shutil.rmtree(tmpdir, ignore_errors=True)
print()
print("=" * 50)
print("RESULT:", "ALL PASS" if ok else "SOME FAILED")
print("=" * 50)
sys.exit(0 if ok else 1)
