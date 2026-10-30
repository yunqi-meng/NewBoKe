"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ReactNode } from "react";

export default function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  const prefersReducedMotion = useReducedMotion();

  // 尊重系统「减少动态效果」偏好：直接无动画呈现
  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      // 刚加载页面时：往下偏 20px，完全透明
      initial={{ y: 20, opacity: 0 }}
      // 加载完毕后：回到原位，完全不透明
      animate={{ y: 0, opacity: 1 }}
      // 轻快出场，不再拖 0.8s
      transition={{ ease: "easeOut", duration: 0.25 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
