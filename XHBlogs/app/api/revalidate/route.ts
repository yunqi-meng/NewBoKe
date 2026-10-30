import { revalidateTag } from 'next/cache';

/**
 * 发布后内容即时刷新：管理后台发布成功后 POST 此接口，
 * 让所有带 'content' 标签的 fetch 缓存立刻失效。
 *
 * 鉴权：请求头 X-Revalidate-Token 与服务端密钥做常量时间比较。
 */
export const dynamic = 'force-dynamic';

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // 长度不同必然不匹配；等长再做常量时间 XOR 比较
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function POST(request: Request) {
  const expected =
    process.env.XHS_REVALIDATE_SECRET || process.env.MANAGER_SESSION_SECRET || '';
  const provided = request.headers.get('X-Revalidate-Token') || '';

  if (!expected || !provided || !secretMatches(provided, expected)) {
    return Response.json({ revalidated: false, message: '未授权' }, { status: 401 });
  }

  // Next 16：第二个参数为 stale 窗口；'max' 允许后台静默刷新
  revalidateTag('content', 'max');
  return Response.json({ revalidated: true });
}
