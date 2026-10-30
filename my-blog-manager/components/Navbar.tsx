"use client";

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from './ToastProvider';
import { pushToGitHub } from '../lib/contentMutations';
import { CloudUpload, Loader2, LogOut } from 'lucide-react';
import { useSiteConfig } from './SiteConfigProvider';

export default function Navbar({ previewOnly = false, compact = false }: { previewOnly?: boolean; compact?: boolean }) {
  // 配置实时取自引擎，发布后无需重建控制台也能立刻生效
  const siteConfig = useSiteConfig();

  const [showNav, setShowNav] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [authOn, setAuthOn] = useState(false);

  const [pushModalOpen, setPushModalOpen] = useState(false);
  const [isPushing, setIsPushing] = useState(false);

  const pathname = usePathname();
  const { showToast } = useToast();

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY && currentScrollY > 80) setShowNav(false);
      else setShowNav(true);
      setLastScrollY(currentScrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  const navLinks = [
    { name: '首页', href: '/' },
    { name: '项目', href: '/projects' },
    { name: '归档', href: '/timeline' },
    { name: '照片墙', href: '/photowall' },
    { name: '音乐', href: '/music' },
    { name: '说说', href: '/moments' },
    { name: '杂谈', href: '/chatter' },
    { name: '📝 草稿箱', href: '/drafts' },
    { name: '💬 评论管理', href: '/comments' },
    { name: '友链', href: '/friends' },
    { name: '关于', href: '/about' },
    { name: '⚙️ 设置', href: '/settings' },
  ];

  const handleMinimize = () => {
    if (typeof window !== 'undefined' && (window as any).pywebview?.api) {
      (window as any).pywebview.api.minimize_window();
    }
  };
  const handleMaximize = () => {
    if (typeof window !== 'undefined' && (window as any).pywebview?.api) {
      (window as any).pywebview.api.maximize_window();
    }
  };
  const handleClose = () => {
    if (typeof window !== 'undefined' && (window as any).pywebview?.api) {
      (window as any).pywebview.api.close_window();
    }
  };

  // 🔐 公网访问时需要知道是否开启了密码登录，才决定要不要显示"退出登录"
  useEffect(() => {
    fetch('/api/auth/login', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setAuthOn(Boolean(data?.authEnabled)))
      .catch(() => setAuthOn(false));
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* 忽略网络错误，本地 Cookie 也会随跳转失效 */
    }
    window.location.href = '/login';
  };

  // 📤 推送流程：内容保存后已经在线上生效，这里只把当前内容导成快照，
  // 提交并推送到 GitHub 仓库（服务器仓库同步保留），留一份可追溯、可回退的版本。
  const executePush = async () => {
    setIsPushing(true);
    try {
      const result = await pushToGitHub();
      if (result.ok) {
        showToast(result.message, "success");
        setPushModalOpen(false);
      } else {
        showToast(`❌ 推送失败：${result.message}`, "error");
      }
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <>
      <header className={`w-full fixed top-0 left-0 right-0 z-[100] transition-all duration-500 border-b ${showNav ? 'translate-y-0' : '-translate-y-full'} bg-white/40 dark:bg-slate-900/50 backdrop-blur-xl border-white/20 dark:border-white/5 shadow-sm pywebview-drag-region`}>
        <div className="w-[95%] max-w-7xl mx-auto h-16 flex items-center justify-between px-4 box-border">

          <Link href="/" className="min-w-0 truncate text-xl font-black text-slate-800 dark:text-white tracking-tighter">
            {siteConfig.navTitle}
            <span className="text-indigo-500 mx-1">
              {siteConfig.navSuffix || 'の'}
            </span>
            {siteConfig.navAfter}
          </Link>

          <div className="flex items-center gap-6" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <nav className="hidden lg:flex gap-8 text-sm font-bold">
              {(compact ? navLinks.filter(link => ['/', '/settings'].includes(link.href)) : navLinks).map((link) => (
                <Link key={link.href} href={link.href} className={`relative whitespace-nowrap py-1 transition-colors ${pathname === link.href ? 'text-indigo-600' : 'text-slate-700 dark:text-slate-200'}`}>
                  {link.name}
                </Link>
              ))}
            </nav>

            <div className="relative">
              <button
                disabled={previewOnly || isPushing}
                title={previewOnly ? '预览副本未连接仓库推送' : '推送到 GitHub 仓库'}
                onClick={() => setPushModalOpen(true)}
                className="relative w-10 h-10 rounded-xl bg-white/50 dark:bg-slate-800/50 flex items-center justify-center hover:scale-105 transition-all border border-white/20 shadow-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isPushing ? <Loader2 size={18} className="animate-spin text-indigo-500" /> : <CloudUpload size={18} className="text-slate-600 dark:text-slate-300" />}
              </button>
            </div>

            <div className="flex items-center gap-2 ml-2 pl-6 border-l border-slate-300/50 dark:border-slate-600/50">
              {authOn && !previewOnly && (
                <button onClick={handleLogout} title="退出登录" className="w-8 h-8 rounded-xl bg-white/50 dark:bg-slate-800/50 flex items-center justify-center hover:scale-105 transition-all border border-white/20 shadow-sm cursor-pointer">
                  <LogOut size={14} className="text-slate-600 dark:text-slate-300" />
                </button>
              )}
              <button onClick={handleMinimize} className="w-3.5 h-3.5 rounded-full bg-yellow-400 hover:bg-yellow-500 flex items-center justify-center group transition-colors shadow-sm cursor-pointer z-[101]">
                <span className="opacity-0 group-hover:opacity-100 text-[8px] text-yellow-900 font-black">-</span>
              </button>
              <button onClick={handleMaximize} className="w-3.5 h-3.5 rounded-full bg-green-400 hover:bg-green-500 flex items-center justify-center group transition-colors shadow-sm cursor-pointer z-[101]">
                <span className="opacity-0 group-hover:opacity-100 text-[8px] text-green-900 font-black">+</span>
              </button>
              <button onClick={handleClose} className="w-3.5 h-3.5 rounded-full bg-red-400 hover:bg-red-500 flex items-center justify-center group transition-colors shadow-sm cursor-pointer z-[101]">
                <span className="opacity-0 group-hover:opacity-100 text-[8px] text-red-900 font-black">×</span>
              </button>
            </div>

          </div>
        </div>
      </header>

      <AnimatePresence>
        {pushModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !isPushing && setPushModalOpen(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-sm bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-[40px] shadow-2xl border border-white/50 p-10 text-center">
              <div className="w-16 h-16 bg-indigo-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <CloudUpload className="text-indigo-500" size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">推送到 GitHub 仓库</h3>
              <p className="text-sm text-slate-500 mb-8 leading-relaxed text-balance">
                控制台里的每一次保存都已经实时写进数据库，公开站刷新即可见。<br />
                这里会把当前内容导成一份快照，提交到服务器仓库并推送到 GitHub 仓库。
                <span className="text-xs opacity-80 text-slate-400 font-bold mt-3 block">
                  推送只同步版本记录，不会覆盖或回滚任何已保存的内容；代码改动才需要重新构建。
                </span>
              </p>
              <div className="flex gap-3">
                <button onClick={() => setPushModalOpen(false)} disabled={isPushing} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl text-xs font-black uppercase transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50">取消</button>
                <button onClick={executePush} disabled={isPushing} className="flex-1 py-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase shadow-lg shadow-indigo-500/30 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                  {isPushing && <Loader2 size={14} className="animate-spin" />}
                  {isPushing ? '推送中…' : '确认推送'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
