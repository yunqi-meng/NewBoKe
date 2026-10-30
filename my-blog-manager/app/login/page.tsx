"use client";

import { FormEvent, useEffect, useState } from 'react';
import { withBasePath, stripBasePath } from '../../lib/consoleBasePath';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Lock, Loader2, AlertTriangle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add('splash-seen');
    fetch(withBasePath('/api/auth/login'), { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (!data?.authEnabled) {
          setError('当前控制台没有启用密码登录，请检查服务器上的 MANAGER_ADMIN_PASSWORD_HASH 配置。');
        }
      })
      .catch(() => setError('无法连接控制台服务。'))
      .finally(() => setChecked(true));
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(withBasePath('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.detail || '登录失败，请检查密码。');
        return;
      }
      const next = new URLSearchParams(window.location.search).get('next');
      // 中间件带过来的 next 可能已经带了 /console 前缀，
      // router.replace 又会自动补一次，所以先剥掉
      const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? stripBasePath(next) : '/';
      router.replace(safeNext);
      router.refresh();
    } catch {
      setError('网络异常，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-[32px] bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl border border-white/60 dark:border-slate-800/60 shadow-2xl p-10">
        <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-6">
          <ShieldCheck className="text-indigo-500" size={30} />
        </div>
        <h1 className="text-2xl font-black text-slate-800 dark:text-white text-center">管理控制台</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-2 mb-8 leading-relaxed">
          请输入管理密码以继续访问内容控制台
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              value={password}
              autoFocus
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="管理密码"
              className="w-full bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-2xl pl-11 pr-4 py-3.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-[11px] text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-2xl px-4 py-3 leading-relaxed">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !checked}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl text-sm font-black shadow-xl active:scale-95 transition-all disabled:opacity-60"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            {busy ? '验证中...' : '进入控制台'}
          </button>
        </form>

        <p className="text-[10px] text-slate-400 dark:text-slate-600 text-center mt-8 leading-relaxed">
          会话有效期 7 天，Cookie 为 HttpOnly，服务器端校验
        </p>
      </div>
    </div>
  );
}
