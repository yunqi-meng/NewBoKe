import { siteConfig as staticSiteConfig } from '../siteConfig';
import { deepMerge } from './siteConfigMerge';
import { getFullSiteConfig, getPublicSiteConfig } from './contentApi';

export type SiteConfig = typeof staticSiteConfig;

/**
 * 读取最新的站点配置（服务端用）。
 *
 * 配置的唯一真相现在在统一后端的数据库里，前台每次请求都去取一份，
 * 所以控制台改完配置，公开站刷新一下就生效，不需要重新构建站点。
 *
 * siteConfig.ts 仍然留着一份编译期快照，当作兜底：
 * 后端暂时不可用时，站点照常显示，不会整页空白。
 */
export async function getLiveSiteConfig(): Promise<SiteConfig> {
  try {
    const live = await getFullSiteConfig();
    if (!live || Object.keys(live).length === 0) return staticSiteConfig;

    return deepMerge(
      staticSiteConfig as unknown as Record<string, any>,
      live,
    ) as SiteConfig;
  } catch {
    return staticSiteConfig;
  }
}

/**
 * 下发给浏览器的公开配置。
 *
 * 与 getLiveSiteConfig 的区别：这一份不含 aiConfig，
 * 煤球的模型与提示词属于服务端内部配置，不该出现在浏览器里。
 */
export async function getLivePublicSiteConfig(): Promise<SiteConfig> {
  try {
    const live = await getPublicSiteConfig();
    const base = { ...(staticSiteConfig as unknown as Record<string, any>) };
    // 静态兜底里也带着 aiConfig，这里一并摘掉
    delete base.aiConfig;
    delete base.geminiConfig;

    if (!live || Object.keys(live).length === 0) return base as SiteConfig;

    const { aiConfig, geminiConfig, ...publicLive } = live;

    return deepMerge(base, publicLive as Record<string, any>) as SiteConfig;
  } catch {
    return staticSiteConfig;
  }
}
