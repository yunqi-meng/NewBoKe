import type { Metadata } from 'next';
import { getLiveSiteConfig } from './siteConfigRuntime';

/**
 * 生成随站点配置实时变化的页面标题。
 *
 * 原来每个页面都是 `export const metadata = { title: "xx | " + siteConfig.title }`，
 * 那是构建期常量：改了站点标题必须重新构建站点才会变。
 * 现在改成 generateMetadata，在请求时从统一后端读最新配置，标题立刻生效。
 */
export async function liveMetadata(title?: string, description?: string): Promise<Metadata> {
  const siteConfig = await getLiveSiteConfig();

  return {
    title: title ? `${title} | ${siteConfig.title}` : siteConfig.title,
    ...(description ? { description } : {}),
  };
}
