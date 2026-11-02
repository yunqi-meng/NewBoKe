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
  // 客户端可能带 Expect: 100-continue（curl 对 >1KB 的请求体就会带），
  // 后端用的是 h11/uvicorn，不走 100-continue 握手，带过去反而会挂住。
  'expect',
]);

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const segments = (await context.params).path ?? [];
  if (segments.some((part) => part === '.' || part === '..' || /[\\/\x00]/.test(part))) {
    return Response.json({ detail: '非法代理路径' }, { status: 400 });
  }
  const base = await backendBaseUrl();
  const target = `${base}/${segments.map((part) => encodeURIComponent(part)).join('/')}${request.nextUrl.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!SKIP_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  const hasBody = !['GET', 'HEAD'].includes(request.method);

  try {
    // multipart 可按 chunked 解析；流式转发避免每个音乐上传占用整文件内存。
    const body = hasBody ? request.body ?? undefined : undefined;

    const response = await fetch(target, {
      method: request.method,
      headers,
      body: body as BodyInit | undefined,
      ...(body ? { duplex: 'half' as const } : {}),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(120000),
    } as RequestInit & { duplex?: 'half' });

    const responseHeaders = new Headers();
    for (const key of ['content-type', 'content-range', 'accept-ranges', 'content-disposition',
      'content-security-policy', 'x-content-type-options', 'etag', 'last-modified']) {
      const value = response.headers.get(key);
      if (value) responseHeaders.set(key, value);
    }
    for (const cookie of response.headers.getSetCookie()) responseHeaders.append('Set-Cookie', cookie);
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
