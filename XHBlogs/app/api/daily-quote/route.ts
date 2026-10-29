import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 每日一句网关：把首页要显示的那句励志语转发到本机的 Python 内容引擎。
 *
 * 为什么要有这一层？
 *   - 引擎只监听 127.0.0.1，外部无法直连；
 *   - 公开站与控制台读的是同一份数据，两边不会各说各话；
 *   - 这里只暴露「读今天这一句」一个动作，生成与设置都走控制台。
 *
 * 引擎端口按以下顺序解析：
 *   1. MANAGER_API_PORT（服务器部署时固定为 8000）
 *   2. XHS_ENGINE_API_PORT（旧的 XHS_BRIEFING_API_PORT 仍认）
 *   3. public/backend_config.json 里的 api_port（本地桌面版由 launcher.py 写入）
 *   4. 默认 8000
 */

const DEFAULT_ENGINE_PORT = 8000;

async function resolvePort(): Promise<number> {
  const fromEnv = process.env.MANAGER_API_PORT || (process.env.XHS_ENGINE_API_PORT || process.env.XHS_BRIEFING_API_PORT);
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
  return DEFAULT_ENGINE_PORT;
}

/** GET /api/daily-quote —— 取今天这句励志语 */
export async function GET(request: NextRequest) {
  const port = await resolvePort();
  const target = `http://127.0.0.1:${port}/api/daily-quote/`;

  try {
    const response = await fetch(target, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });

    const text = await response.text();
    return new Response(text || '{}', {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[daily-quote] 转发到内容引擎失败：', error);
    const reason = error instanceof Error ? error.message : String(error);
    return Response.json(
      { success: false, enabled: false, quote: '', message: `每日一句服务暂时不可用：${reason}` },
      { status: 502 },
    );
  }
}
