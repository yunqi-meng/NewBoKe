import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 统一后端（server/ 的 FastAPI 服务）的地址解析。
 *
 * 控制台与公开站现在是同一个后端、同一个数据库的两个前端，
 * 这里的端口解析规则和公开站那边（XHBlogs/lib/backend.ts）保持一致。
 *
 * 端口按以下顺序解析：
 *   1. XHS_API_BASE_URL（完整地址，最优先）
 *   2. MANAGER_API_PORT（服务器部署时固定为 8000）
 *   3. XHS_ENGINE_API_PORT（旧的 XHS_BRIEFING_API_PORT 仍认）
 *   4. public/backend_config.json 里的 api_port（本地桌面版由 launcher.py 写入）
 *   5. 默认 8000
 */

const DEFAULT_API_PORT = 8000;

export async function resolveBackendPort(): Promise<number> {
  const fromEnv =
    process.env.MANAGER_API_PORT ||
    (process.env.XHS_ENGINE_API_PORT || process.env.XHS_BRIEFING_API_PORT);
  if (fromEnv) {
    const parsed = Number(fromEnv);
    if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) return parsed;
  }
  try {
    const root = process.env.XHS_MANAGER_ROOT ?? process.cwd();
    const raw = await fs.readFile(path.join(root, 'public/backend_config.json'), 'utf8');
    const parsed = Number(JSON.parse(raw).api_port);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535) return parsed;
  } catch {
    // 本地桌面版的连接文件可能不存在，继续用默认端口
  }
  return DEFAULT_API_PORT;
}

/** 后端基地址，例如 http://127.0.0.1:8000 */
export async function backendBaseUrl(): Promise<string> {
  const explicit = process.env.XHS_API_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  return `http://127.0.0.1:${await resolveBackendPort()}`;
}
