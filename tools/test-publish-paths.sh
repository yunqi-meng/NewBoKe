#!/usr/bin/env bash
# 从真实的发布助手脚本里抠出路径分类逻辑，做一次断言测试
set -uo pipefail

SRC="D:/Proiect/XiangMu/BoKe/tools/xhblogs-publish"
TMP="/tmp/xhblogs-pathclass.sh"

sed -n '/^CONTENT_PATHS=(/,/^}/p' "$SRC" > "$TMP"
# shellcheck disable=SC1090
source "$TMP"

fail=0
expect_content() {
  if is_content_path "$1"; then
    echo "OK   内容路径: $1"
  else
    echo "FAIL 应当算内容: $1"; fail=1
  fi
}
expect_code() {
  if is_content_path "$1"; then
    echo "FAIL 应当算代码: $1"; fail=1
  else
    echo "OK   代码路径: $1"
  fi
}

expect_content "XHBlogs/posts/2222.md"
expect_content "XHBlogs/posts/moments/abc.md"
expect_content "XHBlogs/chatters/note.md"
expect_content "XHBlogs/moments/m.md"
expect_content "XHBlogs/app/about/about.md"
expect_content "XHBlogs/data/albums.ts"
expect_content "XHBlogs/data/friends.ts"
expect_content "XHBlogs/data/projects.ts"
expect_content "XHBlogs/siteConfig.ts"
expect_content "XHBlogs/public/uploads/a.png"
expect_content "my-blog-manager/posts/p.md"
expect_content "my-blog-manager/data/albums.ts"
expect_content "my-blog-manager/app/about/about.md"
expect_content "my-blog-manager/siteConfig.ts"
expect_content "my-blog-manager/music/playlist.json"

expect_code "XHBlogs/app/page.tsx"
expect_code "XHBlogs/app/about/page.tsx"
expect_code "my-blog-manager/app/about/page.tsx"
expect_code "XHBlogs/app/posts/[slug]/page.tsx"
expect_code "XHBlogs/components/Navbar.tsx"
expect_code "XHBlogs/lib/siteConfigRuntime.ts"
expect_code "XHBlogs/next.config.ts"
expect_code "XHBlogs/package.json"
expect_code "my-blog-manager/app/page.tsx"
expect_code "my-blog-manager/components/Navbar.tsx"
expect_code "my-blog-manager/cms_core/api/deploy.py"
expect_code "my-blog-manager/package.json"

rm -f "$TMP"
if [ "$fail" = "0" ]; then echo "== 全部通过 =="; else echo "== 存在失败 =="; exit 1; fi
