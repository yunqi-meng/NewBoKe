"use client";

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useToast } from '../ToastProvider';
import {
  Rocket,
  Server,
  GitCommitHorizontal,
  Clock,
  RefreshCw,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderTree,
} from 'lucide-react';

type PublishStatus = {
  success: boolean;
  serverMode: boolean;
  blogPath: string;
  repoRoot: string;
  git: {
    branch?: string;
    head?: string;
    lastCommit?: string;
    lastCommitTime?: string;
    dirty?: boolean;
    changedFiles?: string[];
  };
  build: {
    id?: string;
    time?: string;
    timestamp?: number;
    running?: boolean;
  };
  service: {
    name?: string;
    active?: boolean;
  };
  publish: {
    state?: string;
    message?: string;
    startedAtTimestamp?: number;
    updatedAt?: string;
  };
  effective: boolean;
};

const EMPTY_STATUS: PublishStatus = {
  success: false,
  serverMode: false,
  blogPath: '',
  repoRoot: '',
  git: {},
  build: {},
  service: {},
  publish: {},
  effective: false,
};

const STATE_TEXT: Record<string, string> = {
  requested: '已排队',
  running: '构建中',
  busy: '已跳过（有构建在跑）',
  done: '已完成',
  failed: '失败',
};

export default function PublishSection() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<PublishStatus>(EMPTY_STATUS);
  const [blogPath, setBlogPath] = useState('');
  const [pathInput, setPathInput] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/api/deploy/status', { cache: 'no-store' });
      if (!res.ok) return;
      const data: PublishStatus = await res.json();
      setStatus(data);
      if (!loaded) {
        setBlogPath(data.blogPath || '');
        setPathInput(data.blogPath || '');
        setLoaded(true);
      }
    } catch {
      /* 引擎暂时不可达时保留上一次状态 */
    }
  }, [loaded]);

  useEffect(() => {
    loadStatus();
    const timer = setInterval(loadStatus, 5000);
    return () => clearInterval(timer);
  }, [loadStatus]);

  const handleSavePath = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/proxy/api/deploy/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogPath: pathInput }),
      });
      const data = await res.json();
      if (data.success) {
        setBlogPath(pathInput);
        showToast(data.message, 'success');
        loadStatus();
      } else {
        showToast(data.message, 'error');
      }
    } catch {
      showToast('保存失败：无法连接内容引擎', 'error');
    }
    setIsSaving(false);
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      const res = await fetch('/api/proxy/api/deploy/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogPath: pathInput || blogPath }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        setTimeout(loadStatus, 1500);
      } else {
        showToast(`❌ 发布失败：${data.message}`, 'error');
      }
    } catch {
      showToast('发布失败：无法连接内容引擎', 'error');
    }
    setIsPublishing(false);
  };

  const publishState = status.publish?.state || '';
  const inFlight = publishState === 'running' || publishState === 'requested' || status.build?.running;

  return (
    <motion.section
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl border border-white/50 dark:border-slate-800/50 rounded-[40px] p-8 shadow-2xl relative z-10"
    >
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
          🚀 线上发布
        </h2>
        <button
          onClick={loadStatus}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-500/10 text-slate-500 dark:text-slate-300 text-[10px] font-black hover:bg-slate-500/20 transition-colors"
        >
          <RefreshCw size={12} className={inFlight ? 'animate-spin' : ''} /> 刷新状态
        </button>
      </div>

      <div className="space-y-6">
        {/* 1. 网站源码路径 */}
        <div className="bg-slate-50 dark:bg-slate-800/30 p-5 rounded-3xl border border-slate-100 dark:border-slate-700/50">
          <label className="mb-3 text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase flex items-center gap-1">
            <FolderTree size={14} className="text-indigo-500" /> 1. 网站源码目录
          </label>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              value={pathInput}
              onChange={e => setPathInput(e.target.value)}
              className="flex-1 bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="/opt/xinghui-blog/XHBlogs"
            />
            <button
              onClick={handleSavePath}
              disabled={isSaving}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black shadow-lg active:scale-95 transition-all disabled:opacity-60"
            >
              <Save size={14} /> {isSaving ? '保存中…' : '保存路径'}
            </button>
          </div>
          <p className="mt-3 text-[11px] leading-6 text-slate-400">
            发布时，控制台会把文章、说说、动态与站点配置镜像覆盖到该目录，再提交仓库并重建公开站。
          </p>
        </div>

        {/* 2. 线上状态 */}
        <div className="bg-slate-50 dark:bg-slate-800/30 p-5 rounded-3xl border border-slate-100 dark:border-slate-700/50">
          <label className="mb-4 text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase flex items-center gap-1">
            <Server size={14} className="text-emerald-500" /> 2. 线上运行状态
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center gap-3 bg-white dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/40">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  status.service?.active ? 'bg-emerald-500 animate-pulse' : 'bg-red-400'
                }`}
              />
              <div className="min-w-0">
                <p className="text-[10px] font-black text-slate-400 uppercase">公开站服务</p>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                  {status.service?.active ? '运行中' : '未运行 / 未知'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-white dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/40">
              <GitCommitHorizontal size={16} className="text-indigo-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-black text-slate-400 uppercase">源码版本</p>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                  {status.git?.head ? `${status.git.branch || 'main'} @ ${status.git.head}` : '—'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-white dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/40">
              <Clock size={16} className="text-amber-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-black text-slate-400 uppercase">最近构建</p>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                  {status.build?.time || '尚未构建'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-white dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/40">
              {status.effective ? (
                <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
              ) : (
                <AlertCircle size={16} className="text-amber-500 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-[10px] font-black text-slate-400 uppercase">改动生效</p>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                  {status.effective ? '已同步到线上' : '有待发布的改动'}
                </p>
              </div>
            </div>
          </div>

          {status.git?.dirty && (
            <p className="mt-4 text-[11px] leading-6 text-amber-600 dark:text-amber-400">
              源码仓库存在 {status.git.changedFiles?.length || 0} 处未提交改动，点击下方「发布上线」即可一并提交。
            </p>
          )}

          {status.publish?.message && (
            <div
              className={`mt-4 rounded-2xl border px-4 py-3 text-[11px] leading-6 ${
                publishState === 'failed'
                  ? 'border-red-300/60 bg-red-50/70 text-red-700 dark:border-red-500/20 dark:bg-red-950/30 dark:text-red-300'
                  : 'border-indigo-200/60 bg-indigo-50/70 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-950/30 dark:text-indigo-300'
              }`}
            >
              <span className="font-black">
                {STATE_TEXT[publishState] || publishState || '状态'}：
              </span>
              {status.publish.message}
              {status.publish.updatedAt && (
                <span className="ml-2 opacity-60">{status.publish.updatedAt}</span>
              )}
            </div>
          )}
        </div>

        {/* 3. 发布动作 */}
        <div className="pt-2">
          <button
            onClick={handlePublish}
            disabled={isPublishing || inFlight}
            className="w-full flex items-center justify-center gap-2 py-5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-3xl text-sm font-black shadow-xl shadow-indigo-500/30 active:scale-95 transition-all hover:shadow-2xl disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isPublishing || inFlight ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {inFlight ? '正在构建发布…' : '正在提交发布…'}
              </>
            ) : (
              <>
                <Rocket size={18} /> 发布上线
              </>
            )}
          </button>
          <p className="mt-3 text-center text-[11px] leading-6 text-slate-400">
            一次点击完成：镜像内容 → 提交源码仓库 → 重新构建公开站 → 重启服务，约 1-3 分钟生效。
          </p>
        </div>
      </div>
    </motion.section>
  );
}
