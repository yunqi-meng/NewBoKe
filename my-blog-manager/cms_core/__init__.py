"""内容引擎包入口。

Windows 终端默认用 GBK 编码，引擎日志里那些表情符号会直接抛
UnicodeEncodeError：轻则一条请求失败，重则定时线程当场退出、服务起不来。
这里统一把标准输出改成 UTF-8，容错用 replace，保证日志永远打得出来。
"""

import sys

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError, OSError):
        # 标准输出被重定向到别的东西时可能不支持 reconfigure，忽略即可。
        pass
