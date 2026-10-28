"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquareText,
  RefreshCw,
  Search,
  Trash2,
  Check,
  Eye,
  AlertTriangle,
  Reply,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Clock,
  Link2,
  Settings2,
} from 'lucide-react';

/**
 * 🌟 评论管理台
 *
 * 站长的「全部评论」视图：能按状态、主题、关键词筛选，能审核、回复、删除，
 * 也能批量处理。数据来自内容引擎的 /api/comments/admin/* 接口，
 * 走控制台自己的同源转发器，因此自动继承后台登录校验。
 */

type AdminComment = {
  id: number;
  target: string;
  target_label: string;
  parent_id: number;
  author_name: string;
  author_email: string;
  author_website: string;
  author_ip: string;
  visitor_id: string;
  author_agent: string;
  content: string;
  status: string;
  status_label: string;
  is_admin: boolean;
  likes: number;
  created_at: string;
  updated_at: string;
  reply_count: number;
};

type Stats = {
  total: number;
  pending: number;
  approved: number;
  spam: number;
  hidden: number;
  today: number;
  week: number;
  targets: number;
};

type TargetSummary = {
  target: string;
  count: number;
  label: string;
  last_at: string;
};

const API = '/api/proxy/api/comments';

const STATUS_TABS = [
  { key: '', label: '全部', tone: 'slate' },
  { key: 'pending', label: '待审核', tone: 'amber' },
  { key: 'approved', label: '已发布', tone: 'emerald' },
  { key: 'spam', label: '垃圾箱', tone: 'rose' },
  { key: 'hidden', label: '已隐藏', tone: 'slate' },
] as const;

const TONE_CLASS: Record<string, string> = {
  slate: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  emerald: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  rose: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
};

async function callApi(path: string, init?: RequestInit) {
  const response = await fetch(`${API}${path}`, { cache: 'no-store', ...init });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) {
    throw new Error(json.message || json.detail || '操作失败，请稍后再试');
  }
  return json;
}

function formatTime(value: string) {
  if (!value) return '';
  return value.replace('T', ' ').slice(0, 16);
}

