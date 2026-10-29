import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 统一后端客户端。
 *
 * 现在博客与管理后台共用同一个 FastAPI 服务、同一份数据库，
 * 前台不再自己读 markdown / TS 文件，所有内容都从这里取。
 *
 * 后端地址按以下顺序解析：
 *   1. XHS_API_BASE_URL（完整地址，最优先）
 *   2. MANAGER_API_PORT（服务器部署时固定为 8000）
 *   3. XHS_ENGINE_API_PORT（旧的 XHS_BRIEFING_API_PORT 仍认）
 *   4. public/backend_config.json 里的 api_port（本地桌面版由 launcher.py 写入）
 *   5. 默认 8000
 */

const DEFAULT_API_PORT = 8000;
const REQUEST_TIMEOUT = 15000;

export async function resolveApiPort(): Promise<number> {
  const fromEnv =
    process.env.MANAGER_API_PORT ||
    (process.env.XHS_ENGINE_API_PORT || process.env.XHS_BRIEFING_API_PORT);
  if (fromEnv) {
    const parsed = Number(fromEnv);
    if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) return parsed;
  }
  try {
    const root = process.env.XHS_MANAGER_ROOT ?? process.cwd();
    const raw = await fs.readFile(path.join(root, 'public/backend_config.json'), 'utf8');
    const parsed = Number(JSON.parse(raw).api_port);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535) return parsed;
  } catch {
    // 本地桌面版的连接文件可能不存在，继续用默认端口
  }
  return DEFAULT_API_PORT;
}

export async function resolveBackendBase(): Promise<string> {
  const explicit = process.env.XHS_API_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  return `http://127.0.0.1:${await resolveApiPort()}`;
}

/**
 * 调用统一后端并解析 JSON。
 *
 * 后端不可用时返回 fallback：站点宁可少显示一点内容，也不能整页打不开。
 */
export async function backendJson<T>(endpoint: string, fallback: T): Promise<T> {
  const base = await resolveBackendBase();
  try {
    const response = await fetch(`${base}${endpoint}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      console.error(`[backend] ${endpoint} 返回 ${response.status}`);
      return fallback;
    }
    const payload = (await response.json()) as { success?: boolean } & T;
    return payload;
  } catch (error) {
    console.error(`[backend] 请求 ${endpoint} 失败：`, error);
    return fallback;
  }
}

/** 取响应里的某个字段，取不到就用兜底值。 */
export function pick<T>(payload: unknown, key: string, fallback: T): T {
  if (payload && typeof payload === 'object') {
    const value = (payload as Record<string, unknown>)[key];
    if (value !== undefined && value !== null) return value as T;
  }
  return fallback;
}

/**
 * 转发一个请求到统一后端，原样把状态码与响应体带回来。
 *
 * 网关类接口（评论、每日一句、聊天）用它：公开站与控制台用同一个地址，
 * 后端只监听本机，浏览器直连不了，必须走这一层。
 */
export async function backendFetch(
  endpoint: string,
  init?: { method?: string; body?: string; headers?: Record<string, string> },
): Promise<Response> {
  const base = await resolveBackendBase();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init?.body) headers['Content-Type'] = 'application/json';
  Object.assign(headers, init?.headers ?? {});

  try {
    const response = await fetch(`${base}${endpoint}`, {
      method: init?.method ?? 'GET',
      headers,
      body: init?.body,
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });

    const text = await response.text();
    return new Response(text || '{}', {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error(`[backend] 转发 ${endpoint} 失败：`, error);
    const reason = error instanceof Error ? error.message : String(error);
    return Response.json(
      { success: false, message: `后端服务暂时不可用：${reason}` },
      { status: 502 },
    );
  }
}
