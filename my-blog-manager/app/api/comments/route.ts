import { NextRequest } from 'next/server';
import { backendBaseUrl } from '../../../lib/backendPort';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 评论接口网关：把控制台的评论读写转发到统一后端。
 *
 * 为什么要有这一层？
 *   - 后端只监听 127.0.0.1，外部无法直连；
 *   - 公开站与控制台都能用同一套 /api/comments 地址，前端组件一份代码两处跑；
 *   - 评论存在统一后端的数据库里，两边看到的是同一份；
 *   - 这里只暴露「读列表 / 发评论」两个动作，后台审核接口不经过这里。
 */

/** 把访客身份信息透传给后端，供限流与后台溯源使用 */
function buildHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const visitor = request.headers.get('x-visitor-token');
  if (visitor) headers['x-visitor-token'] = visitor.slice(0, 64);
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) headers['x-forwarded-for'] = forwarded.slice(0, 128);
  const agent = request.headers.get('user-agent');
  if (agent) headers['user-agent'] = agent.slice(0, 300);
  return headers;
}

async function callBackend(
  request: NextRequest,
  endpoint: string,
  init?: { method: string; body: string },
): Promise<Response> {
  const base = await backendBaseUrl();
  const headers = buildHeaders(request);
  if (init) headers['Content-Type'] = 'application/json';

  try {
    const response = await fetch(`${base}${endpoint}`, {
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
    console.error('[comments] 转发到统一后端失败：', error);
    const reason = error instanceof Error ? error.message : String(error);
    return Response.json(
      { success: false, message: `评论服务暂时不可用：${reason}` },
      { status: 502 },
    );
  }
}

/** GET /api/comments?target=/posts/xxx&page=1&size=20 —— 拉取某个主题的评论 */
export async function GET(request: NextRequest) {
  return callBackend(request, `/api/comments/list${request.nextUrl.search}`);
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
    // 不是合法 JSON，交给后端去报错
  }

  return callBackend(request, endpoint, { method: 'POST', body });
}
