import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, authEnabled, verifySessionToken } from './lib/auth';

/**
 * Next.js 16 的全局请求拦截（proxy.ts，Node.js 运行时）。
 *
 * 配置了 MANAGER_ADMIN_PASSWORD_HASH 时，除登录页与静态资源外的所有请求
 * 都需要携带有效的会话 Cookie，否则一律跳转到 /login。
 */

const PUBLIC_PATHS = ['/login', '/api/auth/login'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((entry) => pathname === entry || pathname.startsWith(`${entry}/`));
}

export function proxy(request: NextRequest) {
  if (!authEnabled()) return NextResponse.next();

  const { pathname, search } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();
  if (pathname.startsWith('/_next/')) return NextResponse.next();
  if (pathname === '/favicon.ico' || pathname === '/backend_config.json') return NextResponse.next();

  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ detail: '未授权，请先登录管理后台' }, { status: 401 });
  }

  const target = new URL('/login', request.url);
  target.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(target);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
