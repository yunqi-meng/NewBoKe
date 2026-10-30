"use client";

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// 定义全局可以调用的方法
interface ToastContextType {
  showToast: (text: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const TOAST_DURATIONS = {
  success: 3000,
  info: 3000,
  warning: 3000,
  error: 6000,
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toastMsg, setToastMsg] = useState<{ text: string, type: 'success' | 'warning' | 'error' | 'info' } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 卸载时清掉挂起的定时器，避免 setState on unmounted
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // 用 useCallback 固定引用：否则任何把它放进 useEffect 依赖数组的组件都会反复重取数据
  const showToast = useCallback((text: string, type: 'success' | 'warning' | 'error' | 'info' = 'success') => {
    // 先清旧定时器：否则新 toast 会被上一条的 timer 提前杀掉
    if (timerRef.current) clearTimeout(timerRef.current);
    setToastMsg({ text, type });
    const duration = TOAST_DURATIONS[type] ?? TOAST_DURATIONS.success;
    timerRef.current = setTimeout(() => {
      setToastMsg(null);
      timerRef.current = null;
    }, duration);
  }, []);

  const contextValue = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.9 }}
            className={`fixed top-20 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-xl border
              ${toastMsg.type === 'success' ? 'bg-green-500/90 border-green-400 text-white' : ''}
              ${toastMsg.type === 'warning' ? 'bg-amber-500/90 border-amber-400 text-white' : ''}
              ${toastMsg.type === 'error' ? 'bg-red-500/90 border-red-400 text-white' : ''}
              ${toastMsg.type === 'info' ? 'bg-indigo-500/90 border-indigo-400 text-white' : ''}
            `}
          >
            <span className="font-bold text-sm">{toastMsg.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {children}
    </ToastContext.Provider>
  );
}

// 导出一个万能钩子，任何组件引用它就能召唤弹窗
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast 必须在 ToastProvider 内部使用");
  return context;
};
