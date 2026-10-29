"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { siteConfig as staticSiteConfig } from '../siteConfig';
import { deepMerge } from '../lib/siteConfigMerge';

export type SiteConfig = typeof staticSiteConfig;

const SiteConfigContext = createContext<SiteConfig>(staticSiteConfig);

/**
 * 全站配置的运行时来源。
 *
 * 服务端渲染时用的是磁盘上的最新配置（见 lib/siteConfigRuntime.ts），
 * 这里在客户端再兜一层：进入页面或窗口重新获得焦点时向引擎拉一次，
 * 这样别的标签页刚发布完，回到控制台就能看到新头像/昵称/背景，
 * 不需要重启控制台，也不需要整页刷新。
 */
export function SiteConfigProvider({ initialConfig, children }: { initialConfig: SiteConfig; children: ReactNode }) {
  const [config, setConfig] = useState<SiteConfig>(initialConfig);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/proxy/api/config/get', { cache: 'no-store' });
      const payload = await response.json();
      if (payload?.success && payload.data) {
        setConfig(prev => deepMerge(prev as Record<string, any>, payload.data) as SiteConfig);
      }
    } catch {
      // 引擎暂时不可达：保留当前配置，不打断界面
    }
  }, []);

  useEffect(() => {
    refresh();
    const handleFocus = () => { refresh(); };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refresh]);

  return <SiteConfigContext.Provider value={config}>{children}</SiteConfigContext.Provider>;
}

/** 任何组件里都能拿到当前生效的配置 */
export function useSiteConfig(): SiteConfig {
  return useContext(SiteConfigContext);
}
