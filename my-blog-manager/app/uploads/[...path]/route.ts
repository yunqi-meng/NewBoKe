import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 本机图片仓库的读取入口。
 *
 * 控制台上传的图片落在 <控制台根目录>/data/uploads/，
 * 站点内统一以 /uploads/<文件名> 引用；公开站由 public/uploads/ 提供同一路径，
 * 两边引用同一份地址，不需要在渲染时做任何 URL 改写。
 *
 * 目录定位：服务器与桌面版都会注入 XHS_MANAGER_ROOT，本地开发回落到进程工作目录。
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

function uploadsDir(): string {
  const root = process.env.XHS_MANAGER_ROOT || process.cwd();
  return path.join(root, 'data', 'uploads');
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const segments = (await context.params).path ?? [];
  const name = segments.join('/');

  // 只接受纯文件名，任何路径分隔符或上级目录一律拒绝
  if (!name || name !== path.basename(name) || name.startsWith('.')) {
    return new Response('非法文件名', { status: 400 });
  }

  try {
    const file = await fs.readFile(path.join(uploadsDir(), name));
    const extension = path.extname(name).toLowerCase();
    return new Response(file, {
      headers: {
        'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('图片不存在', { status: 404 });
  }
}
