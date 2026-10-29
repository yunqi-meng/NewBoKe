#!/usr/bin/env bash
# 纯内容发布的端到端计时：控制台保存一条说说 → 点「发布上线」→ 公开站可见
# 会话 Cookie 在服务器本地用 MANAGER_SESSION_SECRET 现算现用，不落盘、不打印。
#
# 注意：轮询时先整段取回页面再匹配关键词。
# 直接写 `curl ... | grep -q` 会在命中时让 grep 提前退出、curl 收到 SIGPIPE，
# 配合 set -o pipefail 会把「命中」判成失败，于是把耗时统计成好几秒的假象。
set -uo pipefail

TAG="E2E-REALTIME-$(date +%s)"
MOMENT_ID="moment-e2e-$(date +%s)"
T0=$(date +%s%3N)

echo "=== 1. 保存说说（模拟控制台写入内容） ==="
curl -s -X POST http://127.0.0.1:8000/api/moments/save \
  -H 'Content-Type: application/json' \
  -d "{\"id\":\"$MOMENT_ID\",\"date\":\"2026-10-29 18:00:00\",\"content\":\"$TAG\",\"location\":\"\"}"
echo

echo "=== 2. 公开站此刻是否可见（应为不可见） ==="
BODY=$(curl -s http://127.0.0.1:8080/moments)
if printf '%s' "$BODY" | grep -q "$TAG"; then
  echo "异常：保存后未发布就已经可见"
else
  echo "不可见（符合预期）"
fi

echo "=== 3. 点击「发布上线」（走控制台 /api/proxy/api/deploy/publish） ==="
SECRET=$(sudo -n grep -E '^MANAGER_SESSION_SECRET=' /etc/xhblogs-manager.env | cut -d= -f2-)
TOKEN=$(MANAGER_SESSION_SECRET="$SECRET" node -e 'const c=require("crypto");const e=String(Date.now()+7*24*3600*1000);process.stdout.write(e+"."+c.createHmac("sha256",process.env.MANAGER_SESSION_SECRET).update(e).digest("base64url"));')
unset SECRET
T_CLICK=$(date +%s%3N)
curl -s -o /dev/null -w '发布接口自身耗时 %{time_total}s\n' \
  -X POST http://127.0.0.1:3001/api/proxy/api/deploy/publish \
  -H 'Content-Type: application/json' \
  -H "Cookie: xh_mgr_session=$TOKEN" -d '{}'
unset TOKEN
echo "点击时刻 T_CLICK=$T_CLICK"

echo "=== 4. 轮询公开站，直到看到新说说 ==="
FOUND=0
for i in $(seq 1 180); do
  BODY=$(curl -s http://127.0.0.1:8080/moments)
  if printf '%s' "$BODY" | grep -q "$TAG"; then
    T1=$(date +%s%3N)
    echo "公开站可见，用时 $((T1 - T_CLICK)) ms（从保存到可见 $((T1 - T0)) ms）"
    FOUND=1
    break
  fi
  sleep 0.5
done

if [ "$FOUND" = "0" ]; then
  echo "超时：180 秒内公开站没有出现新说说"
fi

echo "=== 5. 发布状态 ==="
curl -s http://127.0.0.1:8000/api/deploy/status | python3 -c 'import sys,json; d=json.load(sys.stdin); print(json.dumps({"build": d.get("build"), "publish": d.get("publish"), "effective": d.get("effective"), "git": d.get("git")}, ensure_ascii=False, indent=2))'

echo "TAG=$TAG"
echo "MOMENT_ID=$MOMENT_ID"
