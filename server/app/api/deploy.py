"""发布与回退。

新的发布模型：
    数据库是唯一真相，git 存的是「内容快照」。
    发布 = 把当前内容导出一份快照 JSON → 提交进仓库 → 同步到线上；
    回退 = 把历史快照灌回数据库 → 内容回到当时的样子。

好处是发布内容不再需要搬运一堆 markdown / TS 文件，
一份 JSON 就是一次版本，回退也只是一次导入。
"""

import json
import os
import re
import subprocess
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends

from .. import config
from ..security import require_admin
from ..snapshot import export_snapshot, import_snapshot

router = APIRouter()

# 服务器部署形态：控制台与公开站同机，源码在 Git 仓库工作区里，
# 发布 = 提交内容快照 + 同步到线上（内容改动不需要重新构建站点）。
SERVER_PUBLISH_HELPER = "/usr/local/bin/xhblogs-publish"
# 回退也走同一个助手，只是提交信息前缀不同（chore(rollback)），
# 这样发布历史里能一眼分清「发布」和「回退」。
SERVER_PUBLISH_KIND_PUBLISH = "publish"
SERVER_PUBLISH_KIND_ROLLBACK = "rollback"

PUBLISH_STATUS_FILE = ".publish-status.json"
# 发布进行中的判定：状态文件里的 state 属于这几种就算"正在发布"
PUBLISH_RUNNING_STATES = ("requested", "running", "building")
# 超过这个秒数还停在"进行中"，就当作上次发布异常中断，允许重新发布
PUBLISH_STALE_SECONDS = 15 * 60


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


def _repo_root() -> str:
    return str(config.repo_root())


def _github_remote(repo_root: str) -> str:
    """仓库是否配置了 github 远端（推送按钮的最终目的地）"""
    code, out, _ = _git(repo_root, ["remote", "get-url", "github"])
    return out.strip() if code == 0 else ""


def _status_file_path() -> str:
    return os.path.join(_repo_root(), PUBLISH_STATUS_FILE)


def _is_server_mode() -> bool:
    """是否运行在服务器部署形态（存在发布助手脚本）"""
    return os.name == "posix" and os.path.exists(SERVER_PUBLISH_HELPER)


def _publish_in_progress(repo_root: Optional[str] = None) -> bool:
    """是否已经有一次发布正在跑。

    连点两下「发布上线」会同时拉起两个发布助手：它们会在同一个工作区里
    互相踩（一个推送被拒、两个快照同时写入），最后留下半新半旧的站点。
    这里先拦一道，助手脚本内部还有 flock 兜底。
    """
    root = repo_root or _repo_root()
    status = _read_json(os.path.join(root, PUBLISH_STATUS_FILE), None)
    if not isinstance(status, dict):
        return False
    if str(status.get("state", "")).strip() not in PUBLISH_RUNNING_STATES:
        return False
    started = status.get("startedAtTimestamp")
    try:
        started_at = float(started)
    except (TypeError, ValueError):
        started_at = 0.0
    # 状态文件停在"进行中"太久，说明上一次发布异常中断，允许重新发布
    if started_at and (time.time() - started_at) > PUBLISH_STALE_SECONDS:
        return False
    return True


def _default_blog_path() -> str:
    return os.path.join(_repo_root(), "XHBlogs")


def _resolve_blog_path() -> str:
    """网站源码目录：优先用配置值，配置为空或失效时回落到仓库内的 XHBlogs"""
    config_file = os.path.join(config.data_dir(), "deploy_config.json")
    stored = _read_json(config_file, {}) or {}
    configured = (stored.get("blogPath") or "").strip()
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
def get_deploy_config(_: None = Depends(require_admin)):
    """当前部署方式用到的字段：仓库根目录、快照目录、发布助手。

    刻意用同步 def：里面要跑多条 git 命令，交给线程池执行，
    不会把整个服务的事件循环卡住。
    """
    return {
        "success": True,
        "blogPath": _resolve_blog_path(),
        "repoRoot": _repo_root(),
        "snapshotDir": str(config.snapshots_dir()),
        "serverMode": _is_server_mode(),
        "publishHelper": SERVER_PUBLISH_HELPER if _is_server_mode() else "",
        "githubRemote": _github_remote(_repo_root()),
    }


@router.post("/config")
def save_deploy_config(payload: Optional[Dict[str, Any]] = Body(default=None),
                       _: None = Depends(require_admin)):
    try:
        body = payload or {}
        blog_path = (body.get("blogPath") or "").strip()

        if blog_path and not os.path.exists(blog_path):
            return {"success": False, "message": f"路径不存在：{blog_path}"}

        _write_json(os.path.join(config.data_dir(), "deploy_config.json"), {"blogPath": blog_path})
        return {"success": True, "message": "✅ 发布配置已保存！"}
    except Exception as e:
        return {"success": False, "message": f"保存失败: {str(e)}"}


