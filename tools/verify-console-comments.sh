#!/usr/bin/env bash
# 控制台侧评论管理台验证（仅在服务器上运行，密钥不出服务器）
set -uo pipefail

BASE=http://127.0.0.1:3001
ENGINE=http://127.0.0.1:8000/api/comments

# 用服务器上的会话密钥签一个 10 分钟有效的临时会话 Cookie
# 密钥只在服务器内存里用一次，不落盘、不打印。
TOKEN=$(sudo python3 -c "
import hmac, hashlib, base64, time
line = [l for l in open('/etc/xhblogs-manager.env') if l.startswith('MANAGER_SESSION_SECRET=')][0]
secret = line.split('=', 1)[1].strip()
exp = str(int(time.time() * 1000) + 600 * 1000)
sig = base64.urlsafe_b64encode(hmac.new(secret.encode(), exp.encode(), hashlib.sha256).digest()).decode().rstrip('=')
print(exp + '.' + sig)
")
if [ -z "$TOKEN" ]; then echo "无法签发会话令牌"; exit 1; fi
COOKIE="xh_mgr_session=$TOKEN"

pass=0; fail=0
ck() {
  if [ "$2" = "0" ]; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1"; fail=$((fail+1)); fi
}
api() { curl -s -H "Cookie: $COOKIE" "$@"; }
api_post() { curl -s -X POST -H "Cookie: $COOKIE" -H "Content-Type: application/json" "$@"; }
jq_get() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)"; }

echo "=== A. 未登录应被拦截 ==="
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/proxy/api/comments/admin/list")
if [ "$code" = "401" ]; then ck "未登录访问后台接口返回 401" 0; else ck "未登录访问后台接口返回 401 (实际 $code)" 1; fi
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/comments")
if [ "$code" = "307" ] || [ "$code" = "302" ] || [ "$code" = "308" ]; then ck "未登录访问 /comments 跳转登录" 0; else ck "未登录访问 /comments 跳转登录 (实际 $code)" 1; fi

echo "=== B. 登录后控制台后台接口 ==="
out=$(api "$BASE/api/proxy/api/comments/admin/list")
if echo "$out" | grep -q '"success":true'; then ck "admin/list 通过同源转发器" 0; else ck "admin/list 通过同源转发器" 1; fi
total=$(echo "$out" | jq_get "d['data']['total']")
if [ "$total" -ge 1 ]; then ck "admin/list 能看到评论 (total=$total)" 0; else ck "admin/list 能看到评论" 1; fi
if api "$BASE/api/proxy/api/comments/admin/stats" | grep -q '"success":true'; then ck "admin/stats 可用" 0; else ck "admin/stats 可用" 1; fi
if api "$BASE/api/proxy/api/comments/admin/targets" | grep -q '"success":true'; then ck "admin/targets 可用" 0; else ck "admin/targets 可用" 1; fi
if api "$BASE/api/proxy/api/comments/admin/settings" | grep -q '"success":true'; then ck "admin/settings GET 可用" 0; else ck "admin/settings GET 可用" 1; fi

echo "=== C. 后台改设置并即时生效 ==="
out=$(api_post "$BASE/api/proxy/api/comments/admin/settings" -d '{"settings":{"title":"控制台改过的标题","notice":"这条提示由控制台写入"}}')
if echo "$out" | grep -q '"success":true'; then ck "admin/settings POST 成功" 0; else ck "admin/settings POST 成功" 1; fi
front=$(curl -s "$ENGINE/settings")
if echo "$front" | grep -q '控制台改过的标题'; then ck "前台立即读到新标题" 0; else ck "前台立即读到新标题" 1; fi
if echo "$front" | grep -q '这条提示由控制台写入'; then ck "前台立即读到新提示语" 0; else ck "前台立即读到新提示语" 1; fi

echo "=== D. 后台审核流程 ==="
newid=$(curl -s -X POST "$ENGINE/create" -H "Content-Type: application/json" -H "x-visitor-token: console-flow" \
  -d '{"target":"/console/flow","target_label":"控制台流程验证","author_name":"流程访客","content":"等待审核的评论"}' \
  | jq_get "d['data']['id']")
echo "  (新建评论 id=$newid)"
if api_post "$BASE/api/proxy/api/comments/admin/status" -d "{\"ids\":[$newid],\"status\":\"hidden\"}" | grep -q '"success":true'; then ck "后台隐藏评论" 0; else ck "后台隐藏评论" 1; fi
vis=$(curl -s "$ENGINE/list?target=/console/flow" | jq_get "len(d['data']['items'])")
if [ "$vis" = "0" ]; then ck "隐藏后前台不可见" 0; else ck "隐藏后前台不可见 (可见 $vis 条)" 1; fi
hidden=$(api "$BASE/api/proxy/api/comments/admin/list?status=hidden" | jq_get "d['data']['total']")
if [ "$hidden" -ge 1 ]; then ck "隐藏后后台仍可见" 0; else ck "隐藏后后台仍可见" 1; fi
if api_post "$BASE/api/proxy/api/comments/admin/status" -d "{\"ids\":[$newid],\"status\":\"approved\"}" | grep -q '"success":true'; then ck "后台通过审核" 0; else ck "后台通过审核" 1; fi
vis=$(curl -s "$ENGINE/list?target=/console/flow" | jq_get "len(d['data']['items'])")
if [ "$vis" = "1" ]; then ck "通过后前台可见" 0; else ck "通过后前台可见 (可见 $vis 条)" 1; fi

echo "=== E. 站长回复 ==="
rid=$(api_post "$BASE/api/proxy/api/comments/admin/reply" -d "{\"parent_id\":$newid,\"content\":\"站长回复：收到，感谢反馈！\",\"target_label\":\"控制台流程验证\"}" \
  | jq_get "d['data']['id'] if d.get('success') else ''")
if [ -n "$rid" ]; then ck "后台回复创建成功 (id=$rid)" 0; else ck "后台回复创建成功" 1; fi
marker=$(curl -s "$ENGINE/list?target=/console/flow" | jq_get "'ADMIN_REPLY_OK' if [r for i in d['data']['items'] for r in (i.get('replies') or []) if r['is_admin']] else 'MISSING'")
if [ "$marker" = "ADMIN_REPLY_OK" ]; then ck "前台看到站长回复并带标识" 0; else ck "前台看到站长回复并带标识" 1; fi

echo "=== F. 删除（含级联回复） ==="
if api_post "$BASE/api/proxy/api/comments/admin/delete" -d "{\"ids\":[$newid]}" | grep -q '"success":true'; then ck "后台删除评论" 0; else ck "后台删除评论" 1; fi
left=$(curl -s "$ENGINE/list?target=/console/flow" | jq_get "d['data']['total']")
if [ "$left" = "0" ]; then ck "删除后前台清空" 0; else ck "删除后前台清空 (剩 $left 条)" 1; fi

echo "=== G. 恢复默认设置 ==="
if api_post "$BASE/api/proxy/api/comments/admin/settings" -d '{"settings":{"title":"留言板","notice":""}}' | grep -q '"success":true'; then ck "设置已恢复" 0; else ck "设置已恢复" 1; fi

echo
echo "=================================================="
echo "PASS=$pass FAIL=$fail"
echo "=================================================="
[ "$fail" = "0" ]
