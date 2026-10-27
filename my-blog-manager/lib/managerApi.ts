/**
 * 管理后台访问本地 Python 内容引擎的统一入口。
 *
 * 早期版本前端直接请求 http://127.0.0.1:<api_port>，这只在"控制台和引擎跑在同一台机器"时成立。
 * 一旦控制台通过公网 IP 打开，浏览器里的 127.0.0.1 指的是访问者自己的电脑，请求必然失败。
 * 现在统一改成同源 /api/proxy，由 Next 服务端转发到服务器本机的引擎端口。
 */

export const BACKEND_BASE = '/api/proxy';

/** 把引擎接口路径拼成同源地址，例如 backendUrl('/api/drafts/list') */
export function backendUrl(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_BASE}${clean}`;
}

/** 同源请求本地内容引擎 */
export function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(backendUrl(path), init);
}
