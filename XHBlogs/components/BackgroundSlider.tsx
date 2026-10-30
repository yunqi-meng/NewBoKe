"use client";
import { useState, useEffect } from 'react';
import { useSiteConfig } from './SiteConfigProvider';

export default function BackgroundSlider() {
  const siteConfig = useSiteConfig();
  const [index, setIndex] = useState(0);

  // 🌟 壁纸分组系统：优先使用「激活分组」的图片轮播；无分组数据时回退到旧版 bgImages
  const activeGroup = siteConfig.bgGroups?.find(
    (g) => g.id === siteConfig.activeBgGroup
  );
  const images = activeGroup ? activeGroup.images : siteConfig.bgImages || [];

  useEffect(() => {
    if (images.length <= 1) return;

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
        setIndex((prev) => (prev + 1) % images.length);
      }, 10000);
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) start();

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [images.length]);

  // 列表长度变化时用取模兜住越界，不再在 effect 里同步 setState
  const safeIndex = images.length > 0 ? index % images.length : 0;

  return (
    <div className="absolute inset-0 z-[-10] overflow-hidden">
      {images.map((img, i) => (
        <div
          key={img}
          className="absolute inset-0 transition-opacity duration-[2000ms] ease-in-out transform-gpu"
          style={{
            backgroundImage: `url(${img})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            // 当前显示的图片 opacity 为 1，其他的为 0
            opacity: i === safeIndex ? 1 : 0,
            // 解决层级重叠导致的渲染压力
            visibility: Math.abs(i - safeIndex) <= 1 || (i === images.length - 1 && safeIndex === 0) ? 'visible' : 'hidden'
          }}
        />
      ))}
    </div>
  );
}
