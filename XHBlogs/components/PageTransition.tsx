import { ReactNode } from "react";

/**
 * 页面入场：纯 CSS 动画（page-enter），SSR 内容立即可见，
 * 不再用 framer-motion 的 initial opacity:0 等 JS 挂载。
 * prefers-reduced-motion 下由 globals.css 关闭动画。
 */
export default function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`page-enter ${className ?? ""}`}>
      {children}
    </div>
  );
}
