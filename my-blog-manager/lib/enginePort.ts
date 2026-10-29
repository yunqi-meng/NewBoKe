import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 解析本机内容引擎（Python/FastAPI）监听的端口。
 *
 * 端口按以下顺序解析：
 *   1. MANAGER_API_PORT（服务器部署时固定为 8000）
 *   2. XHS_ENGINE_API_PORT（旧的 XHS_BRIEFING_API_PORT 仍认）
 *   3. public/backend_config.json 里的 api_port（本地桌面版由 launcher.py 写入）
 */
export async function resolveEnginePort(): Promise<number> {
  const fromEnv = process.env.MANAGER_API_PORT || (process.env.XHS_ENGINE_API_PORT || process.env.XHS_BRIEFING_API_PORT);
  if (fromEnv) {
    const parsed = Number(fromEnv);
    if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) return parsed;
  }
  const root = process.env.XHS_MANAGER_ROOT ?? process.cwd();
  const raw = await fs.readFile(path.join(root, 'public/backend_config.json'), 'utf8');
  const parsed = Number(JSON.parse(raw).api_port);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) throw new Error('Invalid local engine port');
  return parsed;
}

/** 引擎基地址，例如 http://127.0.0.1:8000 */
export async function engineBaseUrl(): Promise<string> {
  return `http://127.0.0.1:${await resolveEnginePort()}`;
}
