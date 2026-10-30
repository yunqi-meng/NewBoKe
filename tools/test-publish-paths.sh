#!/usr/bin/env bash
# 从真实的发布助手脚本里抠出路径分类逻辑，做一次断言测试
#
# 🌟 新的发布模型下，"内容"不再是散落的 markdown / TS 文件，
#    而是统一后端导出的内容快照（snapshots/content-*.json）。
#    内容改动运行时生效，不需要重新构建；代码改动才需要。
#    这条规则一旦写错，线上就会出现「改了内容但前台没变」或
#    「明明只改了内容却重建了一整站」的问题，所以单独拿测试守住。
set -uo pipefail

SRC="D:/Proiect/XiangMu/BoKe/tools/xhblogs-publish"
TMP="/tmp/xhblogs-pathclass.sh"

# 只抠 classify_path 这个函数出来，避免执行发布脚本的其它逻辑
sed -n '/^classify_path() {/,/^}/p' "$SRC" > "$TMP"
if ! grep -q "classify_path()" "$TMP"; then
  echo "FAIL 没能在发布脚本里找到 classify_path，脚本结构变了" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$TMP"

fail=0
expect() {
  local want="$1"
  local path="$2"
  local got
  got=$(classify_path "$path")
  if [ "$got" = "$want" ]; then
    echo "OK   $want: $path"
  else
    echo "FAIL 期望 $want，实际 $got: $path"; fail=1
  fi
}

# --- 内容：快照，不需要重新构建 ---
expect content "snapshots/content-20261029-120000.json"
expect content "snapshots/content-20261029-120000.json"

# --- 公开站代码：需要重新 build + 重启 xhblogs ---
expect site "XHBlogs/app/page.tsx"
expect site "XHBlogs/app/posts/[slug]/page.tsx"
expect site "XHBlogs/components/Navbar.tsx"
expect site "XHBlogs/lib/backend.ts"
expect site "XHBlogs/next.config.ts"
expect site "XHBlogs/package.json"

# --- 控制台代码：需要重新 build + 重启 xhblogs-manager-web ---
expect console "my-blog-manager/app/page.tsx"
expect console "my-blog-manager/components/Navbar.tsx"
expect console "my-blog-manager/lib/backendPort.ts"
expect console "my-blog-manager/package.json"

# --- 统一后端代码：只需重启 xhblogs-manager-api ---
expect backend "server/app/main.py"
expect backend "server/app/api/deploy.py"
expect backend "server/app/api/articles.py"
expect backend "server/app/models.py"
expect backend "server/requirements.txt"

# --- 与线上无关 ---
expect other "README.md"
expect other "UpdateLog.md"
expect other "tools/xhblogs-publish"
expect other "LICENSE"
expect other ".gitignore"

rm -f "$TMP"
if [ "$fail" = "0" ]; then echo "== 全部通过 =="; else echo "== 存在失败 =="; exit 1; fi
