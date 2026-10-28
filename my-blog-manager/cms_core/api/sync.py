import os
import shutil
from fastapi import APIRouter, Request

router = APIRouter()

# 动态定位 Manager 根目录
CURRENT_API_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_API_DIR, "..", ".."))

# 需要镜像覆盖的文件夹 (先清空目标，再全量复制)
SYNC_DIRS = ["posts", "chatters", "moments"]
# 需要精确覆盖的单文件
SYNC_FILES = [
    "app/about/about.md",
    "data/albums.ts",
    "data/friends.ts",
    "data/projects.ts",
    "siteConfig.ts"
]

# siteConfig.ts 里的敏感行，镜像时必须剔除（图床凭证只留在本机控制台）
SENSITIVE_SITE_CONFIG_MARKERS = [
    "picBedName:",
    "picBedUrl:",
    "picBedToken:",
    "图床核心配置"
]


def is_safe_blog_dir(target_path):
    """防呆检测：只有包含 package.json 的才被认为是安全的博客目录"""
    return os.path.exists(os.path.join(target_path, "package.json"))


def mirror_content(target_path):
    """把控制台工作区的内容镜像覆盖到网站源码目录。

    返回 (是否成功, 说明文字)。这是纯文件操作，不碰 Git，也不触发构建，
    发布上线（git 提交 + 重建）由 deploy.publish 负责。
    """
    if not is_safe_blog_dir(target_path):
        return False, "安全拦截：目标路径不合法！"

    for d in SYNC_DIRS:
        src_dir = os.path.join(PROJECT_ROOT, d)
        dst_dir = os.path.join(target_path, d)

        if os.path.exists(src_dir):
            if os.path.exists(dst_dir):
                shutil.rmtree(dst_dir)
            shutil.copytree(src_dir, dst_dir)

    for f in SYNC_FILES:
        src_file = os.path.join(PROJECT_ROOT, f.replace("/", os.sep))
        dst_file = os.path.join(target_path, f.replace("/", os.sep))

        if not os.path.exists(src_file):
            continue

        os.makedirs(os.path.dirname(dst_file), exist_ok=True)

        if f == "siteConfig.ts":
            with open(src_file, "r", encoding="utf-8") as file_in:
                lines = file_in.readlines()

            with open(dst_file, "w", encoding="utf-8") as file_out:
                for line in lines:
                    if any(marker in line for marker in SENSITIVE_SITE_CONFIG_MARKERS):
                        continue
                    file_out.write(line)
        else:
            shutil.copy2(src_file, dst_file)

    return True, "内容已镜像覆盖至网站源码目录"


@router.post("/check")
async def check_blog_path(request: Request):
    """检测目标路径是否合法且具备基本结构"""
    try:
        payload = await request.json()
        target_path = payload.get("blogPath", "").strip()

        if not target_path or not os.path.exists(target_path):
            return {"success": False, "message": "🚫 目标物理路径不存在，请检查输入！"}

        if not is_safe_blog_dir(target_path):
            return {"success": False,
                    "message": "⚠️ 危险！目标路径未检测到 package.json，似乎不是一个有效的前端项目，已拦截操作。"}

        missing = []
        for d in ["posts", "data", "app"]:
            if not os.path.exists(os.path.join(target_path, d)):
                missing.append(d)

        if missing:
            return {"success": True,
                    "message": f"✅ 路径安全。但目标缺失以下文件夹：{', '.join(missing)}。同步时将自动创建。"}

        return {"success": True, "message": "✅ 路径校验通过，目录结构完美！"}
    except Exception as e:
        return {"success": False, "message": f"校验异常: {str(e)}"}


@router.post("/execute")
async def execute_sync(request: Request):
    """仅做物理覆盖同步（不提交 Git、不重建站点）"""
    try:
        payload = await request.json()
        target_path = payload.get("blogPath", "").strip()

        ok, message = mirror_content(target_path)
        if not ok:
            return {"success": False, "message": message}

        return {"success": True, "message": "✅ 内容已镜像覆盖至网站源码目录。"}
    except Exception as e:
        return {"success": False, "message": f"同步过程中发生致命错误: {str(e)}"}
