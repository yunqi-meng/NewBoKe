// app/api/chat/route.ts
import { backendFetch } from '@/lib/backend';

/**
 * AI 煤球的对话网关。
 *
 * 真正干活的活儿在统一后端（server/app/api/chat.py）：
 *   - 密钥只从后端的进程环境变量读，公开站这边完全碰不到口令；
 *   - 煤球的模型、人设、生成预算存在数据库的站点配置里，两个前端共用同一份；
 *   - 后端只监听本机，浏览器直连不了，所以公开站保留这一层同源转发。
 *
 * 原来的实现是「公开站自己读密钥、自己读配置」，现在统一收到后端，
 * 以后换模型、改人设只要动控制台一处。
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { message } = await req.json();
    return backendFetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: String(message ?? '') }),
    });
  } catch (error) {
    console.error('[chat] 请求体解析失败：', error);
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function GET() {
  return backendFetch('/api/chat');
}
