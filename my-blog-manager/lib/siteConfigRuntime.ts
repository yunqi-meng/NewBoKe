import { siteConfig } from '../siteConfig';
import { engineBaseUrl } from './enginePort';
import { deepMerge } from './siteConfigMerge';

export type SiteConfig = typeof siteConfig;

/**
 * 读取磁盘上最新的站点配置（服务端用）。
 *
 * siteConfig.ts 原本是编译进产物的静态模块，发布后不重建控制台就永远是旧值；
 * 现在改由内容引擎在请求时解析磁盘上的那份文件，控制台拿到的始终是最新配置。
 * 引擎不可达时退回编译期快照，保证控制台不会因为引擎故障而打不开。
 */
export async function getLiveSiteConfig(): Promise<SiteConfig> {
  try {
    const base = await engineBaseUrl();
    const response = await fetch(`${base}/api/config/get`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const payload = await response.json();
    if (payload?.success && payload.data) {
      return deepMerge(siteConfig as unknown as Record<string, any>, payload.data) as SiteConfig;
    }
  } catch {
    // 引擎暂时不可达：用编译期快照兜底
  }
  return siteConfig;
}
