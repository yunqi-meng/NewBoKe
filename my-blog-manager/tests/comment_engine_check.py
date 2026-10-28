"""评论引擎端到端自检：公开读写 + 后台审核。用完即删。"""
import os
import sys
import json
import shutil
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO)

from fastapi.testclient import TestClient  # noqa: E402
from cms_core.api import comments  # noqa: E402

# 用临时目录当数据库，别污染真实 data/
tmpdir = tempfile.mkdtemp(prefix="comment_test_")
comments.DATA_DIR = tmpdir
comments.DB_PATH = os.path.join(tmpdir, "comments.db")
comments._ensure_schema()

from fastapi import FastAPI  # noqa: E402

app = FastAPI()
app.include_router(comments.router, prefix="/api/comments")
client = TestClient(app)

BASE = "/api/comments"
ok = True


def check(label, condition, detail=""):
    global ok
    if condition:
        print(f"  PASS  {label}")
    else:
        ok = False
        print(f"  FAIL  {label} {detail}")


print("=== 1. 公开读取 ===")
r = client.get(f"{BASE}/list?target=/posts/hello")
check("GET /list 200", r.status_code == 200, r.text[:200])
check("初始为空", r.json()["data"]["total"] == 0, r.text[:200])
check("返回设置", r.json()["settings"]["enabled"] is True, r.text[:200])

print("=== 2. 发表评论 ===")
r = client.post(f"{BASE}/create", json={
    "target": "/posts/hello",
    "target_label": "你好世界",
    "author_name": "小明",
    "author_email": "xiaoming@example.com",
    "content": "第一条评论",
})
check("POST /create 200", r.status_code == 200, r.text[:200])
check("评论已发布", r.json()["data"]["status"] == "approved", r.text[:200])
first_id = r.json()["data"]["id"]

print("=== 3. 空内容 / 空昵称被拒 ===")
r = client.post(f"{BASE}/create", json={"target": "/posts/hello", "author_name": "x", "content": "   "})
check("空内容被拒", r.json()["success"] is False, r.text[:200])
r = client.post(f"{BASE}/create", json={"target": "/posts/hello", "author_name": "", "content": "hi"})
check("空昵称被拒", r.json()["success"] is False, r.text[:200])
r = client.post(f"{BASE}/create", json={"target": "/posts/hello", "author_name": "x", "content": "hi", "hp": "bot"})
check("蜜罐静默丢弃", r.json()["success"] is True and "id" not in r.json().get("data", {}), r.text[:200])

print("=== 4. 回复与主题隔离 ===")
r = client.post(f"{BASE}/create", json={
    "target": "/posts/hello", "author_name": "小红", "content": "回复一条",
    "parent_id": first_id,
})
check("回复创建成功", r.json()["success"] is True, r.text[:200])
reply_id = r.json()["data"]["id"]
r = client.post(f"{BASE}/create", json={
    "target": "/posts/other", "author_name": "小红", "content": "跨主题回复",
    "parent_id": first_id,
})
check("跨主题回复被拒", r.json()["success"] is False, r.text[:200])

print("=== 5. 点赞去重 ===")
r = client.post(f"{BASE}/like", json={"id": first_id}, headers={"x-visitor-token": "visitor-a"})
check("点赞成功", r.json()["success"] is True, r.text[:200])
check("点赞数=1", r.json()["data"]["likes"] == 1, r.text[:200])
r = client.post(f"{BASE}/like", json={"id": first_id}, headers={"x-visitor-token": "visitor-a"})
check("同访客重复点赞不叠加", r.json()["data"]["likes"] == 1, r.text[:200])
r = client.post(f"{BASE}/like", json={"id": first_id}, headers={"x-visitor-token": "visitor-b"})
check("换访客点赞叠加", r.json()["data"]["likes"] == 2, r.text[:200])

print("=== 6. 限流 ===")
codes = []
for i in range(7):
    rr = client.post(f"{BASE}/create", json={
        "target": "/posts/rate", "author_name": "spam", "content": f"spam {i}",
    }, headers={"x-visitor-token": "spammer"})
    codes.append(rr.json()["success"])
check("同一访客前 5 条通过", codes[:5] == [True] * 5, str(codes))
check("第 6 条起被限流", codes[5] is False, str(codes))

print("=== 7. 后台列表 / 统计 / 主题 ===")
r = client.get(f"{BASE}/admin/list")
check("admin/list 200", r.status_code == 200, r.text[:200])
check("admin/list 能看到全部状态", r.json()["data"]["total"] >= 2, r.text[:300])
r = client.get(f"{BASE}/admin/list?status=approved")
check("admin/list 状态过滤", all(
    i["status"] == "approved" for i in r.json()["data"]["items"]), r.text[:300])
r = client.get(f"{BASE}/admin/list?keyword=第一条")
check("admin/list 关键词搜索", r.json()["data"]["total"] == 1, r.text[:300])
r = client.get(f"{BASE}/admin/list?target=/posts/hello")
check("admin/list 主题过滤", r.json()["data"]["total"] == 2, r.text[:300])

r = client.get(f"{BASE}/admin/stats")
check("admin/stats 200", r.status_code == 200, r.text[:200])
check("admin/stats 计数正确", r.json()["data"]["total"] >= 2, r.text[:300])
check("admin/stats 有 pending 字段", "pending" in r.json()["data"], r.text[:300])

r = client.get(f"{BASE}/admin/targets")
check("admin/targets 200", r.status_code == 200, r.text[:200])
targets = {t["target"]: t for t in r.json()["data"]}
check("主题列表含 /posts/hello", "/posts/hello" in targets, str(list(targets)))
check("主题带标题", targets.get("/posts/hello", {}).get("label") == "你好世界", str(targets.get("/posts/hello")))

