"""解析 siteConfig.ts。

这份解析器只用在「迁移」阶段：把老的 siteConfig.ts 读成一份 JSON 导进数据库。
导入完成后，配置就以数据库为准，这份文件解析器可以退休。

解析方式是纯正则 + 括号平衡，不用真的跑一遍 TypeScript。
"""

import json
import re
from pathlib import Path

# 已知会嵌套对象的字段：它们的内部属性不能漏到外层去
KNOWN_DICTS = ("social", "aiConfig", "geminiConfig", "icpConfig")


def extract_balanced_array(content: str, open_idx: int):
    """从 open_idx（指向 '['）开始做字符串感知的括号计数，返回完整的数组文本。

    bgGroups 是「对象数组且内嵌 images 数组」，
    普通非贪婪正则会在第一个 ']' 处截断，必须用括号平衡算法。
    """
    depth = 0
    i = open_idx
    in_str = False
    quote = ""
    n = len(content)
    while i < n:
        c = content[i]
        if in_str:
            if c == "\\":
                i += 2
                continue
            if c == quote:
                in_str = False
        else:
            if c in ('"', "'"):
                in_str = True
                quote = c
            elif c == "[":
                depth += 1
            elif c == "]":
                depth -= 1
                if depth == 0:
                    return content[open_idx:i + 1]
        i += 1
    return None


def strip_trailing_commas(content: str) -> str:
    """Remove TS trailing commas without changing quoted names or image URLs."""
    output = []
    quote = None
    i = 0
    while i < len(content):
        char = content[i]
        if quote:
            output.append(char)
            if char == "\\" and i + 1 < len(content):
                i += 1
                output.append(content[i])
            elif char == quote:
                quote = None
        elif char in ('"', "'"):
            quote = char
            output.append(char)
        elif char == ",":
            next_index = i + 1
            while next_index < len(content) and content[next_index].isspace():
                next_index += 1
            if next_index == len(content) or content[next_index] not in ']}':
                output.append(char)
        else:
            output.append(char)
        i += 1
    return "".join(output)


def parse_site_config(path) -> dict:
    """把 siteConfig.ts 解析成普通字典。文件不存在时返回空字典。"""
    path = Path(path)
    if not path.exists():
        return {}
    content = path.read_text(encoding="utf-8")

    parsed: dict = {}
    root_content = content

    # 1. 先把嵌套对象摘出来，避免它们的内部属性混进外层
    for dict_name in KNOWN_DICTS:
        dict_match = re.search(rf'{dict_name}\s*:\s*\{{([\s\S]+?)\}}', content)
        if not dict_match:
            continue
        dict_str = dict_match.group(1)
        root_content = re.sub(rf'{dict_name}\s*:\s*\{{[\s\S]+?\}},?', '', root_content)

        sub_dict = {}
        for m in re.finditer(
            r'([a-zA-Z0-9_]+)\s*:\s*(?:(["\'])([\s\S]*?)\2|(true|false|\d+(?:\.\d+)?))',
            dict_str,
        ):
            key = m.group(1)
            if m.group(3) is not None:
                sub_dict[key] = m.group(3).replace("\\n", "\n")
            elif m.group(4) in ("true", "false"):
                sub_dict[key] = m.group(4) == "true"
            else:
                num = float(m.group(4))
                sub_dict[key] = int(num) if num.is_integer() else num
        parsed[dict_name] = sub_dict

    # 1.5 壁纸分组：数组内嵌对象与 images 数组，需括号平衡专用解析
    bg_start = re.search(r'bgGroups\s*:\s*\[', root_content)
    if bg_start:
        span = extract_balanced_array(root_content, bg_start.end() - 1)
        if span:
            try:
                parsed["bgGroups"] = json.loads(strip_trailing_commas(span))
            except ValueError:
                pass
            root_content = root_content.replace(span, "", 1)

    # 2. 外层基础字段（字符串、布尔值、数字）
    for match in re.finditer(
        r'([a-zA-Z0-9_]+)\s*:\s*(?:(["\'])([\s\S]*?)\2|(true|false|\d+))',
        root_content,
    ):
        key = match.group(1)
        str_val = match.group(3)
        raw_val = match.group(4)
        if str_val is not None:
            parsed[key] = str_val.replace("\\n", "\n")
        elif raw_val == "true":
            parsed[key] = True
        elif raw_val == "false":
            parsed[key] = False
        elif raw_val.isdigit():
            parsed[key] = int(raw_val)

    return parsed
