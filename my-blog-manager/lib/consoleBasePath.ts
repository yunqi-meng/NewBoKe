/**
 * 控制台的挂载前缀。
 *
 * 控制台有两种部署形态：
 *   1. 独立入口（本地 SSH 隧道、桌面预览）——挂在站点根路径，前缀为空，这是默认值；
 *   2. 与公开站同域——挂在 https://<域名>/console，构建时设置
 *      NEXT_PUBLIC_CONSOLE_BASE_PATH=/console，next.config.ts 会把它写进 basePath。
 *
 * 为什么还需要这个 helper：Next.js 只会自动给 <Link>、路由跳转和
 * /_next/static 资源补前缀，代码里手写的 fetch('/api/…')、<audio src="/api/…">、
 * window.location 都不会变。少了前缀，请求会打到同域的公开站那边（或直接 404），
 * 表现成「页面能开、按钮全都不好使」。
 *
 * 构建期常量：NEXT_PUBLIC_ 变量由 Next.js 在打包时内联，运行时改环境变量不生效，
 * 换挂载路径必须重新构建。
 */

const RAW_BASE_PATH = process.env.NEXT_PUBLIC_CONSOLE_BASE_PATH || '';

/** 规范化后的前缀，形如 '' 或 '/console'（末尾不带斜杠） */
export const CONSOLE_BASE_PATH = RAW_BASE_PATH.replace(/\/+$/, '');

/**
 * 给站内绝对路径补上前缀。
 *
 * 只接受以 / 开头的站内路径；外链（http://…、//cdn…）原样返回，
 * 已经带前缀的也原样返回，所以重复调用是安全的。
 */
export function withBasePath(path: string): string {
  if (!CONSOLE_BASE_PATH) return path;
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  if (path === CONSOLE_BASE_PATH || path.startsWith(`${CONSOLE_BASE_PATH}/`)) return path;
  return `${CONSOLE_BASE_PATH}${path}`;
}

/**
 * 去掉前缀，还原成 Next.js 路由认识的形式。
 *
 * usePathname()、window.location.pathname、request.nextUrl.pathname
 * 在挂了前缀的部署里都可能是带前缀的，直接拿去比较或 router.push 会出错
 * （router.push 还会自动再加一次前缀）。
 */
export function stripBasePath(pathname: string): string {
  if (!CONSOLE_BASE_PATH) return pathname;
  if (pathname === CONSOLE_BASE_PATH) return '/';
  if (pathname.startsWith(`${CONSOLE_BASE_PATH}/`)) {
    return pathname.slice(CONSOLE_BASE_PATH.length);
  }
  return pathname;
}
