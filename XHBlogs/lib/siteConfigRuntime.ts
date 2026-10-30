import { cache } from 'react';

import { siteConfig as staticSiteConfig } from '../siteConfig';
import { deepMerge } from './siteConfigMerge';
import { getPublicSiteConfig } from './contentApi';

export type SiteConfig = typeof staticSiteConfig;

/**
 * 读取最新的站点配置（服务端用）。
 *
 * 配置的唯一真相在统一后端的数据库里，前台每次请求都去取一份，
 * 所以控制台改完配置，公开站刷新一下就生效，不需要重新构建站点。
 *
 * 两点约定：
 *   1. 用 React cache() 包一层。同一次渲染里 generateMetadata、根布局、
 *      页面组件都会读配置，没有去重的话一页要向后端要四次同样的数据。
 *   2. 只下发公开字段。aiConfig 里是模型、接口地址与煤球的性格 Prompt，
 *      属于服务端内部配置，不该跟着 HTML 送到浏览器。
 *
 * siteConfig.ts 仍然留着一份编译期快照，当作兜底：
 * 后端暂时不可用时，站点照常显示，不会整页空白。
 */
export const getLiveSiteConfig = cache(async (): Promise<SiteConfig> => {
  const base = { ...(staticSiteConfig as unknown as Record<string, any>) };
  // 静态兜底里也带着 aiConfig，这里一并摘掉
  delete base.aiConfig;
  delete base.geminiConfig;

  try {
    const live = await getPublicSiteConfig();
    if (!live || Object.keys(live).length === 0) return base as SiteConfig;

    const { aiConfig, geminiConfig, ...publicLive } = live;

    return deepMerge(base, publicLive as Record<string, any>) as SiteConfig;
  } catch {
    return base as SiteConfig;
  }
});

/** 兼容旧名字：公开站现在只认这一份「可以下发给浏览器」的配置。 */
export const getLivePublicSiteConfig = getLiveSiteConfig;
