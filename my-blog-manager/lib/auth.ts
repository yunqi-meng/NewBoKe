import crypto from 'node:crypto';

/**
 * 管理后台的密码登录与会话工具。
 *
 * 所有密钥都只从环境变量读取，仓库里不保存任何口令或哈希：
 *   MANAGER_ADMIN_PASSWORD_HASH  scrypt 密码哈希（见 scripts/manager-passwd.mjs 生成）
 *   MANAGER_SESSION_SECRET        会话签名密钥（任意随机字符串）
 *   MANAGER_COOKIE_SECURE         设为 1 时给 Cookie 加 Secure（接入 HTTPS 后使用）
 *
 * 没有配置 MANAGER_ADMIN_PASSWORD_HASH 时，控制台保持"免密"模式，
 * 方便本地桌面版直接使用；一旦配上哈希，proxy.ts 就会强制拦截所有页面。
 */

export const SESSION_COOKIE = 'xh_mgr_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

let fallbackSecret: string | null = null;

/** 是否启用了密码登录 */
export function authEnabled(): boolean {
  return Boolean(process.env.MANAGER_ADMIN_PASSWORD_HASH?.trim());
}

/** 生成 scrypt 密码哈希，格式：scrypt$N$r$p$salt$hash */
export function hashPassword(password: string): string {
  const N = 16384;
  const r = 8;
  const p = 1;
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** 校验密码，使用定长比较避免时序泄漏 */
export function verifyPassword(password: string, stored?: string | null): boolean {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  try {
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    if (expected.length === 0) return false;
    const actual = crypto.scryptSync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function sessionSecret(): string {
  const fromEnv = process.env.MANAGER_SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;
  // 没有配置密钥时临时生成一个，进程重启后会话自然失效，但登录功能依然可用
  if (!fallbackSecret) fallbackSecret = crypto.randomBytes(32).toString('hex');
  return fallbackSecret;
}

/** 签发会话令牌：过期时间戳 + HMAC 签名 */
export function createSessionToken(): string {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = String(expiresAt);
  const signature = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

/** 校验会话令牌 */
export function verifySessionToken(token?: string | null): boolean {
  if (!token) return false;
  const separator = token.lastIndexOf('.');
  if (separator <= 0) return false;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length) return false;
  return crypto.timingSafeEqual(given, want);
}

/** 组装会话 Cookie */
export function buildSessionCookie(token: string): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (process.env.MANAGER_COOKIE_SECURE === '1') parts.push('Secure');
  return parts.join('; ');
}

/** 清除会话 Cookie */
export function buildClearCookie(): string {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (process.env.MANAGER_COOKIE_SECURE === '1') parts.push('Secure');
  return parts.join('; ');
}
