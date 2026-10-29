#!/usr/bin/env bash
# 清理 E2E 测试产生的说说：先删控制台工作区，再发布一次让镜像同步到公开站
set -uo pipefail

IDS=("$@")

echo "=== 1. 删除控制台工作区里的测试说说 ==="
for id in "${IDS[@]}"; do
  [ -z "$id" ] && continue
  curl -s -X POST http://127.0.0.1:8000/api/moments/delete \
    -H 'Content-Type: application/json' -d "{\"id\":\"$id\"}"
  echo
done

echo "=== 2. 再发布一次，让镜像把测试内容从公开站撤掉 ==="
SECRET=$(sudo -n grep -E '^MANAGER_SESSION_SECRET=' /etc/xhblogs-manager.env | cut -d= -f2-)
TOKEN=$(MANAGER_SESSION_SECRET="$SECRET" node -e 'const c=require("crypto");const e=String(Date.now()+7*24*3600*1000);process.stdout.write(e+"."+c.createHmac("sha256",process.env.MANAGER_SESSION_SECRET).update(e).digest("base64url"));')
unset SECRET
curl -s -X POST http://127.0.0.1:3001/api/proxy/api/deploy/publish \
  -H 'Content-Type: application/json' -H "Cookie: xh_mgr_session=$TOKEN" -d '{}'
unset TOKEN
echo

echo "=== 3. 等待发布完成 ==="
for i in $(seq 1 60); do
  STATE=$(curl -s http://127.0.0.1:8000/api/deploy/status | python3 -c 'import sys,json; print(json.load(sys.stdin).get("publish",{}).get("state",""))')
  if [ "$STATE" = "done" ] || [ "$STATE" = "failed" ]; then
    echo "发布状态：$STATE"
    break
  fi
  sleep 1
done

echo "=== 4. 校验公开站已无测试内容 ==="
BODY=$(curl -s http://127.0.0.1:8080/moments)
if printf '%s' "$BODY" | grep -q "E2E-REALTIME-\|E2E-LOC-\|E2E-PROFILE-"; then
  echo "仍然可见，需要检查"
else
  echo "公开站已无测试说说"
fi
ls /opt/xinghui-blog/my-blog-manager/moments/ /opt/xinghui-blog/XHBlogs/moments/ 2>/dev/null
