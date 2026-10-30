import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from './lib/auth';
import { backendBaseUrl } from './lib/backendPort';
import { withBasePath, stripBasePath } from './lib/consoleBasePath';

/**
 * Next.js 16 的全局请求拦截（proxy.ts，Node.js 运行时）。
 *
 * 登录态的判定交给统一后端：
 *   - 密码哈希与会话密钥只有一份（在后端的进程环境里）；
 *   - 控制台与后端认的是同一个 xh_mgr_session Cookie；
 *   - 不会出现「控制台以为免密、后端却要鉴权」这种两边规则不一致的情况。
 *
 * 后端说「已启用登录」且「当前未登录」时，除登录页与静态资源外一律拦下来。
 */

const PUBLIC_PATHS = ['/login', '/api/auth/login'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((entry) => pathname === entry || pathname.startsWith(`${entry}/`));
}

/** 问后端一句：这个 Cookie 现在还有效吗？ */
async function checkSession(request: NextRequest): Promise<{ authEnabled: boolean; authenticated: boolean }> {
  try {
    const base = await backendBaseUrl();
    const response = await fetch(`${base}/api/auth/session`, {
      headers: {
        Cookie: request.cookies.get(SESSION_COOKIE)?.value
          ? `${SESSION_COOKIE}=${request.cookies.get(SESSION_COOKIE)?.value}`
          : '',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const payload = await response.json();
    return {
      authEnabled: Boolean(payload?.authEnabled),
      authenticated: Boolean(payload?.authenticated),
    };
  } catch {
    // 后端不可达：保守处理，拦下来让使用者看到明确提示，而不是放行后满屏报错
    return { authEnabled: true, authenticated: false };
  }
}

export async function proxy(request: NextRequest) {
  const { search } = request.nextUrl;

  // 挂到 /console 时 pathname 带着前缀，先还原成路由路径再判断，
  // 否则登录页会被当成私有页，重定向也会少掉前缀（跳去公开站的 /login）
  const pathname = stripBasePath(request.nextUrl.pathname);

  if (isPublic(pathname)) return NextResponse.next();
  if (pathname.startsWith('/_next/')) return NextResponse.next();
  if (pathname === '/favicon.ico' || pathname === '/backend_config.json') return NextResponse.next();

  const { authEnabled, authenticated } = await checkSession(request);
  if (!authEnabled || authenticated) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ detail: '未授权，请先登录管理后台' }, { status: 401 });
  }

  // next 参数只带路由路径（不含前缀），登录页交给 router.replace 补前缀
  const target = new URL(withBasePath('/login'), request.url);
  target.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(target);
}

export const config = {
  // 两条规则缺一不可：
  //   带 basePath 时，下面这条会被编译成 /console/…（前缀后面必须有斜杠），
  //   恰好漏掉 /console 本身，控制台首页就会绕开登录校验；
  //   所以单独补一条 '/'，编译后正好匹配 /console 与 /console/。
  matcher: ['/', '/((?!_next/static|_next/image|favicon.ico).*)'],
};
