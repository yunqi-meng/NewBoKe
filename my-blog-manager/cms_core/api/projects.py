import os
import json
import time
from fastapi import APIRouter, Request

from ..tsdata import read_ts_array

router = APIRouter()

# 🌟 核心修复：去掉了多余的 "src"，精准定位到你的真实目录
CURRENT_API_DIR = os.path.dirname(os.path.abspath(__file__))  # cms_core/api/
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_API_DIR, "..", ".."))  # 回退两级到根目录

# 👇 就是这里！直接指向 data/projects.ts
TARGET_FILE = os.path.join(PROJECT_ROOT, "data", "projects.ts")


@router.post("/sync")
async def sync_projects(request: Request):
    try:
        payload = await request.json()
        projects_list = payload.get("projects", [])

        print(f"🚀 尝试物理写入项目矩阵: {TARGET_FILE}")

        # 序列化
        json_str = json.dumps(projects_list, ensure_ascii=False, indent=2)

        # 构造格式
        ts_content = (
            "// 🛡️ 本文件由控制台自动生成，请勿手动修改\n\n"
            "export type Project = {\n"
            "  id: string;\n"
            "  name: string;\n"
            "  description: string;\n"
            "  icon: string;\n"
            "  githubUrl: string;\n"
            "  tags: string[];\n"
            "};\n\n"
            f"export const projectsData: Project[] = {json_str};"
        )

        # 执行覆盖写入
        os.makedirs(os.path.dirname(TARGET_FILE), exist_ok=True)
        with open(TARGET_FILE, "w", encoding="utf-8") as f:
            f.write(ts_content)

        print("✅ 项目矩阵物理落盘成功！")
        return {"success": True, "message": "写入成功"}
    except Exception as e:
        print(f"❌ 写入失败: {str(e)}")
        return {"success": False, "message": str(e)}


@router.get("/list")
async def list_projects():
    """返回磁盘上当前的项目矩阵

    控制台必须实时读盘：data/projects.ts 会被 Next.js 打包进客户端 bundle，
    直接 import 拿到的是构建那一刻的快照，发布后刷新仍然显示旧项目。
    """
    try:
        projects = read_ts_array(TARGET_FILE, "export const projectsData")
        modified = os.path.getmtime(TARGET_FILE) if os.path.exists(TARGET_FILE) else 0
        return {
            "success": True,
            "projects": projects,
            "count": len(projects),
            "updatedAt": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(modified)) if modified else "",
        }
    except Exception as e:
        return {"success": False, "message": f"读取项目矩阵失败: {str(e)}"}