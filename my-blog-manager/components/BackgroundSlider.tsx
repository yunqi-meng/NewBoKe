"use client";
import { useState, useEffect } from 'react';
import { useSiteConfig } from './SiteConfigProvider';

export default function BackgroundSlider() {
  // 配置实时取自引擎，发布后无需重建控制台也能立刻生效
  const siteConfig = useSiteConfig();

  const [index, setIndex] = useState(0);

  // 🌟 壁纸分组系统：优先使用「激活分组」的图片轮播；无分组数据时回退到旧版 bgImages
  const activeGroup = siteConfig.bgGroups?.find(
    (g) => g.id === siteConfig.activeBgGroup
  );
  const images = activeGroup ? activeGroup.images : siteConfig.bgImages || [];

  useEffect(() => {
    if (images.length <= 1) return;

    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, 10000); // 10秒切换一次

    return () => clearInterval(timer);
  }, [images.length]);

  // 图片列表长度变化时重置索引，防止越界
  useEffect(() => { setIndex(0); }, [images.length]);

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
            opacity: i === index ? 1 : 0,
            // 解决层级重叠导致的渲染压力
            visibility: Math.abs(i - index) <= 1 || (i === images.length - 1 && index === 0) ? 'visible' : 'hidden'
          }}
        />
      ))}
    </div>
  );
}
