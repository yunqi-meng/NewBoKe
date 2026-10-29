import { backendBaseUrl } from '../../../../lib/backendPort';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 退出登录。
 *
 * 清 Cookie 的动作交给统一后端来做，它用的是同一个 Cookie 名与路径，
 * 两边清理方式不一致的话会出现「接口说退出了，页面还在登录态」的怪事。
 */
export async function POST() {
  const base = await backendBaseUrl();
  try {
    const backend = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    const headers = new Headers();
    const cookies = backend.headers.getSetCookie?.() ?? [];
    for (const cookie of cookies) headers.append('Set-Cookie', cookie);
    headers.set('Cache-Control', 'no-store');
    return Response.json({ success: true }, { headers });
  } catch (error) {
    console.error('[auth] 退出登录请求后端失败：', error);
    // 后端不可达时，本地直接清掉 Cookie，保证控制台不会卡在登录态
    const headers = new Headers();
    headers.append(
      'Set-Cookie',
      'xh_mgr_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    );
    headers.set('Cache-Control', 'no-store');
    return Response.json({ success: true }, { headers });
  }
}
