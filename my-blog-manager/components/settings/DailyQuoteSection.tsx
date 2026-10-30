"use client";

import { useCallback, useEffect, useState } from 'react';
import { withBasePath } from '../../lib/consoleBasePath';
import { motion } from 'framer-motion';
import {
  CalendarClock,
  History,
  Loader2,
  MessageSquareQuote,
  PenLine,
  Power,
  RefreshCw,
  Save,
  Sparkles,
  Type,
} from 'lucide-react';
import { useToast } from '../ToastProvider';

/**
 * ☀️ 每日一句
 *
 * 每天定时让当前接入的 AI（默认是煤球）说一句话，显示在首页。
 * 设置与内容都存在本机内容引擎里，保存后公开站立刻可见，不需要重新发布。
 *
 * 密钥不经过这里：引擎自己从环境变量读 AI 密钥，仓库里不存任何口令。
 */

type QuoteConfig = {
  enabled: boolean;
  autoGenerate: boolean;
  title: string;
  subtitle: string;
  showDate: boolean;
  showSource: boolean;
  generateTime: string;
  prompt: string;
  maxLength: number;
  sourceLabel: string;
};

type QuoteEntry = {
  date: string;
  quote: string;
  source: string;
  model: string;
  label: string;
  generatedAt: string;
};

const DEFAULT_CONFIG: QuoteConfig = {
  enabled: true,
  autoGenerate: true,
  title: '每日一句',
  subtitle: '煤球的今日打气',
  showDate: true,
  showSource: true,
  generateTime: '07:00',
  prompt: '今天是 {date}。请给主人一句简短的励志话语，一句话就好，不要解释，不要前缀，直接把这句话说出来。',
  maxLength: 60,
  sourceLabel: '煤球',
};

const API = withBasePath('/api/proxy/api/daily-quote');

