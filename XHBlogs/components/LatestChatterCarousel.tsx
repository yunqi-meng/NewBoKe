// components/LatestChatterCarousel.tsx
"use client";

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

export default function LatestChatterCarousel({ chatters }: { chatters: {
  slug: string;
  title: string;
  description?: string;
  cover?: string;
  formattedDate?: string;
}[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // 自动播放：document 隐藏或鼠标悬停时暂停，卸载时清理
  useEffect(() => {
    if (chatters.length <= 1) return;
    let timer: number | null = null;

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const start = () => {
      if (timer !== null) return;
      timer = window.setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % chatters.length);
      }, 6000);
    };

    const root = rootRef.current;
    const onEnter = () => stop();
    const onLeave = () => {
      if (!document.hidden) start();
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else if (!root?.matches(':hover')) start();
    };

    document.addEventListener('visibilitychange', onVisibility);
    root?.addEventListener('mouseenter', onEnter);
    root?.addEventListener('mouseleave', onLeave);
    if (!document.hidden) start();

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      root?.removeEventListener('mouseenter', onEnter);
      root?.removeEventListener('mouseleave', onLeave);
    };
  }, [chatters.length]);

  if (!chatters || chatters.length === 0) return null;

  const currentChatter = chatters[currentIndex];

  const holoVariants = {
    initial: { opacity: 0, scale: 0.95, filter: "blur(10px)" },
    animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
    exit: { opacity: 0, scale: 1.05, filter: "blur(10px)" },
  };

  return (
    // 🌟 注意这里：去掉了 md:col-span-8，变成一个纯粹填满父容器的组件
    <div ref={rootRef} className="w-full h-full rounded-3xl bg-white/40 dark:bg-slate-800/50 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-xl overflow-hidden relative group min-h-[220px] flex flex-col">
      <Link href={currentChatter.slug === 'none' ? '/chatter' : `/chatter/${currentChatter.slug}`} className="absolute inset-0 z-20 rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500/60" aria-label={`查看杂谈: ${currentChatter.title}`} />

      <AnimatePresence mode="wait">
        <motion.div
          key={currentChatter.slug}
          variants={holoVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="absolute inset-0 z-0"
        >
          <img src={currentChatter.cover} decoding="async" loading="lazy" className="w-full h-full object-cover opacity-80 dark:opacity-60 transition-transform duration-1000 group-hover:scale-105" alt={currentChatter.title || 'Chatter Cover'} />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-black/10"></div>
        </motion.div>
      </AnimatePresence>

      <div className="relative z-10 flex flex-col justify-center p-6 md:p-8 h-full pointer-events-none w-full md:w-[85%]">
        <div className="flex items-end gap-2 mb-2">
          <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest bg-black/30 backdrop-blur-sm px-2 py-1 rounded-md border border-white/10 shadow-sm">
            Records
          </span>
          {currentChatter.formattedDate && (
            <span className="text-[11px] font-mono text-slate-300 drop-shadow-md">
              {currentChatter.formattedDate}
            </span>
          )}
        </div>

        <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-indigo-300 transition-colors line-clamp-1 drop-shadow-md">
          {currentChatter.title}
        </h3>
        <p className="text-sm text-slate-300 font-medium leading-relaxed drop-shadow-md line-clamp-2">
          {currentChatter.description}
        </p>
      </div>

      {chatters.length > 1 && (
        <div className="absolute bottom-5 right-6 z-30 flex gap-2">
          {chatters.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setCurrentIndex(i); }}
              className={`h-1.5 rounded-full transition-all duration-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/80 ${i === currentIndex ? 'w-6 bg-indigo-400' : 'w-2 bg-white/40 hover:bg-white/80'}`}
              aria-label={`跳转`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
