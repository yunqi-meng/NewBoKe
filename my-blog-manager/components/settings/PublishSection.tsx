"use client";

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useToast } from '../ToastProvider';
import { pushToGitHub } from '../../lib/contentMutations';
import {
  CloudUpload,
  Server,
  GitCommitHorizontal,
  Clock,
  RefreshCw,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderTree,
  History,
  Undo2,
} from 'lucide-react';

type PublishCommit = {
  commit: string;
  short: string;
  date: string;
  subject: string;
  isPublish?: boolean;
  isRollback?: boolean;
};

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
    github?: 'pushed' | 'failed' | 'none' | string;
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
  running: '同步中',
  busy: '已跳过（另一次发布在跑）',
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
  const [history, setHistory] = useState<PublishCommit[]>([]);
  const [head, setHead] = useState('');
  const [rollingBack, setRollingBack] = useState<string>('');

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

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/api/deploy/history', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.commits)) setHistory(data.commits);
      if (data?.head) setHead(data.head);
    } catch {
      /* 引擎暂时不可达时保留上一次历史 */
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadHistory();
    const timer = setInterval(loadStatus, 5000);
    return () => clearInterval(timer);
  }, [loadStatus, loadHistory]);

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

  const handlePush = async () => {
    setIsPublishing(true);
    try {
      const result = await pushToGitHub(pathInput || blogPath);
      if (result.ok) {
        showToast(result.message, 'success');
        setTimeout(loadStatus, 1500);
      } else if (result.data?.busy) {
        // 上一次推送/回退还没结束：这是排队提示，不是失败
        showToast(result.message, 'info');
        setTimeout(loadStatus, 1500);
      } else {
        showToast(`❌ 推送失败：${result.message}`, 'error');
      }
    } finally {
      setIsPublishing(false);
    }
  };

  const handleRollback = async (commit: PublishCommit) => {
    const confirmed = window.confirm(
      `确认把内容回退到这一步吗？\n\n${commit.subject}\n${commit.short} · ${commit.date}\n\n` +
      '回退会用这一步的内容覆盖当前版本，并重新构建线上站点（约 1-3 分钟）。'
    );
    if (!confirmed) return;

    setRollingBack(commit.commit);
    try {
      const res = await fetch('/api/proxy/api/deploy/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commit: commit.commit }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        setTimeout(loadHistory, 1500);
      } else if (data.busy) {
        // 有发布或回退正在进行中，属于排队提示
        showToast(data.message, 'info');
      } else {
        showToast(`❌ 回退失败：${data.message}`, 'error');
      }
    } catch {
      showToast('回退失败：无法连接内容引擎', 'error');
    }
    setRollingBack('');
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
          📤 推送到 GitHub
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
            推送时，控制台会把当前内容导成一份快照提交进该目录，再推送到服务器仓库与 GitHub 仓库；只有代码改动才会触发重建。
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
                <p className="text-[10px] text-slate-400 mt-0.5">仅代码改动才会重建站点</p>
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
                  {status.effective ? '已生效并推送' : '有改动未推送'}
                </p>
              </div>
            </div>
          </div>

          {status.git?.dirty && (
            <p className="mt-4 text-[11px] leading-6 text-amber-600 dark:text-amber-400">
              源码仓库存在 {status.git.changedFiles?.length || 0} 处未提交的代码改动。推送只提交内容快照，代码改动请在本机提交后再部署。
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
              {status.publish.github === 'pushed' && (
                <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 font-black text-emerald-600 dark:text-emerald-400">GitHub 已同步</span>
              )}
              {status.publish.github === 'failed' && (
                <span className="ml-2 rounded-full bg-red-500/15 px-2 py-0.5 font-black text-red-600 dark:text-red-400">GitHub 推送失败，见日志</span>
              )}
              {status.publish.github === 'none' && (
                <span className="ml-2 rounded-full bg-slate-500/15 px-2 py-0.5 font-black text-slate-500">仓库未配置 github 远端</span>
              )}
            </div>
          )}
        </div>

        {/* 3. 推送动作 */}
        <div className="pt-2">
          <label className="mb-3 block text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase flex items-center gap-1">
            <CloudUpload size={14} className="text-indigo-500" /> 3. 推送到 GitHub 仓库
          </label>
          <button
            onClick={handlePush}
            disabled={isPublishing || inFlight}
            className="w-full flex items-center justify-center gap-2 py-5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-3xl text-sm font-black shadow-xl shadow-indigo-500/30 active:scale-95 transition-all hover:shadow-2xl disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isPublishing || inFlight ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {inFlight ? '正在推送…' : '正在提交快照…'}
              </>
            ) : (
              <>
                <CloudUpload size={18} />
                推送到 GitHub 仓库
              </>
            )}
          </button>
          <p className="mt-3 text-center text-[11px] leading-6 text-slate-400">
            内容保存即生效，这里只把最新内容快照提交并推送一次，不会覆盖或回滚已保存的内容。
          </p>
        </div>

        {/* 4. 发布历史与回退 */}
        <div className="bg-slate-50 dark:bg-slate-800/30 p-5 rounded-3xl border border-slate-100 dark:border-slate-700/50">
          <div className="mb-4 flex items-center justify-between">
            <label className="text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase flex items-center gap-1">
              <History size={14} className="text-indigo-500" /> 4. 推送历史与回退
            </label>
            <button
              onClick={loadHistory}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-500/10 text-slate-500 dark:text-slate-300 text-[10px] font-black hover:bg-slate-500/20 transition-colors"
            >
              <RefreshCw size={12} /> 刷新
            </button>
          </div>

          {history.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">还没有推送记录</p>
          ) : (
            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto custom-scrollbar">
              {history.map(item => {
                const isCurrent = item.commit === head;
                const isRolling = rollingBack === item.commit;
                return (
                  <div
                    key={item.commit}
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                      isCurrent
                        ? 'border-emerald-300/60 bg-emerald-50/70 dark:border-emerald-500/20 dark:bg-emerald-950/20'
                        : 'border-slate-100 dark:border-slate-700/60 bg-white dark:bg-slate-900/40'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">
                        {item.isRollback ? '↩️ ' : item.isPublish ? '🚀 ' : ''}
                        {item.subject}
                      </p>
                      <p className="mt-1 text-[10px] font-mono text-slate-400">
                        {item.short} · {new Date(item.date).toLocaleString('zh-CN', { hour12: false })}
                      </p>
                    </div>
                    {isCurrent ? (
                      <span className="shrink-0 rounded-full bg-emerald-500/15 px-3 py-1 text-[10px] font-black text-emerald-600 dark:text-emerald-400">
                        当前线上
                      </span>
                    ) : (
                      <button
                        onClick={() => handleRollback(item)}
                        disabled={rollingBack !== ''}
                        className="shrink-0 flex items-center gap-1 rounded-xl bg-amber-500/15 px-3 py-1.5 text-[10px] font-black text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 transition-colors disabled:opacity-50"
                      >
                        {isRolling ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
                        {isRolling ? '回退中' : '回退到这里'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-3 text-[11px] leading-6 text-slate-400">
            每一次推送与回退都会留下一个提交。点「回退到这里」会把内容恢复到那一步并同步到线上，历史不会丢失。
          </p>
        </div>
      </div>
    </motion.section>
  );
}
