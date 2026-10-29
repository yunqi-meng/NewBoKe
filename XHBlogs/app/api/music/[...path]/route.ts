import { NextRequest } from 'next/server';
import { resolveBackendBase } from '@/lib/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 公开站的本地音乐转发口。
 *
 * 音频本体与歌词只存在统一后端里（server/data/music/），
 * 后台上传后写进 music_tracks 表，这里把浏览器请求转给后端取回文件。
 *
 * ⚠️ 这里只放行 /api/music 下的四个只读子路径（清单 / 音频 / 封面 / 歌词），
 *    公开站不提供通用转发器，避免把后端其它接口一并暴露到公网。
 */

const ALLOWED_ROOTS = ['local', 'file', 'cover', 'lyrics'];

const SKIP_REQUEST_HEADERS = new Set([
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
]);

// 响应里需要原样带回去的头（音频要支持 Range 拖动）
const PASSTHROUGH_RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'etag',
  'last-modified',
];

function notFound(): Response {
  return new Response('Not Found', { status: 404 });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const segments = (await context.params).path ?? [];
  if (!segments.length) return notFound();

  const root = segments[0];
  if (!ALLOWED_ROOTS.includes(root)) return notFound();

  // 形状校验：清单是单段，封面与歌词各带一个 ID，音频可带多段文件名
  if (root === 'local' && segments.length !== 1) return notFound();
  if ((root === 'cover' || root === 'lyrics') && segments.length !== 2) return notFound();

  const base = await resolveBackendBase();
  const target = `${base}/api/music/${segments.map((part) => encodeURIComponent(part)).join('/')}${request.nextUrl.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!SKIP_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  try {
    const response = await fetch(target, {
      method: 'GET',
      headers,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(60000),
    });

    const responseHeaders = new Headers();
    for (const key of PASSTHROUGH_RESPONSE_HEADERS) {
      const value = response.headers.get(key);
      if (value) responseHeaders.set(key, value);
    }
    if (!responseHeaders.has('cache-control')) {
      responseHeaders.set('Cache-Control', 'no-store');
    }

    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch (error) {
    console.error(`[music] 转发失败 ${target}`, error);
    const reason = error instanceof Error ? error.message : String(error);
    return Response.json(
      { success: false, message: `统一后端转发失败：${reason}` },
      { status: 502 },
    );
  }
}