function Toggle({
  checked,
  onChange,
  label,
  hint,
  icon,
  tone = 'indigo',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint: string;
  icon: React.ReactNode;
  tone?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';
}) {
  const activeClass = {
    indigo: 'bg-indigo-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    slate: 'bg-slate-500',
  }[tone];

  return (
    <div className="flex items-start gap-4 rounded-2xl bg-white/40 dark:bg-slate-800/40 border border-white/40 dark:border-slate-700/40 p-4">
      <div className="shrink-0 w-9 h-9 rounded-xl bg-slate-500/10 flex items-center justify-center text-slate-500 dark:text-slate-300">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-slate-700 dark:text-slate-200">{label}</span>
          <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            onClick={() => onChange(!checked)}
            className={`ml-auto relative w-11 h-6 rounded-full transition-colors duration-300 ${
              checked ? activeClass : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300 ${
                checked ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-5">{hint}</p>
      </div>
    </div>
  );
}

export default function DailyQuoteSection() {
  const { showToast } = useToast();
  const [config, setConfig] = useState<QuoteConfig>(DEFAULT_CONFIG);
  const [current, setCurrent] = useState<QuoteEntry | null>(null);
  const [history, setHistory] = useState<QuoteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [connected, setConnected] = useState(true);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, todayRes, historyRes] = await Promise.all([
        fetch(`${API}/config`, { cache: 'no-store' }),
        fetch(API, { cache: 'no-store' }),
        fetch(`${API}/history?limit=14`, { cache: 'no-store' }),
      ]);
      const configJson = await configRes.json().catch(() => ({}));
      if (!configRes.ok || !configJson.success) {
        throw new Error(configJson.message || configJson.detail || '无法连接内容引擎');
      }
      setConfig({ ...DEFAULT_CONFIG, ...(configJson.config || {}) });

      const todayJson = await todayRes.json().catch(() => ({}));
      setCurrent(todayJson?.quote ? (todayJson as QuoteEntry) : null);
      setDraft(todayJson?.quote || '');

      const historyJson = await historyRes.json().catch(() => ({}));
      setHistory(Array.isArray(historyJson?.history) ? historyJson.history : []);
      setConnected(true);
    } catch (error) {
      setConnected(false);
      showToast(error instanceof Error ? error.message : '无法连接内容引擎', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (key: keyof QuoteConfig, value: string | number | boolean) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.message || json.detail || '保存失败');
      }
      setConfig({ ...DEFAULT_CONFIG, ...(json.config || config) });
      showToast('💾 每日一句设置已保存，公开站立刻可见', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  /** 让 AI 重新说一句（同步调用，可能要等十几秒） */
  const regenerate = async () => {
    setGenerating(true);
    try {
      const response = await fetch(`${API}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.message || json.detail || '生成失败');
      }
      setCurrent(json as QuoteEntry);
      setDraft(json.quote || '');
      showToast('🐾 煤球换了一句新的', 'success');
      void load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成失败', 'error');
    } finally {
      setGenerating(false);
    }
  };

  /** 手写一句，覆盖今天的自动生成结果 */
  const saveManual = async () => {
    const text = draft.trim();
    if (!text) {
      showToast('先写点什么吧', 'error');
      return;
    }
    try {
      const response = await fetch(`${API}/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote: text }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.message || json.detail || '保存失败');
      }
      setCurrent(json as QuoteEntry);
      showToast('✍️ 今天这句按你写的来', 'success');
      void load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存失败', 'error');
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col gap-6"
    >
      <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-white/50 dark:border-slate-800/50 rounded-[40px] p-8 shadow-xl">
        <div className="flex justify-between items-center mb-8 border-b border-white/30 dark:border-slate-700/50 pb-6">
          <div>
            <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
              <span>☀️</span> 每日一句
            </h2>
            <p className="text-slate-500 text-sm mt-1 font-bold">
              每天定时让煤球说一句话，显示在首页；生成、修改都在这里
            </p>
          </div>
          <button
            onClick={save}
            disabled={saving || loading || !connected}
            className="px-6 py-3 bg-indigo-500 text-white rounded-2xl font-black text-sm shadow-lg shadow-indigo-500/30 flex items-center gap-2 hover:bg-indigo-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            保存设置
          </button>
        </div>

        {!connected && (
          <div className="mb-6 rounded-2xl border border-amber-200/60 bg-amber-50/70 px-4 py-3 text-xs text-amber-800 flex items-center gap-2">
            内容引擎未连接，每日一句暂时无法管理。请确认本机内容引擎正在运行。
          </div>
        )}

        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Toggle
              checked={config.enabled}
              onChange={(next) => update('enabled', next)}
              label="在首页显示每日一句"
              hint="关闭后首页不再出现这一栏，已经生成的内容仍然保留"
              icon={<Power size={16} />}
              tone={config.enabled ? 'emerald' : 'slate'}
            />
            <Toggle
              checked={config.showDate}
              onChange={(next) => update('showDate', next)}
              label="显示日期"
              hint="在句子下面标出这一句是哪天的"
              icon={<CalendarClock size={16} />}
              tone="indigo"
            />
            <Toggle
              checked={config.showSource}
              onChange={(next) => update('showSource', next)}
              label="显示署名"
              hint="展示是谁说的：AI 生成会署名，手写则标注「手写」"
              icon={<Sparkles size={16} />}
              tone="amber"
            />
            <Toggle
              checked={config.autoGenerate}
              onChange={(next) => update('autoGenerate', next)}
              label="每天自动说一句"
              hint="定时任务在内容引擎里常驻运行，不依赖有没有人打开控制台"
              icon={<RefreshCw size={16} />}
              tone={config.autoGenerate ? 'emerald' : 'slate'}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2 flex items-center gap-2">
                <Type size={14} className="text-indigo-400" /> 栏目名称
              </label>
              <input
                type="text"
                value={config.title}
                onChange={(e) => update('title', e.target.value)}
                maxLength={20}
                className="w-full bg-white/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 text-sm dark:text-slate-200"
                placeholder="每日一句"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2 flex items-center gap-2">
                <MessageSquareQuote size={14} className="text-sky-400" /> 副标题
              </label>
              <input
                type="text"
                value={config.subtitle}
                onChange={(e) => update('subtitle', e.target.value)}
                maxLength={30}
                className="w-full bg-white/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 text-sm dark:text-slate-200"
                placeholder="煤球的今日打气"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2 flex items-center gap-2">
                <CalendarClock size={14} className="text-amber-400" /> 每天生成时间
              </label>
              <input
                type="time"
                value={config.generateTime}
                onChange={(e) => update('generateTime', e.target.value)}
                className="w-full bg-white/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 text-sm dark:text-slate-200"
              />
              <p className="mt-2 text-[11px] leading-5 text-slate-400">北京时间（24 小时制）</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2 flex items-center gap-2">
                <Sparkles size={14} className="text-indigo-400" /> 署名
              </label>
              <input
                type="text"
                value={config.sourceLabel}
                onChange={(e) => update('sourceLabel', e.target.value)}
                maxLength={12}
                className="w-full bg-white/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 text-sm dark:text-slate-200"
                placeholder="煤球"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2 flex items-center gap-2">
                <Type size={14} className="text-emerald-400" /> 单句最长字数
              </label>
              <input
                type="number"
                value={config.maxLength}
                onChange={(e) => update('maxLength', Number(e.target.value) || 60)}
                min={10}
                max={200}
                step={5}
                className="w-full bg-white/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 text-sm dark:text-slate-200"
              />
              <p className="mt-2 text-[11px] leading-5 text-slate-400">超出部分会被截断，避免长篇大论</p>
            </div>
          </div>

          <div>
            <label className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2 flex items-center gap-2">
              <MessageSquareQuote size={14} className="text-sky-400" /> 给模型的话（提示词）
            </label>
            <textarea
              value={config.prompt}
              onChange={(e) => update('prompt', e.target.value)}
              rows={4}
              maxLength={500}
              className="w-full bg-white/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 text-sm dark:text-slate-200 resize-none"
              placeholder="今天是 {date}。请给主人一句简短的励志话语……"
            />
            <p className="mt-2 text-[11px] leading-5 text-slate-400">
              {'{date}'} 会自动替换成当天日期。人物性格沿用「AI 煤球配置」里的设定，不用在这里重复写。
            </p>
          </div>
        </div>
      </div>

      {/* 今天这一句 */}
      <div className="rounded-[40px] bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-white/50 dark:border-slate-800/50 p-8 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 border-b border-white/30 dark:border-slate-700/50 pb-6">
          <div>
            <h3 className="text-base font-black text-slate-800 dark:text-white">今天这一句</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-6">
              {current
                ? `${current.date} · ${current.source === 'manual' ? '手写' : 'AI 生成'}${current.model ? ` · ${current.model}` : ''}`
                : '还没有今天的句子，可以让 AI 现说一句，也可以自己写一句。'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={regenerate}
              disabled={generating || !connected}
              className="px-5 py-3 rounded-2xl bg-white/70 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 font-black text-sm shadow-lg flex items-center gap-2 hover:bg-white dark:hover:bg-slate-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {generating ? '煤球正在想…' : '换一句'}
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-indigo-100/70 dark:border-indigo-400/20 bg-gradient-to-br from-indigo-50/70 via-white/40 to-sky-50/40 dark:from-indigo-950/40 dark:via-slate-900/40 dark:to-slate-900/40 p-7">
          <p className="text-xl leading-relaxed tracking-wide text-slate-800 dark:text-slate-100 min-h-[3rem]">
            {current?.quote || '（还没有内容）'}
          </p>
        </div>

        <div className="mt-6">
          <label className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2 flex items-center gap-2">
            <PenLine size={14} className="text-amber-400" /> 手写一句（覆盖今天的自动结果）
          </label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={200}
            className="w-full bg-white/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 text-sm dark:text-slate-200 resize-none"
            placeholder="今天想对主人说的话…"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] leading-5 text-slate-400">手写只在今天生效；第二天仍然会按时让 AI 说一句。</p>
            <button
              onClick={saveManual}
              disabled={!connected || !draft.trim()}
              className="px-5 py-2.5 rounded-2xl bg-slate-800 dark:bg-slate-700 text-white font-black text-sm shadow-lg flex items-center gap-2 hover:bg-slate-900 dark:hover:bg-slate-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save size={15} />保存这句
            </button>
          </div>
        </div>
      </div>

      {/* 历史 */}
      <div className="rounded-[40px] bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-white/50 dark:border-slate-800/50 p-8 shadow-xl">
        <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
          <History size={16} className="text-indigo-400" /> 往期
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-5 leading-6">最近说过的话，最多保留 30 条。</p>
        {history.length === 0 ? (
          <p className="rounded-2xl bg-white/30 dark:bg-slate-800/30 px-4 py-6 text-xs text-slate-400 text-center">
            还没有历史记录。
          </p>
        ) : (
          <ul className="space-y-2">
            {history.map((entry) => (
              <li
                key={`${entry.date}-${entry.generatedAt}`}
                className="flex flex-wrap items-baseline gap-3 rounded-2xl bg-white/40 dark:bg-slate-800/40 border border-white/40 dark:border-slate-700/40 px-4 py-3"
              >
                <span className="font-mono text-[10px] text-slate-400 shrink-0">{entry.date}</span>
                <span className="text-sm text-slate-700 dark:text-slate-200 flex-1 min-w-0 break-words">{entry.quote}</span>
                <span className="text-[10px] text-slate-400 shrink-0">
                  {entry.source === 'manual' ? '手写' : entry.model || 'AI'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.section>
  );
}
