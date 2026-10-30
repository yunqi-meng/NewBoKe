#!/usr/bin/env bash
# 纯内容发布的端到端计时：控制台保存一条说说 → 点「发布上线」→ 生成快照并提交
#
# 🌟 新的发布模型下，公开站是运行时读数据库的：
#    说说一保存下来，刷新前台就已经能看到，「发布上线」不再决定前台何时更新，
#    它做的是把当前内容导成一份快照提交进 git（留一份可追溯、可回退的版本）。
#    所以这里分两段计时：
#      T_LIVE  —— 保存后公开站能看到的耗时（这才是访客真正感知的延迟）
#      T_SNAP  —— 点「发布」到快照提交成功的耗时（版本留痕的耗时）
#
# 会话 Cookie 在服务器本地用 MANAGER_SESSION_SECRET 现算现用，不落盘、不打印。
#
# 注意：轮询时先整段取回页面再匹配关键词。
# 直接写 `curl ... | grep -q` 会在命中时让 grep 提前退出、curl 收到 SIGPIPE，
# 配合 set -o pipefail 会把「命中」判成失败，于是把耗时统计成好几秒的假象。
set -uo pipefail

TAG="E2E-REALTIME-$(date +%s)"
MOMENT_ID="moment-e2e-$(date +%s)"
T0=$(date +%s%3N)

echo "=== 1. 保存说说（写入统一后端数据库） ==="
curl -s -X POST http://127.0.0.1:8000/api/moments/save \
  -H 'Content-Type: application/json' \
  -d "{\"id\":\"$MOMENT_ID\",\"date\":\"2026-10-29 18:00:00\",\"content\":\"$TAG\",\"location\":\"\"}"
echo

echo "=== 2. 公开站是否可见（运行时读库，保存后应当立刻可见） ==="
T_LIVE=0
for i in $(seq 1 60); do
  BODY=$(curl -s http://127.0.0.1:8080/moments)
  if printf '%s' "$BODY" | grep -q "$TAG"; then
    T_LIVE=$(date +%s%3N)
    echo "公开站可见，用时 $((T_LIVE - T0)) ms"
    break
  fi
  sleep 0.5
done
if [ "$T_LIVE" = "0" ]; then
  echo "异常：保存后 30 秒内公开站没有出现新说说"
fi

echo "=== 3. 点击「发布上线」（导出快照并提交进 git） ==="
SECRET=$(sudo -n grep -E '^MANAGER_SESSION_SECRET=' /etc/xhblogs-manager.env | cut -d= -f2-)
TOKEN=$(MANAGER_SESSION_SECRET="$SECRET" node -e 'const c=require("crypto");const e=String(Date.now()+7*24*3600*1000);process.stdout.write(e+"."+c.createHmac("sha256",process.env.MANAGER_SESSION_SECRET).update(e).digest("base64url"));')
unset SECRET
T_CLICK=$(date +%s%3N)
curl -s -o /dev/null -w '发布接口自身耗时 %{time_total}s\n' \
  -X POST http://127.0.0.1:3001/api/proxy/api/deploy/publish \
  -H 'Content-Type: application/json' \
  -H "Cookie: xh_mgr_session=$TOKEN" -d '{}'
echo "点击时刻 T_CLICK=$T_CLICK"

echo "=== 4. 等待发布（快照提交）结束 ==="
FOUND=0
for i in $(seq 1 180); do
  OUT=$(curl -s -H "X-Admin-Token: $TOKEN" http://127.0.0.1:8000/api/deploy/status)
  STATE=$(printf '%s' "$OUT" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("publish",{}).get("state",""))')
  if [ "$STATE" = "done" ] || [ "$STATE" = "failed" ]; then
    T1=$(date +%s%3N)
    echo "发布状态：$STATE，快照提交用时 $((T1 - T_CLICK)) ms"
    FOUND=1
    break
  fi
  sleep 0.5
done

if [ "$FOUND" = "0" ]; then
  echo "超时：180 秒内发布没有结束"
fi

echo "=== 5. 发布状态 ==="
curl -s -H "X-Admin-Token: $TOKEN" http://127.0.0.1:8000/api/deploy/status | python3 -c 'import sys,json; d=json.load(sys.stdin); print(json.dumps({"build": d.get("build"), "publish": d.get("publish"), "effective": d.get("effective"), "git": d.get("git")}, ensure_ascii=False, indent=2))'
unset TOKEN

echo "=== 6. 快照是否已入库 ==="
ls -t /opt/xinghui-blog/snapshots/content-*.json 2>/dev/null | head -3

echo "TAG=$TAG"
echo "MOMENT_ID=$MOMENT_ID"
