#!/usr/bin/env bash
# 触发一次「发布上线」并打印接口返回与发布状态，用于验证文案与免重建逻辑
set -uo pipefail

SECRET=$(sudo -n grep -E '^MANAGER_SESSION_SECRET=' /etc/xhblogs-manager.env | cut -d= -f2-)
TOKEN=$(MANAGER_SESSION_SECRET="$SECRET" node -e 'const c=require("crypto");const e=String(Date.now()+7*24*3600*1000);process.stdout.write(e+"."+c.createHmac("sha256",process.env.MANAGER_SESSION_SECRET).update(e).digest("base64url"));')
unset SECRET

echo "=== 接口返回 ==="
curl -s -X POST http://127.0.0.1:3001/api/proxy/api/deploy/publish \
  -H 'Content-Type: application/json' -H "Cookie: xh_mgr_session=$TOKEN" -d '{}'
echo

echo "=== 等待发布结束 ==="
for i in $(seq 1 120); do
  OUT=$(curl -s -H "X-Admin-Token: $TOKEN" http://127.0.0.1:8000/api/deploy/status | python3 -c 'import sys,json; d=json.load(sys.stdin); p=d.get("publish",{}); print(p.get("state",""), "|", p.get("message",""), "|", "effective=" + str(d.get("effective")), "|", "build=" + str(d.get("build",{}).get("id")), "|", "head=" + str(d.get("git",{}).get("head")))')
  STATE=$(echo "$OUT" | awk '{print $1}')
  if [ "$STATE" = "done" ] || [ "$STATE" = "failed" ]; then
    echo "$OUT"
    break
  fi
  sleep 1
done
unset TOKEN

echo "=== 发布助手日志尾部 ==="
sudo -n tail -12 /var/log/xhblogs-publish.log
