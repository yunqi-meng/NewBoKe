"use client";

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSiteConfig } from './SiteConfigProvider';

/** 开屏动画总时长（展示 + 淡出 ≈ 1s） */
const SHOW_MS = 650;
const EXIT_SECONDS = 0.35;

export default function SplashScreen() {
  const siteConfig = useSiteConfig();
  const [show, setShow] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    if (sessionStorage.getItem('hasSeenSplash') === 'true') return;

    setShow(true);
    const timer = setTimeout(() => {
      setShow(false);
      sessionStorage.setItem('hasSeenSplash', 'true');
    }, SHOW_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!isMounted) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="splash-screen-container"
          // 仅淡出 + 轻微放大，去掉 blur 滤镜（退出时的全屏模糊很贵）
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: EXIT_SECONDS, ease: "easeInOut" }}
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

            <div className="w-40 h-[1.5px] bg-slate-200 dark:bg-slate-800 relative overflow-hidden">
              <motion.div
                // transform + scaleX 代替 width 动画：走合成层，不触发布局重排
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
                style={{ originX: 0 }}
                className="absolute inset-0 h-full w-full bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.8)]"
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
