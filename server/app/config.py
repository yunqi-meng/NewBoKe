"""后端运行配置。

所有可调项一律从环境变量读取，仓库里不保存任何密钥：

    XHS_DATABASE_URL    数据库连接串（默认 sqlite:///server/data/blog.db）
    XHS_CONTENT_DIR     媒体与音乐的物理目录（默认 server/data）
    XHS_REPO_ROOT       仓库根目录，默认由本文件位置推断
    XHS_SNAPSHOT_DIR    内容快照目录（默认 <仓库根>/snapshots）
    XHS_CORS_ORIGINS    允许跨域的来源，逗号分隔，默认只允许本机
    MANAGER_SESSION_SECRET  会话签名密钥
    MANAGER_ADMIN_PASSWORD_HASH  管理员密码哈希（scrypt$N$r$p$salt$hash）
"""

import os
from pathlib import Path

from dotenv import load_dotenv

SERVER_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_REPO_ROOT = SERVER_ROOT.parent

# server/.env 是本地开发的配置来源（已被 .gitignore 忽略，仓库里不存任何密钥）。
# override=False：系统环境变量优先，线上 systemd 的 EnvironmentFile 不会被覆盖。
load_dotenv(SERVER_ROOT / ".env", override=False)


def _env(name: str, default: str = "") -> str:
    value = os.environ.get(name)
    if not isinstance(value, str):
        return default
    value = value.strip()
    return value if value else default


def repo_root() -> Path:
    """仓库根目录。发布、回退、历史查询都围着它转。"""
    return Path(_env("XHS_REPO_ROOT", str(DEFAULT_REPO_ROOT))).resolve()


def data_dir() -> Path:
    """后端自己的数据目录（数据库文件默认放这里）。"""
    return Path(_env("XHS_DATA_DIR", str(SERVER_ROOT / "data"))).resolve()


def database_url() -> str:
    """数据库连接串。

    默认是仓库内的 SQLite 文件；线上建议用环境变量指到仓库外
    （例如 /var/lib/xhblogs/blog.db），这样重新部署或清空工作区都不会碰到数据。
    """
    explicit = _env("XHS_DATABASE_URL")
    if explicit:
        return explicit
    return "sqlite:///" + str(data_dir() / "blog.db").replace("\\", "/")


def content_dir() -> Path:
    """媒体（图片）与音乐的物理目录。"""
    return Path(_env("XHS_CONTENT_DIR", str(SERVER_ROOT / "data"))).resolve()


def uploads_dir() -> Path:
    return content_dir() / "uploads"


def music_dir() -> Path:
    return content_dir() / "music"


def snapshots_dir() -> Path:
    return Path(_env("XHS_SNAPSHOT_DIR", str(repo_root() / "snapshots"))).resolve()


def cors_origins() -> list:
    raw = _env("XHS_CORS_ORIGINS")
    if raw:
        return [item.strip() for item in raw.split(",") if item.strip()]
    return [
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "http://127.0.0.1:3001",
        "http://localhost:3001",
        "http://127.0.0.1:8080",
        "http://localhost:8080",
    ]


def session_secret() -> str:
    """会话签名密钥。没有配置时退回空串，此时只允许内网读取。"""
    return _env("MANAGER_SESSION_SECRET")


def password_hash() -> str:
    return _env("MANAGER_ADMIN_PASSWORD_HASH")


def auth_enabled() -> bool:
    return bool(password_hash())


def server_mode() -> bool:
    """线上服务器部署形态（用于决定发布走 git 助手还是本地提示）。"""
    return Path("/usr/local/bin/xhblogs-publish").exists() and os.name == "posix"
