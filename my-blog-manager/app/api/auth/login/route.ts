import { NextRequest } from 'next/server';
import {
  SESSION_TTL_SECONDS,
  authEnabled,
  buildSessionCookie,
  createSessionToken,
  verifyPassword,
} from '../../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 登录失败限流：同一来源 10 分钟内最多尝试 10 次 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const raw = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return raw;
}

export async function POST(request: NextRequest) {
  if (!authEnabled()) {
    return Response.json({ detail: '控制台尚未启用密码登录' }, { status: 409 });
  }

  const key = clientKey(request);
  const now = Date.now();
  const record = attempts.get(key);
  if (record && record.resetAt > now && record.count >= MAX_ATTEMPTS) {
    return Response.json({ detail: '尝试次数过多，请稍后再试' }, { status: 429 });
  }

  let password = '';
  try {
    const body = await request.json();
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    password = '';
  }

  if (!verifyPassword(password, process.env.MANAGER_ADMIN_PASSWORD_HASH?.trim())) {
    const count = record && record.resetAt > now ? record.count + 1 : 1;
    const resetAt = record && record.resetAt > now ? record.resetAt : now + WINDOW_MS;
    attempts.set(key, { count, resetAt });
    return Response.json({ detail: '密码错误' }, { status: 401 });
  }

  attempts.delete(key);
  const response = Response.json({ success: true });
  response.headers.append('Set-Cookie', buildSessionCookie(createSessionToken()));
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/** 查询当前是否需要登录 */
export async function GET() {
  return Response.json({
    authEnabled: authEnabled(),
    sessionTtl: SESSION_TTL_SECONDS,
  });
}
