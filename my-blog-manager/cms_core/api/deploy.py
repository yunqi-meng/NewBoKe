import os
import json
import platform
import re
import subprocess
import time
from fastapi import APIRouter, Request

from cms_core.api.sync import mirror_content

router = APIRouter()

CURRENT_API_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_API_DIR, "..", ".."))
CONFIG_FILE = os.path.join(PROJECT_ROOT, "data", "deploy_config.json")

# 服务器部署形态：控制台与公开站同机，源码在 Git 仓库工作区里，
# 发布 = 提交到仓库 + 重新构建 + 重启服务。
SERVER_PUBLISH_HELPER = "/usr/local/bin/xhblogs-publish"
# 回退助手：把内容路径恢复到指定提交，再重新构建上线。
SERVER_ROLLBACK_HELPER = "/usr/local/bin/xhblogs-rollback"
DEFAULT_REPO_ROOT = os.path.dirname(PROJECT_ROOT)
PUBLISH_STATUS_FILE = ".publish-status.json"


# --------------------------------------------------------------------------
# 基础工具
# --------------------------------------------------------------------------

def _read_json(path, default=None):
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def _write_json(path, payload):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except PermissionError:
        # 助手脚本以 root 写过同名文件时，先删掉再用临时文件替换
        tmp_path = path + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, path)


def _run(cmd, cwd=None, timeout=60):
    """执行外部命令，返回 (returncode, stdout, stderr)

    固定按 UTF-8 解码：Windows 默认按 GBK 解码，会把中文提交说明读成乱码甚至
    直接抛 UnicodeDecodeError（发布历史因此在本地桌面版读不出来）。
    """
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True,
            encoding="utf-8",
            errors="replace",
        )
        stdout, stderr = proc.communicate(timeout=timeout)
        return proc.returncode, stdout, stderr
    except Exception as e:
        return 1, "", str(e)


def _git(repo, args, timeout=60):
    return _run(["git", "-C", repo] + args, timeout=timeout)


def _is_server_mode():
    """是否运行在服务器部署形态（存在发布助手脚本）"""
    return platform.system() == "Linux" and os.path.exists(SERVER_PUBLISH_HELPER)


def _default_blog_path():
    return os.path.join(DEFAULT_REPO_ROOT, "XHBlogs")


def _resolve_blog_path():
    """网站源码目录：优先用配置值，配置为空或失效时回落到仓库内的 XHBlogs"""
    config = _read_json(CONFIG_FILE, {}) or {}
    configured = (config.get("blogPath") or "").strip()
    if configured and os.path.exists(configured):
        return configured
    default_path = _default_blog_path()
    if os.path.exists(default_path):
        return default_path
    return configured


# --------------------------------------------------------------------------
# 配置
# --------------------------------------------------------------------------

@router.get("/config")
async def get_deploy_config():
    """只保留当前部署方式真正用到的字段：网站源码路径"""
    config = _read_json(CONFIG_FILE, {}) or {}
    return {
        "blogPath": _resolve_blog_path(),
        "configuredPath": (config.get("blogPath") or "").strip(),
        "serverMode": _is_server_mode(),
        "repoRoot": DEFAULT_REPO_ROOT,
        "publishHelper": SERVER_PUBLISH_HELPER if _is_server_mode() else "",
    }


@router.post("/config")
async def save_deploy_config(request: Request):
    try:
        payload = await request.json()
        blog_path = (payload.get("blogPath") or "").strip()

        if blog_path and not os.path.exists(blog_path):
            return {"success": False, "message": f"路径不存在：{blog_path}"}

        _write_json(CONFIG_FILE, {"blogPath": blog_path})
        return {"success": True, "message": "✅ 发布配置已保存！"}
    except Exception as e:
        return {"success": False, "message": f"保存失败: {str(e)}"}


# --------------------------------------------------------------------------
# 线上状态
# --------------------------------------------------------------------------

