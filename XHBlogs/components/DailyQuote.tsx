'use client';

import { useEffect, useState } from 'react';
import { Quote, Sparkles } from 'lucide-react';

/**
 * 每日一句：每天由当前接入的 AI（默认是煤球）说一句话。
 *
 * 数据全部来自内容引擎，控制台里可以改标题、时间和提示词，也可以手写替换。
 * 这一层只负责显示：拿不到就安静地不渲染，绝不拖慢首页。
 */

type DailyQuotePayload = {
  success?: boolean;
  enabled?: boolean;
  title?: string;
  subtitle?: string;
  showDate?: boolean;
  showSource?: boolean;
  sourceLabel?: string;
  date?: string;
  quote?: string;
  source?: string;
  hasQuote?: boolean;
};

export default function DailyQuote() {
  const [data, setData] = useState<DailyQuotePayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch('/api/daily-quote', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled && body && typeof body === 'object') setData(body as DailyQuotePayload);
      } catch {
        // 引擎没连上就不显示这一栏，首页照常。
      }
    }

    void load();
    return () => { cancelled = true; controller.abort(); };
  }, []);

  if (!data || data.enabled === false) return null;

  const quote = (data.quote || '').trim();
  if (!quote) return null;

  const title = data.title || '每日一句';
  const subtitle = data.subtitle || '';
  const manual = data.source === 'manual';

  return (
    <section aria-label={title + (subtitle ? '，' + subtitle : '')} className="relative w-full overflow-hidden rounded-3xl border border-white/40 bg-white/40 shadow-xl backdrop-blur-md transition-colors duration-700 dark:border-white/10 dark:bg-slate-800/50">
      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-indigo-100/50 via-sky-100/30 to-transparent dark:from-indigo-950/40 dark:via-slate-900/20 dark:to-transparent" />
      <span aria-hidden="true" className="absolute -left-6 -top-10 h-32 w-32 rounded-full bg-indigo-300/25 blur-2xl dark:bg-indigo-500/15" />

      <div className="relative flex flex-col gap-4 px-6 py-6 sm:px-8 sm:py-7 md:flex-row md:items-center md:gap-7">
        <div className="flex shrink-0 items-center gap-3 md:flex-col md:items-start md:gap-1.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/15 transition-colors duration-700 dark:bg-white/90 dark:text-slate-900">
            <Quote size={17} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-wide text-slate-800 transition-colors duration-700 dark:text-white">{title}</p>
            {subtitle && <p className="truncate text-[11px] text-slate-500 transition-colors duration-700 dark:text-slate-400">{subtitle}</p>}
          </div>
        </div>

        <div className="min-w-0 flex-1 md:border-l md:border-slate-200/70 md:pl-7 dark:md:border-white/10">
          <p className="text-lg leading-relaxed tracking-wide text-slate-700 transition-colors duration-700 sm:text-xl sm:leading-relaxed dark:text-slate-100">
            {quote}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-slate-500 transition-colors duration-700 dark:text-slate-400">
            {data.showDate !== false && data.date && <span className="font-mono tracking-wider">{data.date}</span>}
            {data.showSource !== false && data.sourceLabel && (
              <span className="flex items-center gap-1.5">
                <Sparkles size={11} className={manual ? 'text-amber-400' : 'text-indigo-400'} />
                {manual ? `${data.sourceLabel} · 手写` : data.sourceLabel}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
