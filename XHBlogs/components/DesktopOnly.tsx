"use client";

import { useEffect, useState, type ReactNode } from 'react';

/**
 * 仅在桌面端（≥768px）才挂载子组件。
 *
 * 手机端直接不渲染这些高负载特效（粒子、弹幕、点击波纹等），
 * 比只用 CSS hidden 更省：组件根本不会挂载、不会跑 rAF / 定时器。
 * 监听 matchMedia 变化，窗口跨断点时动态挂载/卸载。
 */
export default function DesktopOnly({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setEnabled(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  if (!enabled) return null;
  return <>{children}</>;
}
