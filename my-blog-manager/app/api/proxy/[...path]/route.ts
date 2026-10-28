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
  // 客户端可能带 Expect: 100-continue（curl 对 >1KB 的请求体就会带），
  // 引擎用的是 h11/uvicorn，不走 100-continue 握手，带过去反而会挂住。
  'expect',
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

/**
 * 读取请求体。
 *
 * 优先整块读成字节（引擎的 multipart 解析依赖确定的 Content-Length），
 * 读不到时退回到流式转发，避免整个转发直接失败。
 */
async function readRequestBody(request: NextRequest): Promise<{
  buffer?: ArrayBuffer;
  stream?: ReadableStream<Uint8Array>;
}> {
  try {
    return { buffer: await request.arrayBuffer() };
  } catch (error) {
    console.error('[proxy] 读取请求体失败，改为流式转发：', error);
    return { stream: request.body ?? undefined };
  }
}

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const segments = (await context.params).path ?? [];
  const port = await resolvePort();
  const target = `http://127.0.0.1:${port}/${segments.map((part) => encodeURIComponent(part)).join('/')}${request.nextUrl.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!SKIP_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  const hasBody = !['GET', 'HEAD'].includes(request.method);

  try {
    let body: Buffer | ReadableStream<Uint8Array> | undefined;
    let duplex: 'half' | undefined;

    if (hasBody) {
      const read = await readRequestBody(request);
      if (read.buffer !== undefined) {
        body = Buffer.from(read.buffer);
      } else if (read.stream) {
        body = read.stream;
        duplex = 'half';
      }
    }

    const response = await fetch(target, {
      method: request.method,
      headers,
      body: body as BodyInit | undefined,
      duplex: duplex as 'half' | undefined,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(120000),
    } as RequestInit & { duplex?: 'half' });

    const responseHeaders = new Headers();
    const contentType = response.headers.get('content-type');
    if (contentType) responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch (error) {
    // 别再把真实原因吞掉：之前这里只有一句固定文案，出问题时完全查不到线索。
    console.error(`[proxy] 转发失败 ${request.method} ${target}`, error);
    const reason = error instanceof Error ? error.message : String(error);
    return Response.json(
      { detail: `本地内容引擎转发失败：${reason}` },
      { status: 502 },
    );
  }
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
