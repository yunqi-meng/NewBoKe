import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 同源转发器：把 /api/proxy/<引擎路径> 转发到本机的 Python 内容引擎。
 *
 * 引擎端口按以下顺序解析：
 *   1. MANAGER_API_PORT（服务器部署时固定为 8000）
 *   2. XHS_BRIEFING_API_PORT
 *   3. public/backend_config.json 里的 api_port（本地桌面版由 launcher.py 写入）
 */

const SKIP_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'accept-encoding',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'cookie',
  'origin',
  'referer',
  'user-agent',
]);

async function resolvePort(): Promise<number> {
  const fromEnv = process.env.MANAGER_API_PORT || process.env.XHS_BRIEFING_API_PORT;
  if (fromEnv) {
    const parsed = Number(fromEnv);
    if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) return parsed;
  }
  const root = process.env.XHS_MANAGER_ROOT ?? process.cwd();
  const raw = await fs.readFile(path.join(root, 'public/backend_config.json'), 'utf8');
  const parsed = Number(JSON.parse(raw).api_port);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) throw new Error('Invalid local engine port');
  return parsed;
}

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    const segments = (await context.params).path ?? [];
    const port = await resolvePort();
    const target = `http://127.0.0.1:${port}/${segments.map((part) => encodeURIComponent(part)).join('/')}${request.nextUrl.search}`;

    const headers = new Headers();
    request.headers.forEach((value, key) => {
      if (!SKIP_HEADERS.has(key.toLowerCase())) headers.set(key, value);
    });

    const hasBody = !['GET', 'HEAD'].includes(request.method);
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(120000),
    });

    const responseHeaders = new Headers();
    const contentType = response.headers.get('content-type');
    if (contentType) responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch {
    return Response.json({ detail: '本地内容引擎没有响应，请检查控制台服务是否已经启动。' }, { status: 503 });
  }
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
