"""数据库连接与会话。

统一用 SQLAlchemy 2.x 的声明式模型，SQLite 与 MySQL 都能跑，
换库只要改 XHS_DATABASE_URL。
"""

from contextlib import contextmanager

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from . import config


class Base(DeclarativeBase):
    """所有 ORM 模型的基类。"""


def _build_engine():
    url = config.database_url()
    kwargs = {"future": True}
    if url.startswith("sqlite"):
        # SQLite 的连接参数与其它数据库不同：同一个连接会被多个线程复用。
        # 也不必每次都 ping：本地文件库不存在「连接被服务器掐断」这回事，
        # 每次取连接多探一次反而增加无谓开销。
        kwargs["pool_pre_ping"] = False
        kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
    else:
        kwargs["pool_pre_ping"] = True
    return create_engine(url, **kwargs)


engine = _build_engine()


@event.listens_for(engine, "connect")
def _sqlite_pragmas(dbapi_connection, _connection_record):
    """打开 WAL 并开启外键约束，避免并发写入时互相锁死。"""
    if not config.database_url().startswith("sqlite"):
        return
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=30000")
        # 读多写少的小站：把页缓存和内存映射调大，查询少走几次系统调用；
        # 临时表放内存里，排序聚合不用落盘。
        cursor.execute("PRAGMA cache_size=-32000")      # 约 32MB 页缓存
        cursor.execute("PRAGMA mmap_size=268435456")    # 256MB 内存映射
        cursor.execute("PRAGMA temp_store=MEMORY")
    finally:
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


def get_db():
    """FastAPI 依赖：每个请求一个会话。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope():
    """脚本里用的会话上下文。"""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db() -> None:
    """建表（幂等）。"""
    from . import models  # noqa: F401  确保模型都已注册

    config.data_dir().mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)
