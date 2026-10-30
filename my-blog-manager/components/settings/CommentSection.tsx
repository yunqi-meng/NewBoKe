"use client";

import { useCallback, useEffect, useState } from 'react';
import { withBasePath } from '../../lib/consoleBasePath';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Save,
  MessageSquareText,
  Power,
  Users,
  ShieldCheck,
  Heart,
  Type,
  Hash,
  Bell,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { useToast } from '../ToastProvider';

/**
 * 🌟 评论系统设置
 *
 * 旧的 Gitalk 配置（OAuth ClientID / Secret / 仓库）已经整体下线。
 * 现在评论存在本机 SQLite，由内容引擎托管，设置也存引擎里，
 * 保存后前台立即生效，不需要重新发布站点。
 */

type CommentSettings = {
  enabled: boolean;
  title: string;
  placeholder: string;
  notice: string;
  allowGuest: boolean;
  requireApproval: boolean;
  maxLength: number;
  allowLike: boolean;
};

const DEFAULT_SETTINGS: CommentSettings = {
  enabled: true,
  title: '留言板',
  placeholder: '说点什么吧…',
  notice: '',
  allowGuest: true,
  requireApproval: false,
  maxLength: 500,
  allowLike: true,
};

const API = withBasePath('/api/proxy/api/comments');

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

export default function CommentSection() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<CommentSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/admin/settings`, { cache: 'no-store' });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.message || json.detail || '无法连接内容引擎');
      }
      setSettings({ ...DEFAULT_SETTINGS, ...(json.data || {}) });
      setConnected(true);
    } catch (error) {
      setConnected(false);
      showToast(
        error instanceof Error ? error.message : '无法连接内容引擎',
        'error',
      );
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (key: keyof CommentSettings, value: string | number | boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API}/admin/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.message || json.detail || '保存失败');
      }
      setSettings({ ...DEFAULT_SETTINGS, ...(json.data || settings) });
      showToast('💾 评论设置已保存，前台立即生效', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存失败', 'error');
    } finally {
      setSaving(false);
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
              <span>💬</span> 评论系统配置
            </h2>
            <p className="text-slate-500 text-sm mt-1 font-bold">
              自建评论系统：数据存在本机数据库，控制台可审核、回复、删除
            </p>
          </div>
          <button
            onClick={save}
            disabled={saving || loading || !connected}
            className="px-6 py-3 bg-indigo-500 text-white rounded-2xl font-black text-sm shadow-lg shadow-indigo-500/30 flex items-center gap-2 hover:bg-indigo-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            保存修改
          </button>
        </div>

        {!connected && (
          <div className="mb-6 rounded-2xl border border-amber-200/60 bg-amber-50/70 px-4 py-3 text-xs text-amber-800 flex items-center gap-2">
            内容引擎未连接，评论设置暂时无法保存。请确认评论服务正在运行。
          </div>
        )}

        <div className="space-y-6">
          {/* 开关组 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Toggle
              checked={settings.enabled}
              onChange={(next) => update('enabled', next)}
              label="开启评论功能"
              hint="关闭后前台所有评论区不再显示，已有的评论数据保留"
              icon={<Power size={16} />}
              tone={settings.enabled ? 'emerald' : 'slate'}
            />
            <Toggle
              checked={settings.requireApproval}
              onChange={(next) => update('requireApproval', next)}
              label="评论需要审核"
              hint="新评论先进入「待审核」，在评论管理台通过后才会公开显示"
              icon={<ShieldCheck size={16} />}
              tone="amber"
            />
            <Toggle
              checked={settings.allowGuest}
              onChange={(next) => update('allowGuest', next)}
              label="允许匿名留言"
              hint="关闭后访客必须填写邮箱才能提交（本站没有账号体系）"
              icon={<Users size={16} />}
              tone="indigo"
            />
            <Toggle
              checked={settings.allowLike}
              onChange={(next) => update('allowLike', next)}
              label="开放点赞"
              hint="访客可以给评论点赞，每个访客对同一条评论只计一次"
              icon={<Heart size={16} />}
              tone="rose"
            />
          </div>

          {/* 文本组 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2 flex items-center gap-2">
                <Type size={14} className="text-indigo-400" /> 评论区标题
              </label>
              <input
                type="text"
                value={settings.title}
                onChange={(e) => update('title', e.target.value)}
                maxLength={60}
                className="w-full bg-white/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 text-sm dark:text-slate-200"
                placeholder="留言板"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2 flex items-center gap-2">
                <Hash size={14} className="text-emerald-400" /> 单条最大字数
              </label>
              <input
                type="number"
                value={settings.maxLength}
                onChange={(e) => update('maxLength', Number(e.target.value) || 500)}
                min={10}
                max={2000}
                step={10}
                className="w-full bg-white/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 text-sm dark:text-slate-200"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2 flex items-center gap-2">
              <MessageSquareText size={14} className="text-sky-400" /> 输入框占位符
            </label>
            <input
              type="text"
              value={settings.placeholder}
              onChange={(e) => update('placeholder', e.target.value)}
              maxLength={120}
              className="w-full bg-white/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 text-sm dark:text-slate-200"
              placeholder="说点什么吧…"
            />
          </div>

          <div>
            <label className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2 flex items-center gap-2">
              <Bell size={14} className="text-amber-400" /> 顶部提示语（留空则不显示）
            </label>
            <textarea
              value={settings.notice}
              onChange={(e) => update('notice', e.target.value)}
              rows={3}
              maxLength={300}
              className="w-full bg-white/50 dark:bg-slate-800/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 text-sm dark:text-slate-200 resize-none"
              placeholder="例如：请遵守网络文明规范，友善发言。"
            />
          </div>
        </div>
      </div>

      {/* 快捷入口 */}
      <div className="rounded-[40px] bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-white/50 dark:border-slate-800/50 p-8 shadow-xl flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div>
          <h3 className="text-base font-black text-slate-800 dark:text-white">评论区管理台</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-6">
            查看站点上的全部评论，支持审核、回复、隐藏、删除与批量操作。
          </p>
        </div>
        <Link
          href="/comments"
          className="shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-slate-800 dark:bg-slate-700 text-white text-sm font-black shadow-lg hover:bg-slate-900 dark:hover:bg-slate-600 transition"
        >
          前往评论管理 <ExternalLink size={15} />
        </Link>
      </div>
    </motion.section>
  );
}
