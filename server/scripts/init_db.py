"""建表脚本。

    python scripts/init_db.py

幂等：表已存在就跳过。数据库文件默认落在 server/data/blog.db。
"""

import argparse
import sys
from pathlib import Path

# 允许直接 `python scripts/init_db.py` 运行
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config  # noqa: E402
from app.db import init_db  # noqa: E402
from app.helpers import configure_console_encoding  # noqa: E402

configure_console_encoding()


def main() -> int:
    parser = argparse.ArgumentParser(description="建立统一后端的数据库表")
    parser.add_argument("--database-url", default="", help="覆盖数据库连接串")
    args = parser.parse_args()

    if args.database_url:
        import os

        os.environ["XHS_DATABASE_URL"] = args.database_url

    init_db()
    print("✅ 数据库表已就绪：%s" % config.database_url())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