# --------------------------------------------------------------------------
# 线上状态
# --------------------------------------------------------------------------

def _collect_status(blog_path: str, repo_root: str) -> Dict[str, Any]:
    status = {
        "success": True,
        "serverMode": _is_server_mode(),
        "blogPath": blog_path,
        "repoRoot": repo_root,
        "snapshotDir": str(config.snapshots_dir()),
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
        status["git"]["githubRemote"] = _github_remote(repo_root)

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

        code, out, _ = _run(["systemctl", "is-active", "xhblogs-manager-api"], timeout=10)
        status["service"]["apiActive"] = out.strip() == "active"

    # --- 最近一次发布 ---
    status_file = _status_file_path()
    if status_file:
        publish = _read_json(status_file, None)
        if publish:
            status["publish"] = publish
            started = publish.get("startedAtTimestamp")
            built = status["build"].get("timestamp")
            if started and built and built >= started:
                status["effective"] = True
            # 🌟 纯内容发布不会重新构建站点，构建号的时间戳会比本次发布早，
            #    这时要靠发布助手写下的「生效时间戳」来判断内容是否已经上线。
            try:
                effective_at = float(publish.get("effectiveAtTimestamp") or 0)
            except (TypeError, ValueError):
                effective_at = 0.0
            if effective_at and started and effective_at >= float(started):
                status["effective"] = True
            if publish.get("state") == "failed":
                status["effective"] = False

    return status


@router.get("/status")
def get_publish_status(_: None = Depends(require_admin)):
    """返回当前线上状态：Git、构建产物、服务、最近一次发布"""
    try:
        return _collect_status(_resolve_blog_path(), _repo_root())
    except Exception as e:
        return {"success": False, "message": f"状态采集失败: {str(e)}"}


# --------------------------------------------------------------------------
# 快照与发布历史
# --------------------------------------------------------------------------

@router.get("/snapshots")
def list_snapshots(_: None = Depends(require_admin)):
    """本地的内容快照列表（文件名 + 大小 + 时间）。"""
    directory = config.snapshots_dir()
    files = []
    if directory.exists():
        for path in sorted(directory.glob("content-*.json")):
            try:
                stat = path.stat()
            except OSError:
                continue
            files.append({
                "name": path.name,
                "size": stat.st_size,
                "updatedAt": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime)),
            })
    return {"success": True, "snapshots": files, "count": len(files)}


def _commit_history(repo_root: str, limit: int = 20) -> List[Dict[str, Any]]:
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
def get_publish_history(_: None = Depends(require_admin)):
    """发布历史：每一次发布与回退都是一次提交，可以回到其中任意一步"""
    try:
        repo_root = _repo_root()
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


def _find_snapshot_in_commit(repo_root: str, commit: str) -> Optional[str]:
    """在某次提交里找到内容快照文件的路径。

    只认 content-*.json：回退时落下的 rollback-*.json 记录的是
    「当时恢复成了什么」，拿它回退会退到更早的一步。
    """
    code, out, _ = _git(repo_root, ["ls-tree", "-r", "--name-only", commit, "snapshots/"])
    if code != 0:
        return None
    names = [
        line.strip()
        for line in out.splitlines()
        if line.strip().startswith("snapshots/content-") and line.strip().endswith(".json")
    ]
    if not names:
        return None
    # 取最新的一份
    names.sort()
    return names[-1]


# --------------------------------------------------------------------------
# 回退
# --------------------------------------------------------------------------

