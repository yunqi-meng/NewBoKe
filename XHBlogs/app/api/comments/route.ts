import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 评论接口网关：把前台的评论读写转发到本机的 Python 内容引擎。
 *
 * 为什么要有这一层？
 *   - 引擎只监听 127.0.0.1，外部无法直连；
 *   - 公开站与控制台都能用同一套 /api/comments 地址，前端组件一份代码两处跑；
 *   - 这里只暴露「读列表 / 发评论」两个动作，后台审核接口不经过这里。
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

/** 把访客身份信息透传给引擎，供限流与后台溯源使用 */
function buildHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  const visitor = request.headers.get('x-visitor-token');
  if (visitor) headers.set('x-visitor-token', visitor.slice(0, 64));
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) headers.set('x-forwarded-for', forwarded.slice(0, 128));
  const agent = request.headers.get('user-agent');
  if (agent) headers.set('user-agent', agent.slice(0, 300));
  headers.set('Accept', 'application/json');
  return headers;
}

async function callEngine(
  request: NextRequest,
  endpoint: string,
  init?: { method: string; body: string },
): Promise<Response> {
  const port = await resolvePort();
  const target = `http://127.0.0.1:${port}${endpoint}`;

  const headers = buildHeaders(request);
  if (init) headers.set('Content-Type', 'application/json');

  try {
    const response = await fetch(target, {
      method: init?.method ?? 'GET',
      headers,
      body: init?.body,
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
    console.error('[comments] 转发到内容引擎失败：', error);
    const reason = error instanceof Error ? error.message : String(error);
    return Response.json(
      { success: false, message: `评论服务暂时不可用：${reason}` },
      { status: 502 },
    );
  }
}

/** GET /api/comments?target=/posts/xxx&page=1&size=20 —— 拉取某个主题的评论 */
export async function GET(request: NextRequest) {
  return callEngine(request, `/api/comments/list${request.nextUrl.search}`);
}

/** POST /api/comments —— 提交一条评论（或点赞） */
export async function POST(request: NextRequest) {
  let body = '';
  try {
    body = await request.text();
  } catch {
    return Response.json({ success: false, message: '请求体读取失败' }, { status: 400 });
  }

  // action=like 时走点赞接口，其余一律按「发表评论」处理
  let endpoint = '/api/comments/create';
  try {
    const parsed = JSON.parse(body);
    if (parsed && parsed.action === 'like') endpoint = '/api/comments/like';
  } catch {
    // 不是合法 JSON，交给引擎去报错
  }

  return callEngine(request, endpoint, { method: 'POST', body });
}