export default function CommentManager() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [targets, setTargets] = useState<TargetSummary[]>([]);
  const [items, setItems] = useState<AdminComment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const [status, setStatus] = useState('');
  const [target, setTarget] = useState('');
  const [keyword, setKeyword] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [sort, setSort] = useState('new');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number[]>([]);

  const [replyTarget, setReplyTarget] = useState<AdminComment | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replying, setReplying] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminComment | null>(null);

  const pageSize = 20;

  const loadStats = useCallback(async () => {
    try {
      const json = await callApi('/admin/stats');
      setStats(json.data);
    } catch {
      /* 统计失败不阻塞列表 */
    }
  }, []);

  const loadTargets = useCallback(async () => {
    try {
      const json = await callApi('/admin/targets');
      setTargets(json.data || []);
    } catch {
      setTargets([]);
    }
  }, []);

  const loadList = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          size: String(pageSize),
          sort,
        });
        if (status) params.set('status', status);
        if (target) params.set('target', target);
        if (keyword) params.set('keyword', keyword);
        const json = await callApi(`/admin/list?${params.toString()}`);
        setItems(json.data.items || []);
        setTotal(json.data.total || 0);
        setHasMore(Boolean(json.data.has_more));
        setPage(nextPage);
        setSelected([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : '评论列表加载失败');
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [status, target, keyword, sort],
  );

  useEffect(() => {
    loadStats();
    loadTargets();
  }, [loadStats, loadTargets]);

  useEffect(() => {
    loadList(1);
  }, [loadList]);

  const refreshAll = () => {
    loadStats();
    loadTargets();
    loadList(page);
  };

  const updateStatus = async (ids: number[], nextStatus: string, label: string) => {
    try {
      await callApi('/admin/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status: nextStatus }),
      });
      setSelected([]);
      refreshAll();
      return label;
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
      return '';
    }
  };

  const bulk = async (action: 'approve' | 'hide' | 'spam' | 'delete') => {
    if (selected.length === 0) return;
    try {
      if (action === 'delete') {
        await callApi('/admin/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selected, action: 'delete' }),
        });
      } else {
        const map: Record<string, string> = {
          approve: 'approved',
          hide: 'hidden',
          spam: 'spam',
        };
        await callApi('/admin/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selected, action: 'status', status: map[action] }),
        });
      }
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量操作失败');
    }
  };

  const removeOne = async (comment: AdminComment) => {
    try {
      await callApi('/admin/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [comment.id] }),
      });
      setDeleteTarget(null);
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  const submitReply = async () => {
    if (!replyTarget || !replyContent.trim()) return;
    setReplying(true);
    try {
      await callApi('/admin/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_id: replyTarget.id,
          content: replyContent.trim(),
          target_label: replyTarget.target_label,
        }),
      });
      setReplyTarget(null);
      setReplyContent('');
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '回复失败');
    } finally {
      setReplying(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    setSelected((prev) =>
      prev.length === items.length ? [] : items.map((item) => item.id),
    );
  };

  const statCards = useMemo(() => {
    if (!stats) return [];
    return [
      { key: 'total', label: '全部评论', value: stats.total, tone: 'slate' },
      { key: 'pending', label: '待审核', value: stats.pending, tone: 'amber' },
      { key: 'approved', label: '已发布', value: stats.approved, tone: 'emerald' },
      { key: 'spam', label: '垃圾箱', value: stats.spam, tone: 'rose' },
      { key: 'hidden', label: '已隐藏', value: stats.hidden, tone: 'slate' },
      { key: 'today', label: '今日新增', value: stats.today, tone: 'slate' },
    ];
  }, [stats]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="min-h-screen relative pb-16">
      <div className="w-full max-w-7xl mx-auto mt-24 px-4 sm:px-6 relative z-10 space-y-6">
        {/* 标题 */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
              <MessageSquareText className="text-indigo-500 w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                评论管理
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                站点全部评论都在这里，审核 / 回复 / 删除即时生效
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/settings?tab=comment"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs font-bold hover:border-indigo-400 transition"
            >
              <Settings2 size={14} />
              评论设置
            </a>
            <button
              onClick={refreshAll}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/30 hover:bg-indigo-600 transition"
            >
              <RefreshCw size={14} />
              刷新
            </button>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {statCards.map((card) => (
            <div
              key={card.key}
              className="rounded-2xl bg-white/60 dark:bg-slate-800/50 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-sm px-4 py-3"
            >
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{card.label}</div>
              <div className="mt-1 text-2xl font-black text-slate-800 dark:text-slate-100 tabular-nums">
                {card.value}
              </div>
            </div>
          ))}
        </div>

        {/* 筛选栏 */}
        <div className="rounded-3xl bg-white/60 dark:bg-slate-800/50 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-sm p-4 md:p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key || 'all'}
                onClick={() => setStatus(tab.key)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                  status === tab.key
                    ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30'
                    : 'bg-white/70 dark:bg-slate-900/40 text-slate-600 dark:text-slate-300 hover:border-indigo-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full bg-white/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs outline-none focus:border-indigo-500"
            >
              <option value="">全部主题</option>
              {targets.map((item) => (
                <option key={item.target} value={item.target}>
                  {item.label ? `${item.label}（${item.count}）` : `${item.target}（${item.count}）`}
                </option>
              ))}
            </select>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="w-full bg-white/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs outline-none focus:border-indigo-500"
            >
              <option value="new">最新在前</option>
              <option value="old">最早在前</option>
              <option value="likes">点赞最多</option>
            </select>

            <div className="md:col-span-2 flex gap-2">
              <input
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setKeyword(keywordInput.trim());
                    setPage(1);
                  }
                }}
                placeholder="搜索昵称 / 内容 / 邮箱"
                className="flex-1 min-w-0 bg-white/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => {
                  setKeyword(keywordInput.trim());
                  setPage(1);
                }}
                className="shrink-0 inline-flex items-center gap-1.5 px-4 rounded-xl bg-slate-700 dark:bg-slate-600 text-white text-xs font-bold hover:bg-slate-800 transition"
              >
                <Search size={13} />
                搜索
              </button>
            </div>
          </div>

          {keyword && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              关键词：<strong className="text-slate-700 dark:text-slate-200">{keyword}</strong>
              <button
                onClick={() => {
                  setKeyword('');
                  setKeywordInput('');
                }}
                className="underline underline-offset-2 hover:text-indigo-500"
              >
                清除
              </button>
            </div>
          )}
        </div>

        {/* 批量操作条 */}
        {selected.length > 0 && (
          <div className="sticky top-4 z-20 flex flex-wrap items-center gap-2 rounded-2xl bg-indigo-500 text-white px-4 py-3 shadow-xl shadow-indigo-500/30">
            <span className="text-xs font-bold">已选 {selected.length} 条</span>
            <button
              onClick={() => bulk('approve')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 text-xs font-bold hover:bg-white/30 transition"
            >
              <Check size={13} /> 通过
            </button>
            <button
              onClick={() => bulk('hide')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 text-xs font-bold hover:bg-white/30 transition"
            >
              <Eye size={13} /> 隐藏
            </button>
            <button
              onClick={() => bulk('spam')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 text-xs font-bold hover:bg-white/30 transition"
            >
              <AlertTriangle size={13} /> 垃圾
            </button>
            <button
              onClick={() => bulk('delete')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500 text-xs font-bold hover:bg-rose-600 transition"
            >
              <Trash2 size={13} /> 删除
            </button>
            <button
              onClick={() => setSelected([])}
              className="ml-auto inline-flex items-center gap-1 text-xs font-bold opacity-80 hover:opacity-100"
            >
              <X size={13} /> 取消选择
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-rose-200/60 bg-rose-50/80 px-4 py-3 text-xs text-rose-700 flex items-center gap-2">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        {/* 列表 */}
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 size={16} className="animate-spin" />
            正在加载评论…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl bg-white/60 dark:bg-slate-800/50 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-sm py-16 text-center text-sm text-slate-500 dark:text-slate-400">
            {keyword || status || target ? '当前筛选条件下没有评论' : '还没有任何评论，去前台发一条试试～'}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.length === items.length && items.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 accent-indigo-500"
                />
                全选本页
              </label>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                共 {total} 条 · 第 {page} / {totalPages} 页
              </span>
            </div>

            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-3xl bg-white/60 dark:bg-slate-800/50 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-sm p-4 md:p-5"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    className="mt-1 w-4 h-4 accent-indigo-500 shrink-0"
                  />

                  <div className="min-w-0 flex-1 space-y-2">
                    {/* 头部 */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-slate-800 dark:text-slate-100 text-sm break-all">
                        {item.author_name}
                      </span>
                      {item.is_admin && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 text-[10px] font-bold">
                          <ShieldCheck size={11} />
                          站长
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          TONE_CLASS[
                            item.status === 'approved'
                              ? 'emerald'
                              : item.status === 'pending'
                                ? 'amber'
                                : item.status === 'spam'
                                  ? 'rose'
                                  : 'slate'
                          ] || TONE_CLASS.slate
                        }`}
                      >
                        {item.status_label}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                        <Clock size={11} />
                        {formatTime(item.created_at)}
                      </span>
                      <span className="text-[10px] text-slate-400">#{item.id}</span>
                    </div>

                    {/* 主题 */}
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 break-all">
                      <Link2 size={12} className="shrink-0" />
                      <span className="font-mono">{item.target}</span>
                      {item.target_label && (
                        <span className="text-slate-400 dark:text-slate-500">· {item.target_label}</span>
                      )}
                      {item.parent_id > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-500 text-[10px] font-bold">
                          回复 #{item.parent_id}
                        </span>
                      )}
                    </div>

                    {/* 内容 */}
                    <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words leading-6">
                      {item.content}
                    </p>

                    {/* 访客信息 */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-400 dark:text-slate-500">
                      {item.author_email && <span>邮箱：{item.author_email}</span>}
                      {item.author_ip && <span>IP：{item.author_ip}</span>}
                      {item.visitor_id && <span>访客：{item.visitor_id.slice(0, 10)}</span>}
                      <span>点赞 {item.likes}</span>
                      {item.reply_count > 0 && <span>回复 {item.reply_count}</span>}
                    </div>

                    {/* 操作 */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {item.status !== 'approved' && (
                        <button
                          onClick={() => updateStatus([item.id], 'approved', '已通过')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold hover:bg-emerald-500/25 transition"
                        >
                          <Check size={12} /> 通过
                        </button>
                      )}
                      {item.status !== 'hidden' && (
                        <button
                          onClick={() => updateStatus([item.id], 'hidden', '已隐藏')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-500/15 text-slate-600 dark:text-slate-300 text-[11px] font-bold hover:bg-slate-500/25 transition"
                        >
                          <Eye size={12} /> 隐藏
                        </button>
                      )}
                      {item.status !== 'spam' && (
                        <button
                          onClick={() => updateStatus([item.id], 'spam', '已标记为垃圾')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[11px] font-bold hover:bg-amber-500/25 transition"
                        >
                          <AlertTriangle size={12} /> 垃圾
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setReplyTarget(item);
                          setReplyContent('');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold hover:bg-indigo-500/25 transition"
                      >
                        <Reply size={12} /> 回复
                      </button>
                      <button
                        onClick={() => setDeleteTarget(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[11px] font-bold hover:bg-rose-500/25 transition"
                      >
                        <Trash2 size={12} /> 删除
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => loadList(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-40 transition"
            >
              <ChevronLeft size={13} /> 上一页
            </button>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => loadList(Math.min(totalPages, page + 1))}
              disabled={!hasMore}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-40 transition"
            >
              下一页 <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>

      {/* 回复弹窗 */}
      <AnimatePresence>
        {replyTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4"
            onClick={() => setReplyTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-white/50 dark:border-white/10 shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">回复评论</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 break-all">
                    回复 @{replyTarget.author_name} · {replyTarget.target}
                  </p>
                </div>
                <button
                  onClick={() => setReplyTarget(null)}
                  className="shrink-0 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition"
                >
                  <X size={14} className="mx-auto" />
                </button>
              </div>

              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3 text-xs text-slate-600 dark:text-slate-300 leading-6 whitespace-pre-wrap break-words">
                {replyTarget.content}
              </div>

              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="以站长身份回复这条评论…"
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition resize-none"
              />

              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] text-slate-400">{replyContent.length} / 1000</span>
                <button
                  onClick={submitReply}
                  disabled={replying || !replyContent.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-500/30 hover:bg-indigo-600 transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {replying ? <Loader2 size={14} className="animate-spin" /> : <Reply size={14} />}
                  发布回复
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 删除确认 */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4"
            onClick={() => setDeleteTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-white/50 dark:border-white/10 shadow-2xl p-6 space-y-4"
            >
              <h3 className="text-lg font-black text-slate-900 dark:text-white">删除这条评论？</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-6">
                将永久删除「{deleteTarget.author_name}」的这条评论
                {deleteTarget.reply_count > 0 ? `，以及它的 ${deleteTarget.reply_count} 条回复` : ''}，不可恢复。
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 transition"
                >
                  取消
                </button>
                <button
                  onClick={() => removeOne(deleteTarget)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 transition"
                >
                  <Trash2 size={13} /> 确认删除
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