@router.post("/rollback")
def rollback_to_commit(payload: Optional[Dict[str, Any]] = Body(default=None),
                       _: None = Depends(require_admin)):
    """把内容回退到指定提交（发布历史里的前几步）。

    回退 = 把那次提交里的快照灌回数据库，内容立刻回到当时的样子。
    """
    try:
        body = payload or {}
        commit = (body.get("commit") or "").strip()

        if not commit:
            return {"success": False, "message": "请选择要回退到的那一步"}
        if not re.fullmatch(r"[0-9a-fA-F]{7,40}", commit):
            return {"success": False, "message": "提交号格式不对，请重新选择"}

        repo_root = _repo_root()

        code, _, _ = _git(repo_root, ["cat-file", "-e", "%s^{commit}" % commit])
        if code != 0:
            return {"success": False, "message": "找不到这次提交，可能已经被清理了"}

        code, _, _ = _git(repo_root, ["merge-base", "--is-ancestor", commit, "HEAD"])
        if code != 0:
            return {"success": False, "message": "只能回退到当前版本之前的某一步"}

        # 发布与回退都会改同一个工作区，不能同时进行
        if _publish_in_progress(repo_root):
            return {
                "success": False,
                "message": "⏳ 当前有发布或回退任务正在进行中，请等它结束后再操作。",
                "busy": True,
            }

        snapshot_name = _find_snapshot_in_commit(repo_root, commit)
        if not snapshot_name:
            return {"success": False, "message": "这次提交里没有内容快照，无法回退"}

        # 把快照从 git 里取出来再灌进数据库
        code, raw, _ = _git(repo_root, ["show", "%s:%s" % (commit, snapshot_name)])
        if code != 0:
            return {"success": False, "message": "读取快照内容失败"}

        # 回退用的临时快照放在后端数据目录里，不进仓库；
        # 仓库里只留 export_snapshot() 生成的那一份 content-*.json。
        target = config.data_dir() / ("rollback-{0}.json".format(commit[:8]))
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(raw, encoding="utf-8")
            counts = import_snapshot(target)
        except Exception as e:
            return {"success": False, "message": "回退到数据库失败: %s" % str(e)}

        # 立刻导出当前内容，形成一份新的快照（回退本身也是一次版本）
        export_snapshot()

        if not _is_server_mode():
            return {
                "success": True,
                "message": "↩️ 已把内容恢复到 %s。" % commit[:8],
                "commit": commit,
                "counts": counts,
                "serverMode": False,
            }

        _write_json(_status_file_path(), {
            "state": "requested",
            "startedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
            "startedAtTimestamp": time.time(),
            "message": "正在回退到 %s…" % commit[:8],
        })

        try:
            subprocess.Popen(
                ["sudo", "-n", SERVER_PUBLISH_HELPER, repo_root, SERVER_PUBLISH_KIND_ROLLBACK],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
        except Exception as e:
            return {"success": False, "message": "触发同步失败：%s" % str(e)}

        return {
            "success": True,
            "message": "↩️ 回退请求已提交：内容已恢复到 %s，并会推送到服务器仓库与 GitHub 仓库。" % commit[:8],
            "commit": commit,
            "counts": counts,
            "serverMode": True,
        }
    except Exception as e:
        return {"success": False, "message": "回退过程发生异常: %s" % str(e)}


# --------------------------------------------------------------------------
# 推送到 GitHub 仓库
# --------------------------------------------------------------------------

@router.post("/publish")
def publish_to_live(_: None = Depends(require_admin)):
    """把当前数据库里的内容导成快照，提交并推送到 GitHub 仓库。

    内容在控制台保存时就已经实时写入数据库、公开站刷新即见；
    这里只负责留一份可追溯、可回退的版本：导出快照 → 提交 → 推送服务器仓库与 GitHub。
    """
    try:
        repo_root = _repo_root()

        # 连点两次会让两个发布助手同时改同一个工作区，先挡住后来的那一次
        if _publish_in_progress(repo_root):
            return {
                "success": False,
                "message": "⏳ 上一次推送还在进行中，请等它结束后再推送。",
                "serverMode": _is_server_mode(),
                "busy": True,
            }

        # 1. 导出内容快照
        try:
            snapshot = export_snapshot()
        except Exception as e:
            return {"success": False, "message": "导出内容快照失败: %s" % str(e)}

        # 2. 触发服务器发布（提交仓库 + 同步到线上）
        if not _is_server_mode():
            return {
                "success": True,
                "message": "✅ 内容快照已生成：%s。当前不是服务器部署环境，没有推送助手；到服务器上点推送即可提交并同步到 GitHub。" % snapshot.name,
                "serverMode": False,
                "snapshot": snapshot.name,
            }

        _write_json(_status_file_path(), {
            "state": "requested",
            "startedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
            "startedAtTimestamp": time.time(),
            "message": "已提交推送请求，正在把内容快照推送到 GitHub…",
        })

        try:
            proc = subprocess.Popen(
                ["sudo", "-n", SERVER_PUBLISH_HELPER, repo_root, SERVER_PUBLISH_KIND_PUBLISH],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            proc.poll()
        except Exception as e:
            return {"success": False, "message": f"触发推送失败：{str(e)}"}

        return {
            "success": True,
            "message": "📤 推送请求已提交：内容快照已生成，正在推送到服务器仓库与 GitHub 仓库。",
            "serverMode": True,
            "snapshot": snapshot.name,
            "statusFile": _status_file_path(),
        }
    except Exception as e:
        return {"success": False, "message": f"推送过程发生异常: {str(e)}"}
