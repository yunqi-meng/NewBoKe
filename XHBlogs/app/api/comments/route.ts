import { NextRequest } from 'next/server';
import { backendFetch } from '@/lib/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 评论接口网关：把前台的评论读写转发到统一后端。
 *
 * 为什么要有这一层？
 *   - 后端只监听 127.0.0.1，外部无法直连；
 *   - 公开站与控制台都能用同一套 /api/comments 地址，前端组件一份代码两处跑；
 *   - 这里只暴露「读列表 / 发评论」两个动作，后台审核接口不经过这里。
 *
 * 评论现在存在统一后端的数据库里，公开站与控制台看到的是同一份。
 */

/** 把访客身份信息透传给后端，供限流与后台溯源使用 */
function buildHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  const visitor = request.headers.get('x-visitor-token');
  if (visitor) headers['x-visitor-token'] = visitor.slice(0, 64);
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) headers['x-forwarded-for'] = forwarded.slice(0, 128);
  const agent = request.headers.get('user-agent');
  if (agent) headers['user-agent'] = agent.slice(0, 300);
  return headers;
}

/** GET /api/comments?target=/posts/xxx&page=1&size=20 —— 拉取某个主题的评论 */
export async function GET(request: NextRequest) {
  return backendFetch(`/api/comments/list${request.nextUrl.search}`, {
    headers: buildHeaders(request),
  });
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

  return backendFetch(endpoint, {
    method: 'POST',
    body,
    headers: buildHeaders(request),
  });
}
