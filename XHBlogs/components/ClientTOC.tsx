"use client";
import { useEffect, useState } from 'react';
import { getHeadingId } from '../lib/headingSlug';

type TocItem = {
  level: number;
  text: string;
  id?: string;
};

// 🌟 侧边栏视觉净化器
const getDisplayText = (rawText: string) => {
  if (!rawText) return '';
  return rawText
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/[*_~`#]/g, '')
    .trim();
};

export default function ClientTOC({ toc }: { toc: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const contentDiv = document.getElementById('article-content');
    if (!contentDiv) return;

    const headings = Array.from(contentDiv.querySelectorAll<HTMLElement>('h1, h2, h3'));
    if (headings.length === 0) return;

    // 标题 id 现由服务端在渲染管线生成；这里只兜底补齐历史/异常情况
    headings.forEach((heading) => {
      if (!heading.id) heading.id = getHeadingId(heading.textContent || '');
    });

    // 用 IntersectionObserver 代替每帧 getBoundingClientRect 扫全部标题
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id;
          if (!id) continue;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        if (visible.size === 0) return;
        // 取文档顺序里最靠上的可见标题
        let current = '';
        for (const heading of headings) {
          if (heading.id && visible.has(heading.id)) {
            current = heading.id;
            break;
          }
        }
        if (current) setActiveId(current);
      },
      {
        // 顶部留出导航栏偏移；下方留 40% 视口不参与，避免底部标题过早抢高亮
        rootMargin: '-120px 0px -40% 0px',
        threshold: 0,
      }
    );

    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [toc]);

  const scrollToHeading = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    // 保留自定义缓动滚动；原生锚点作为 JS 失效时的兜底
    e.preventDefault();

    const targetElement = document.getElementById(id);
    if (!targetElement) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const offset = 100;
    const targetY = targetElement.getBoundingClientRect().top + window.scrollY - offset;

    if (reduceMotion) {
      window.scrollTo(0, targetY);
      setActiveId(id);
      return;
    }

    const startY = window.scrollY;
    const distance = targetY - startY;
    const duration = 600;
    let startTime: number | null = null;

    const easeInOutCubic = (t: number, b: number, c: number, d: number) => {
      t /= d / 2;
      if (t < 1) return c / 2 * t * t * t + b;
      t -= 2;
      return c / 2 * (t * t * t + 2) + b;
    };

    const animation = (currentTime: number) => {
      if (startTime === null) startTime = currentTime;
      const timeElapsed = currentTime - startTime;

      const nextY = easeInOutCubic(timeElapsed, startY, distance, duration);
      window.scrollTo(0, nextY);

      if (timeElapsed < duration) {
        requestAnimationFrame(animation);
      } else {
        window.scrollTo(0, targetY);
      }
    };

    requestAnimationFrame(animation);
    setActiveId(id);
  };

  if (!toc || toc.length === 0) return null;

  return (
    <div className="bg-white/60 dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl p-6 border border-white/40 dark:border-white/10 shadow-xl sticky top-28 transition-colors duration-700 max-h-[75vh] overflow-y-auto custom-scrollbar">
      <h3 className="font-black text-slate-900 dark:text-white mb-4 border-l-4 border-indigo-500 pl-2 text-sm uppercase tracking-widest">
        Table of Contents
      </h3>
      <nav className="flex flex-col gap-2 relative" aria-label="文章目录">
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-slate-200 dark:bg-slate-700/50 rounded-full"></div>

        {toc.map((item) => {
          const displayText = getDisplayText(item.text);
          // 服务端已生成 id 时优先用；否则按同一套规则现算
          const safeId = item.id || getHeadingId(item.text);
          const isActive = activeId === safeId;

          return (
            <a
              key={safeId}
              href={`#${safeId}`}
              onClick={(e) => scrollToHeading(e, safeId)}
              className={`text-left text-sm transition-all duration-300 line-clamp-2 cursor-pointer relative pl-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60
                ${item.level === 1 ? 'font-bold mt-2' : ''}
                ${item.level === 2 ? 'ml-2' : ''}
                ${item.level === 3 ? 'ml-4 text-xs' : ''}
                ${isActive ? 'text-indigo-600 dark:text-indigo-400 font-bold scale-105 origin-left' : 'text-slate-500 hover:text-indigo-500 dark:text-slate-400 dark:hover:text-indigo-400'}
              `}
            >
              {isActive && (
                <span className="absolute left-[-5px] top-[50%] -translate-y-[50%] w-[6px] h-[6px] rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]"></span>
              )}
              {displayText}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
