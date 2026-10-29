/**
 * 管理后台的会话常量。
 *
 * 真正的登录校验、会话签发都放在统一后端（server/app/security.py），
 * 控制台只是把后端种下的 Cookie 原样带给浏览器。
 *
 * 密钥仍然只从环境变量读取，仓库里不保存任何口令或哈希：
 *   MANAGER_ADMIN_PASSWORD_HASH  scrypt 密码哈希（用 scripts/manager-passwd.mjs 生成）
 *   MANAGER_SESSION_SECRET        会话签名密钥（任意随机字符串）
 *   MANAGER_COOKIE_SECURE         设为 1 时给 Cookie 加 Secure（接入 HTTPS 后使用）
 *
 * 后端与控制台用同一个 Cookie 名、同一种令牌格式
 * （`<过期毫秒>.<HMAC-SHA256 base64url>`），两边互相认得。
 */

export const SESSION_COOKIE = 'xh_mgr_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
