import { NextRequest } from 'next/server';
import { backendBaseUrl } from '../../../../lib/backendPort';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 登录接口网关：真正的校验交给统一后端。
 *
 * 为什么不再自己校验？
 *   - 密码哈希与会话密钥只有一份（后端的 MANAGER_ADMIN_PASSWORD_HASH / MANAGER_SESSION_SECRET）；
 *   - 限流也只有一份，不会出现「控制台能试、控制台代理却被拒」的两套规则；
 *   - 后端认的是同一个 xh_mgr_session Cookie，公开站与管理后台互通。
 *
 * 这里只负责把后端种下的 Cookie 原样带回浏览器。
 */

/** 把后端返回的 Set-Cookie 原样透传给浏览器 */
function copyCookies(backend: Response): Headers {
  const headers = new Headers();
  const cookies = backend.headers.getSetCookie?.() ?? [];
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  headers.set('Cache-Control', 'no-store');
  return headers;
}

export async function POST(request: NextRequest) {
  const base = await backendBaseUrl();

  let body = '';
  try {
    body = await request.text();
  } catch {
    body = JSON.stringify({});
  }

  try {
    const backend = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body || JSON.stringify({}),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });

    const payload = await backend.json().catch(() => ({}));
    const headers = copyCookies(backend);

    if (!backend.ok || payload?.success === false) {
      return Response.json(
        { detail: payload?.message || '登录失败，请检查密码。' },
        { status: backend.ok ? 401 : backend.status, headers },
      );
    }

    return Response.json({ success: true }, { headers });
  } catch (error) {
    console.error('[auth] 登录请求后端失败：', error);
    const reason = error instanceof Error ? error.message : String(error);
    return Response.json(
      { detail: `无法连接统一后端：${reason}` },
      { status: 502 },
    );
  }
}

/** 查询当前是否需要登录 */
export async function GET() {
  const base = await backendBaseUrl();
  try {
    const backend = await fetch(`${base}/api/auth/session`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const payload = await backend.json().catch(() => ({}));
    return Response.json(
      {
        authEnabled: Boolean(payload?.authEnabled),
        authenticated: Boolean(payload?.authenticated),
        sessionTtl: payload?.sessionTtl ?? 7 * 24 * 60 * 60,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    // 后端暂时不可达时，按「未启用登录」处理，让控制台仍能打开
    return Response.json(
      { authEnabled: false, authenticated: false, sessionTtl: 7 * 24 * 60 * 60 },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