def _collect_status(blog_path, repo_root):
    status = {
        "success": True,
        "serverMode": _is_server_mode(),
        "blogPath": blog_path,
        "repoRoot": repo_root,
        "git": {},
        "build": {},
        "service": {},
        "publish": {},
        "effective": False,
    }

    # --- Git 状态 ---
    if repo_root and os.path.isdir(os.path.join(repo_root, ".git")):
        code, out, _ = _git(repo_root, ["rev-parse", "--abbrev-ref", "HEAD"])
        status["git"]["branch"] = out.strip() if code == 0 else ""

        code, out, _ = _git(repo_root, ["rev-parse", "--short", "HEAD"])
        status["git"]["head"] = out.strip() if code == 0 else ""

        code, out, _ = _git(repo_root, ["log", "-1", "--format=%s"])
        status["git"]["lastCommit"] = out.strip() if code == 0 else ""

        code, out, _ = _git(repo_root, ["log", "-1", "--format=%cI"])
        status["git"]["lastCommitTime"] = out.strip() if code == 0 else ""

        code, out, _ = _git(repo_root, ["status", "--porcelain", "--untracked-files=no"])
        changed = [line for line in out.splitlines() if line.strip()]
        status["git"]["dirty"] = len(changed) > 0
        status["git"]["changedFiles"] = changed[:20]

    # --- 构建产物状态 ---
    build_id_file = os.path.join(blog_path, ".next", "BUILD_ID")
    if os.path.exists(build_id_file):
        try:
            with open(build_id_file, "r", encoding="utf-8") as f:
                status["build"]["id"] = f.read().strip()
            status["build"]["time"] = time.strftime(
                "%Y-%m-%d %H:%M:%S",
                time.localtime(os.path.getmtime(build_id_file)),
            )
            status["build"]["timestamp"] = os.path.getmtime(build_id_file)
        except Exception:
            pass

    # --- 是否正在重建 ---
    code, out, _ = _run(["pgrep", "-f", "next build"], timeout=10)
    status["build"]["running"] = code == 0 and bool(out.strip())

    # --- systemd 服务状态 ---
    if _is_server_mode():
        code, out, _ = _run(["systemctl", "is-active", "xhblogs"], timeout=10)
        status["service"]["name"] = "xhblogs"
        status["service"]["active"] = out.strip() == "active"

    # --- 最近一次发布 ---
    status_file = os.path.join(repo_root, PUBLISH_STATUS_FILE) if repo_root else ""
    if status_file:
        publish = _read_json(status_file, None)
        if publish:
            status["publish"] = publish
            started = publish.get("startedAtTimestamp")
            built = status["build"].get("timestamp")
            if started and built and built >= started:
                status["effective"] = True
            if publish.get("state") == "failed":
                status["effective"] = False

    return status


@router.get("/status")
async def get_publish_status():
    """返回当前线上状态：Git、构建产物、服务、最近一次发布"""
    try:
        blog_path = _resolve_blog_path()
        repo_root = DEFAULT_REPO_ROOT
        return _collect_status(blog_path, repo_root)
    except Exception as e:
        return {"success": False, "message": f"状态采集失败: {str(e)}"}


# --------------------------------------------------------------------------
# 发布历史与回退
# --------------------------------------------------------------------------

def _commit_history(repo_root, limit=20):
    """列出最近的提交，控制台据此展示「前几步操作」并提供回退入口"""
    code, out, _ = _git(repo_root, ["log", "-%d" % limit, "--format=%H%x1f%h%x1f%cI%x1f%s"])
    if code != 0:
        return []

    commits = []
    for line in out.splitlines():
        parts = line.split("\x1f")
        if len(parts) != 4:
            continue
        full, short, when, subject = parts
        commits.append({
            "commit": full,
            "short": short,
            "date": when,
            "subject": subject,
            "isPublish": subject.startswith("chore(publish)"),
            "isRollback": subject.startswith("chore(rollback)"),
        })
    return commits


@router.get("/history")
async def get_publish_history():
    """发布历史：每一次发布与回退都是一次提交，可以回到其中任意一步"""
    try:
        repo_root = DEFAULT_REPO_ROOT
        code, out, _ = _git(repo_root, ["rev-parse", "HEAD"])
        head = out.strip() if code == 0 else ""
        commits = _commit_history(repo_root, 20)
        return {
            "success": True,
            "head": head,
            "commits": commits,
            "serverMode": _is_server_mode(),
        }
    except Exception as e:
        return {"success": False, "message": f"读取发布历史失败: {str(e)}"}


