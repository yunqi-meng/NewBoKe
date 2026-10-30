import { NextRequest } from 'next/server';
import { backendBaseUrl } from '../../../lib/backendPort';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 本机图片仓库的读取入口。
 *
 * 图片本体只保存在统一后端里（server/data/uploads/），
 * 控制台上传后拿到的是 /uploads/<文件名>，这个路由把请求转给后端取回文件。
 * 两端（公开站 / 控制台）用同一个地址引用同一批图片，不需要任何 URL 改写。
 */

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const segments = (await context.params).path ?? [];
  const name = segments.join('/');

  // 只接受纯文件名，任何路径分隔符或上级目录一律拒绝
  if (!name || name !== name.split('/').pop() || name.startsWith('.')) {
    return new Response('非法文件名', { status: 400 });
  }

  try {
    const base = await backendBaseUrl();
    const response = await fetch(`${base}/api/media/file/${encodeURIComponent(name)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return new Response('图片不存在', { status: response.status });
    }

    // 流式转发，避免 arrayBuffer() 把整张大图读进内存
    const extension = name.slice(name.lastIndexOf('.')).toLowerCase();
    const headers = new Headers({
      'Content-Type': MIME_TYPES[extension] || response.headers.get('Content-Type') || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    const contentLength = response.headers.get('content-length');
    if (contentLength) headers.set('Content-Length', contentLength);

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch {
    return new Response('图片暂时读不到', { status: 502 });
  }
}
