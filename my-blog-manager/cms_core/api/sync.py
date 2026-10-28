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

# 增量镜像的目录对：(控制台源目录, 博客目标目录)
# 本地音乐体积大，用增量方式避免每次发布都全量重拷一遍
SYNC_DIR_PAIRS = [
    ("music", os.path.join("public", "audio")),
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


def _same_file(src_stat, dst_path):
    """目标文件是否与源文件一致（大小 + 修改时间）"""
    try:
        dst_stat = os.stat(dst_path)
    except OSError:
        return False
    return (src_stat.st_size == dst_stat.st_size
            and int(src_stat.st_mtime) == int(dst_stat.st_mtime))


def sync_dir_incremental(src_dir, dst_dir):
    """增量同步一个目录树：只复制新增/变更的文件，删掉目标里多余的旧文件。

    相比 copytree 全量覆盖，这样几十上百 MB 的音频不会被反复重拷。
    返回 (复制数量, 删除数量)。
    """
    copied = 0
    removed = 0

    # 目标端先建好目录
    os.makedirs(dst_dir, exist_ok=True)

    source_files = {}
    for root, _dirs, files in os.walk(src_dir):
        for name in files:
            src_path = os.path.join(root, name)
            rel = os.path.relpath(src_path, src_dir)
            source_files[rel.replace(os.sep, "/")] = src_path

    # 复制新增或变更的文件
    for rel, src_path in source_files.items():
        dst_path = os.path.join(dst_dir, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(dst_path), exist_ok=True)
        if not os.path.isfile(dst_path) or not _same_file(os.stat(src_path), dst_path):
            shutil.copy2(src_path, dst_path)
            copied += 1

    # 清掉目标里源端已经没有的文件（比如控制台删掉的旧曲目）
    for root, _dirs, files in os.walk(dst_dir):
        for name in files:
            dst_path = os.path.join(root, name)
            rel = os.path.relpath(dst_path, dst_dir).replace(os.sep, "/")
            if rel not in source_files:
                try:
                    os.remove(dst_path)
                    removed += 1
                except OSError:
                    pass

    # 清理空目录
    for root, dirs, files in os.walk(dst_dir, topdown=False):
        if not dirs and not files and os.path.abspath(root) != os.path.abspath(dst_dir):
            try:
                os.rmdir(root)
            except OSError:
                pass

    return copied, removed


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

    music_note = ""
    for src_rel, dst_rel in SYNC_DIR_PAIRS:
        src_dir = os.path.join(PROJECT_ROOT, src_rel)
        dst_dir = os.path.join(target_path, dst_rel)

        if not os.path.isdir(src_dir):
            continue

        copied, removed = sync_dir_incremental(src_dir, dst_dir)
        if copied or removed:
            music_note = "；本地音乐同步 {0} 个新增 / {1} 个清理".format(copied, removed)

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

    return True, "内容已镜像覆盖至网站源码目录" + music_note


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
