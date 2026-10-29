import { NextRequest } from 'next/server';
import { backendBaseUrl } from '../../../../lib/backendPort';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 同源转发器：把 /api/proxy/<后端路径> 转发到本机的统一后端（server/ 里的 FastAPI 服务）。
 *
 * 后端端口的解析规则集中在 lib/backendPort.ts，
 * 服务端读实时配置（lib/siteConfigRuntime.ts）走的是同一套规则。
 *
 * ⚠️ Cookie 必须原样转发：后端的写操作要过管理员鉴权，
 * 它认的就是控制台登录时种下的 xh_mgr_session。丢了 Cookie，
 * 后端会一律回 401，控制台看起来就像「保存失败」。
 */

const SKIP_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'accept-encoding',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'origin',
  'referer',
  'user-agent',
  // 客户端可能带 Expect: 100-continue（curl 对 >1KB 的请求体就会带），
  // 后端用的是 h11/uvicorn，不走 100-continue 握手，带过去反而会挂住。
  'expect',
]);

/**
 * 读取请求体。
 *
 * 优先整块读成字节（后端的 multipart 解析依赖确定的 Content-Length），
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
  const base = await backendBaseUrl();
  const target = `${base}/${segments.map((part) => encodeURIComponent(part)).join('/')}${request.nextUrl.search}`;

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
      { detail: `统一后端转发失败：${reason}` },
      { status: 502 },
    );
  }
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
