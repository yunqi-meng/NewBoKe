"use client";

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSiteConfig } from './SiteConfigProvider';

export default function SplashScreen() {
  // 配置实时取自引擎，发布后无需重建控制台也能立刻生效
  const siteConfig = useSiteConfig();

  const [show, setShow] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // SSR/首帧无 sessionStorage，挂载后再决定是否播开屏
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
    const hasSeenSplash = sessionStorage.getItem('hasSeenSplash') === 'true';

    // 登录页不播开屏，直接跳过
    // （挂了 basePath 时 pathname 可能带前缀；此处用 startsWith 兼容两种部署）
    if (typeof window !== 'undefined' && window.location.pathname.includes('/login')) {
      return;
    }

    if (!hasSeenSplash) {
      setShow(true);
      const timer = setTimeout(() => {
        setShow(false);
        try { sessionStorage.setItem('hasSeenSplash', 'true'); } catch { /* 隐私模式忽略 */ }
      }, 2200);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!isMounted) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="splash-screen-container"
          exit={{ opacity: 0, scale: 1.1, filter: "blur(20px)" }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="fixed inset-0 z-[100000] flex flex-col items-center justify-center bg-white dark:bg-slate-950"
        >
          <div className="relative z-10 flex flex-col items-center">
            {/* 头像光环 */}
            <div className="relative w-24 h-24 mb-8">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                className="absolute -inset-1.5 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-60 blur-[3px]"
              />
              <div className="relative w-full h-full rounded-full p-1.5 bg-white dark:bg-slate-900 shadow-xl">
                <img src={siteConfig.avatarUrl} alt="Avatar" className="w-full h-full rounded-full object-cover" />
              </div>
            </div>

            <h1 className="text-2xl font-black text-slate-800 dark:text-white mb-2 tracking-[0.2em] uppercase">
              {siteConfig.authorName}
            </h1>
            <p className="text-[10px] font-black text-slate-400 tracking-[0.5em] mb-12">INITIALIZING SYSTEM</p>

            <div className="w-40 h-[1.5px] bg-slate-200 dark:bg-slate-800 relative">
              <motion.div
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 1.8, ease: "easeInOut" }}
                className="absolute top-0 left-0 h-full bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.8)]"
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
