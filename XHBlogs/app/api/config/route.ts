import { NextResponse } from 'next/server';
import { getLiveSiteConfig } from '@/lib/siteConfigRuntime';

export const dynamic = 'force-dynamic';

/**
 * 对外暴露当前生效的站点配置（供客户端组件在运行时刷新）。
 *
 * 只暴露展示类字段；aiConfig 里是模型与煤球人设，属于服务端内部配置，不下发到浏览器。
 */
export async function GET() {
  const config = getLiveSiteConfig() as Record<string, any>;
  const { aiConfig, ...publicConfig } = config;

  return NextResponse.json(
    { success: true, data: publicConfig },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } },
  );
}
