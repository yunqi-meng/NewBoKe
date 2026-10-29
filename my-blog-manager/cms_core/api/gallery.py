import os
import json
import time
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..tsdata import read_ts_array

router = APIRouter()

# 🌟 核心修复：动态获取项目根目录
# __file__ 是当前文件的绝对路径
# os.path.dirname(__file__) 是 cms_core/api/
# 再向上两级就是项目根目录 my-blog-manager/
CURRENT_API_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_API_DIR, "..", ".."))

# 🌟 根据你提供的位置，目标文件在项目根目录下的 data/albums.ts
ALBUMS_TS_PATH = os.path.join(PROJECT_ROOT, "data", "albums.ts")


@router.post("/sync")
async def sync_gallery(request: Request):
    """
    接收前端传来的全量相册数组，并将其物理重写回 data/albums.ts
    """
    try:
        payload = await request.json()
        albums_data = payload.get("albums", [])

        if not isinstance(albums_data, list):
            return {"success": False, "message": "数据格式非法，预期为数组"}

        # 1. 序列化数据（确保中文不乱码，缩进漂亮）
        json_str = json.dumps(albums_data, ensure_ascii=False, indent=2)

        # 2. 构造标准的 TypeScript 导出模板
        # 🛡️ 这种方式不依赖于绝对路径，只要相对位置不变，哪里都能跑
        ts_content = (
            "// 🛡️ 本文件由 XingHuiSama 控制台自动生成，请勿手动修改\n"
            "export interface Photo { url: string; caption?: string; }\n"
            "export interface Album { id: string; title: string; description: string; cover: string; date: string; photos: Photo[]; }\n\n"
            f"export const albums: Album[] = {json_str};"
        )

        # 3. 确保目录存在并执行覆盖写入
        os.makedirs(os.path.dirname(ALBUMS_TS_PATH), exist_ok=True)
        with open(ALBUMS_TS_PATH, "w", encoding="utf-8") as f:
            f.write(ts_content)

        return {
            "success": True,
            "message": f"📸 画廊物理文件已更新！已同步 {len(albums_data)} 个相册。",
            "albums": albums_data,
            "count": len(albums_data),
        }
    except Exception as e:
        # 这里把具体的报错抛给前端方便排查
        return {"success": False, "message": f"同步失败: {str(e)}"}


@router.get("/debug_path")
async def debug_path():
    """用于检查当前后端锁定的物理路径"""
    return {
        "project_root": PROJECT_ROOT,
        "target_file": ALBUMS_TS_PATH,
        "exists": os.path.exists(ALBUMS_TS_PATH)
    }


def read_albums_from_disk():
    """解析 data/albums.ts 里的相册数组

    控制台的相册列表必须实时读盘：data/albums.ts 是被 Next.js 打包进
    客户端 bundle 的静态导入，如果在控制台里直接 import 这个文件，
    页面拿到的永远是构建那一刻的快照，删掉的照片刷新后就会复活。
    """
    return read_ts_array(ALBUMS_TS_PATH, "export const albums")


@router.get("/list")
async def list_gallery():
    """返回磁盘上当前的相册数据（控制台照片墙实时读取用）"""
    try:
        albums = read_albums_from_disk()
        modified = os.path.getmtime(ALBUMS_TS_PATH) if os.path.exists(ALBUMS_TS_PATH) else 0
        return JSONResponse({
            "success": True,
            "albums": albums,
            "count": len(albums),
            "updatedAt": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(modified)) if modified else "",
        })
    except Exception as e:
        return {"success": False, "message": "读取相册失败: {0}".format(e)}