@router.post("/rollback")
async def rollback_to_commit(request: Request):
    """把内容回退到指定提交（发布历史里的前几步），并重新构建上线"""
    try:
        payload = await request.json()
        commit = (payload.get("commit") or "").strip()

        if not commit:
            return {"success": False, "message": "请选择要回退到的那一步"}
        if not re.fullmatch(r"[0-9a-fA-F]{7,40}", commit):
            return {"success": False, "message": "提交号格式不对，请重新选择"}

        repo_root = DEFAULT_REPO_ROOT

        code, _, _ = _git(repo_root, ["cat-file", "-e", "%s^{commit}" % commit])
        if code != 0:
            return {"success": False, "message": "找不到这次提交，可能已经被清理了"}

        code, _, _ = _git(repo_root, ["merge-base", "--is-ancestor", commit, "HEAD"])
        if code != 0:
            return {"success": False, "message": "只能回退到当前版本之前的某一步"}

        if not _is_server_mode():
            return {"success": False, "message": "当前不是服务器部署环境，无法自动回退"}

        status_file = os.path.join(repo_root, PUBLISH_STATUS_FILE)
        _write_json(status_file, {
            "state": "requested",
            "startedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
            "startedAtTimestamp": time.time(),
            "message": "正在回退到 %s…" % commit[:8],
        })

        try:
            subprocess.Popen(
                ["sudo", "-n", SERVER_ROLLBACK_HELPER, repo_root, commit],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
        except Exception as e:
            return {"success": False, "message": "触发回退失败：%s" % str(e)}

        return {
            "success": True,
            "message": "↩️ 回退请求已提交：内容正在恢复到 %s 并重新构建，约 1-3 分钟生效。" % commit[:8],
            "commit": commit,
        }
    except Exception as e:
        return {"success": False, "message": "回退过程发生异常: %s" % str(e)}


# --------------------------------------------------------------------------
# 发布上线
# --------------------------------------------------------------------------

@router.post("/publish")
async def publish_to_live(request: Request):
    """把控制台的改动真正发布到线上：镜像源码 → 提交仓库 → 重新构建 → 重启服务"""
    try:
        payload = await request.json()
        config = _read_json(CONFIG_FILE, {}) or {}

        blog_path = (payload.get("blogPath") or config.get("blogPath") or "").strip()
        if not blog_path or not os.path.exists(blog_path):
            blog_path = _resolve_blog_path()

        if not blog_path or not os.path.exists(blog_path):
            return {"success": False, "message": f"目标路径不存在：{blog_path or '（未配置）'}"}

        # 1. 镜像内容到网站源码目录
        ok, message = mirror_content(blog_path)
        if not ok:
            return {"success": False, "message": message}

        # 2. 触发服务器发布（提交仓库 + 重建 + 重启）
        if not _is_server_mode():
            return {
                "success": True,
                "message": "✅ 内容已镜像到网站源码目录。当前不是服务器部署环境，请手动执行构建发布。",
                "serverMode": False,
            }

        repo_root = DEFAULT_REPO_ROOT
        status_file = os.path.join(repo_root, PUBLISH_STATUS_FILE)
        _write_json(status_file, {
            "state": "requested",
            "startedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
            "startedAtTimestamp": time.time(),
            "message": "已提交发布请求，正在等待构建…",
        })

        try:
            proc = subprocess.Popen(
                ["sudo", "-n", SERVER_PUBLISH_HELPER, repo_root],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            proc.poll()
        except Exception as e:
            return {"success": False, "message": f"触发发布失败：{str(e)}"}

        return {
            "success": True,
            "message": "🚀 发布请求已提交：内容已镜像，源码正在提交并重建线上站点，约 1-3 分钟生效。",
            "serverMode": True,
            "statusFile": status_file,
        }
    except Exception as e:
        return {"success": False, "message": f"发布过程发生异常: {str(e)}"}
