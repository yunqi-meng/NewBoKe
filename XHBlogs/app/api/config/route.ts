import { NextResponse } from 'next/server';
import { getLivePublicSiteConfig } from '@/lib/siteConfigRuntime';

export const dynamic = 'force-dynamic';

/**
 * 对外暴露当前生效的站点配置（供客户端组件在运行时刷新）。
 *
 * 数据来自统一后端的数据库；这里只暴露展示类字段，
 * aiConfig 里是模型与煤球人设，属于服务端内部配置，不下发到浏览器。
 */
export async function GET() {
  const config = await getLivePublicSiteConfig();
  // 复制一份再摘掉内部字段，避免把 aiConfig / geminiConfig 带到浏览器。
  // （用解构剔除会留下两个「声明了但不用」的变量，lint 不干净。）
  const publicConfig = { ...(config as Record<string, any>) };
  delete publicConfig.aiConfig;
  delete publicConfig.geminiConfig;

  return NextResponse.json(
    { success: true, data: publicConfig },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } },
  );
}