print("=== 8. 后台改状态 ===")
r = client.post(f"{BASE}/admin/status", json={"ids": [reply_id], "status": "hidden"})
check("admin/status 200", r.json()["success"] is True, r.text[:200])
r = client.get(f"{BASE}/list?target=/posts/hello")
ids = [i["id"] for i in r.json()["data"]["items"]]
check("隐藏后前台不可见", reply_id not in ids, str(ids))
r = client.get(f"{BASE}/admin/list?status=hidden")
check("隐藏后后台可见", reply_id in [i["id"] for i in r.json()["data"]["items"]], r.text[:300])

print("=== 9. 站长回复 ===")
r = client.post(f"{BASE}/admin/reply", json={
    "parent_id": first_id, "content": "谢谢支持！", "target_label": "你好世界",
})
check("admin/reply 200", r.json()["success"] is True, r.text[:200])
admin_reply_id = r.json()["data"]["id"]
r = client.get(f"{BASE}/list?target=/posts/hello")
items = r.json()["data"]["items"]
# 站长回复是嵌套在父评论的 replies 里，两处都要看
flat = list(items) + [rep for item in items for rep in (item.get("replies") or [])]
check("回复带站长标识", any(i["is_admin"] for i in flat), r.text[:400])
nested = [i for i in items if i.get("replies")]
check("回复嵌套在父评论下", len(nested) == 1, r.text[:400])

print("=== 10. 审核开关 ===")
r = client.post(f"{BASE}/admin/settings", json={"settings": {"requireApproval": True}})
check("保存设置成功", r.json()["success"] is True, r.text[:200])
r = client.post(f"{BASE}/create", json={
    "target": "/posts/hello", "author_name": "待审", "content": "需要审核的评论",
})
check("开启审核后新评论 pending", r.json()["data"]["status"] == "pending", r.text[:200])
pending_id = r.json()["data"]["id"]
r = client.get(f"{BASE}/list?target=/posts/hello")
check("pending 不在前台显示", pending_id not in [
    i["id"] for i in r.json()["data"]["items"]], r.text[:400])
r = client.post(f"{BASE}/admin/status", json={"ids": [pending_id], "status": "approved"})
r = client.get(f"{BASE}/list?target=/posts/hello")
check("审核通过后前台可见", pending_id in [
    i["id"] for i in r.json()["data"]["items"]], r.text[:400])

print("=== 11. 匿名开关 ===")
r = client.post(f"{BASE}/admin/settings", json={"settings": {"allowGuest": False}})
r = client.post(f"{BASE}/create", json={
    "target": "/posts/hello", "author_name": "匿名", "content": "没写邮箱",
})
check("关闭匿名后无邮箱被拒", r.json()["success"] is False, r.text[:200])
r = client.post(f"{BASE}/create", json={
    "target": "/posts/hello", "author_name": "实名", "author_email": "a@b.com",
    "content": "写了邮箱",
})
check("关闭匿名后有邮箱通过", r.json()["success"] is True, r.text[:200])
r = client.post(f"{BASE}/admin/settings", json={"settings": {"allowGuest": True}})

print("=== 12. 点赞开关 ===")
r = client.post(f"{BASE}/admin/settings", json={"settings": {"allowLike": False}})
r = client.post(f"{BASE}/like", json={"id": first_id}, headers={"x-visitor-token": "visitor-c"})
check("关闭点赞后请求被拒", r.json()["success"] is False, r.text[:200])
r = client.post(f"{BASE}/admin/settings", json={"settings": {"allowLike": True}})

print("=== 13. 总开关 ===")
r = client.post(f"{BASE}/admin/settings", json={"settings": {"enabled": False}})
r = client.post(f"{BASE}/create", json={
    "target": "/posts/hello", "author_name": "关闭", "content": "关了还能发吗",
})
check("关闭总开关后拒绝留言", r.json()["success"] is False, r.text[:200])
r = client.post(f"{BASE}/admin/settings", json={"settings": {"enabled": True}})

print("=== 14. 最大字数 ===")
r = client.post(f"{BASE}/admin/settings", json={"settings": {"maxLength": 10}})
r = client.post(f"{BASE}/create", json={
    "target": "/posts/hello", "author_name": "超长", "content": "一" * 30,
})
check("超出最大字数被拒", r.json()["success"] is False, r.text[:200])
r = client.post(f"{BASE}/admin/settings", json={"settings": {"maxLength": 500}})

print("=== 15. 批量操作与删除 ===")
r = client.post(f"{BASE}/admin/bulk", json={"ids": [first_id], "action": "status", "status": "spam"})
check("批量改状态", r.json()["success"] is True, r.text[:200])
r = client.post(f"{BASE}/admin/delete", json={"ids": [first_id]})
check("删除成功", r.json()["success"] is True, r.text[:200])
r = client.get(f"{BASE}/admin/list?keyword=第一条")
check("删除后查不到", r.json()["data"]["total"] == 0, r.text[:300])
r = client.get(f"{BASE}/list?target=/posts/hello")
all_ids = [i["id"] for i in r.json()["data"]["items"]]
check("删除连带清掉回复", admin_reply_id not in all_ids, str(all_ids))

print("=== 16. 路径不重定向（避免代理丢 Location） ===")
r = client.get(f"{BASE}/")
check("裸前缀不 307", r.status_code != 307, f"status={r.status_code}")

shutil.rmtree(tmpdir, ignore_errors=True)
print()
print("=" * 50)
print("RESULT:", "ALL PASS" if ok else "SOME FAILED")
print("=" * 50)
sys.exit(0 if ok else 1)
