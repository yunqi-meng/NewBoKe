import json


def _strip_trailing_commas(text):
    """去掉 JSON 里非法的“尾随逗号”，控制台生成的数据文件会带上 TS 风格逗号。

    例：``{"a": 1,}`` 和 ``[1, 2,]`` 在标准 JSON 里非法，但控制台写出来的文件就是这样。
    只在字符串之外做替换，避免破坏 ``https://`` 这类带斜杠的文本。
    """
    result = []
    in_string = False
    escaped = False
    length = len(text)

    for index, char in enumerate(text):
        if in_string:
            result.append(char)
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
            result.append(char)
            continue

        if char == ",":
            probe = index + 1
            while probe < length and text[probe] in " \t\r\n":
                probe += 1
            if probe < length and text[probe] in "}]":
                continue  # 丢弃尾随逗号

        result.append(char)

    return "".join(result)


def read_ts_array(path, marker):
    """解析控制台自动生成的 TS 数据文件，取出其中的 JSON 数组。

    生成的文件形如：

        export const friendsData: Friend[] = [ ... ];

    类型标注里同样带方括号（Friend[]），所以必须先越过等号再找数组起点，
    否则会把类型标注当成数据。数组本体用 JSON 解析，天然兼容中文。
    """
    try:
        with open(path, "r", encoding="utf-8") as source:
            content = source.read()
    except OSError:
        return []

    marker_index = content.find(marker)
    if marker_index == -1:
        return []

    assign_index = content.find("=", marker_index)
    if assign_index == -1:
        return []

    bracket_index = content.find("[", assign_index)
    if bracket_index == -1:
        return []

    try:
        payload = _strip_trailing_commas(content[bracket_index:])
        data, _ = json.JSONDecoder().raw_decode(payload)
    except ValueError:
        return []

    return data if isinstance(data, list) else []
