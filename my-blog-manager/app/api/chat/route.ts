import { backendBaseUrl } from '../../../lib/backendPort';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * AI 煤球的对话网关。
 *
 * 干活的是统一后端（server/app/api/chat.py）：
 *   - 密钥只从后端的进程环境变量读，控制台这边完全碰不到口令；
 *   - 煤球的模型、人设、生成预算存在数据库的站点配置里，两个前端共用同一份；
 *   - 后端只监听本机，浏览器直连不了，所以控制台保留这一层同源转发。
 *
 * 以前这里是「控制台自己读密钥、自己读配置」，现在统一收到后端，
 * 以后换模型、改人设只要动控制台一处。
 */

export async function POST(req: Request) {
  const base = await backendBaseUrl();
  try {
    const { message } = await req.json();
    const response = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: String(message ?? '') }),
      cache: 'no-store',
      signal: AbortSignal.timeout(120000),
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
    console.error('[chat] 转发到统一后端失败：', error);
    const reason = error instanceof Error ? error.message : String(error);
    return Response.json({ error: reason }, { status: 502 });
  }
}

export async function GET() {
  const base = await backendBaseUrl();
  try {
    const response = await fetch(`${base}/api/chat`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
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
    const reason = error instanceof Error ? error.message : String(error);
    return Response.json({ error: reason }, { status: 502 });
  }
}
