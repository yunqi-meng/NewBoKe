import { cache } from 'react';
import { siteConfig } from '../siteConfig';
import { backendBaseUrl } from './backendPort';
import { deepMerge } from './siteConfigMerge';

export type SiteConfig = typeof siteConfig;

/**
 * 读取最新的站点配置（服务端用）。
 *
 * 配置的唯一真相在统一后端的数据库里，控制台每次请求都去取一份，
 * 所以改完配置立刻生效，不必重新构建控制台。
 *
 * siteConfig.ts 仍然留着一份编译期快照当作兜底：
 * 后端暂时不可用时，控制台照常显示，不会整页空白。
 *
 * 外面套了一层 React.cache()：同一轮渲染里 generateMetadata、layout、
 * page 都会读配置，以前各发一次请求（一次页面渲染能打出四五份
 * /api/config/get），现在只打一次，结果在本次请求内复用。
 */
export const getLiveSiteConfig = cache(async (): Promise<SiteConfig> => {
  try {
    const base = await backendBaseUrl();
    const response = await fetch(`${base}/api/config/get`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const payload = await response.json();
    if (payload?.success && payload.data) {
      return deepMerge(siteConfig as unknown as Record<string, any>, payload.data) as SiteConfig;
    }
  } catch {
    // 后端暂时不可达：用编译期快照兜底
  }
  return siteConfig;
});
