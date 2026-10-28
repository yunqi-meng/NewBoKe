"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageSquareText, Send, Heart, Reply, ShieldCheck, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * 🌟 自建评论区
 *
 * 旧方案用 Gitalk（评论其实存在 GitHub Issues 里），控制台看不到、管不了。
 * 现在评论存在本机 SQLite，通过 /api/comments 与内容引擎通信：
 *   - 访客可以发表情、回复、点赞；
 *   - 控制台的「评论管理」页面能看到并审核这里的每一条评论。
 *
 * 用法：
 *   <Comments />                          // 主题自动取当前路由
 *   <Comments target="/posts/xxx" />      // 手动指定主题
 *   <Comments compact />                  // 说说卡片里的紧凑样式
 */

type CommentItem = {
  id: number;
  target: string;
  parent_id: number;
  author_name: string;
  content: string;
  status: string;
  is_admin: boolean;
  likes: number;
  created_at: string;
  replies?: CommentItem[];
};

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

const VISITOR_KEY = 'xh_comment_visitor';
const AUTHOR_KEY = 'xh_comment_author';
const LIKED_KEY = 'xh_comment_liked';
const PAGE_SIZE = 20;

const AVATAR_GRADIENTS = [
  'from-indigo-500 to-purple-500',
  'from-sky-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-violet-500 to-fuchsia-500',
];

function readStorage(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeStorage(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 隐私模式下 localStorage 可能不可用，忽略即可 */
  }
}

/** 访客标识：本地生成并长期保存，用于限流与后台溯源 */
function getVisitorToken(): string {
  const existing = readStorage(VISITOR_KEY);
  if (existing) return existing;
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  writeStorage(VISITOR_KEY, random);
  return random;
}

function avatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

function parseTime(value: string): Date | null {
  if (!value) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(value: string): string {
  const date = parseTime(value);
  if (!date) return value;
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 172_800_000) return '昨天';
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fullTime(value: string): string {
  const date = parseTime(value);
  if (!date) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function Comments({
  target,
  compact = false,
}: {
  target?: string;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const threadKey = useMemo(() => {
    const raw = (target ?? pathname ?? '/').trim() || '/';
    return raw.length > 1 ? raw.replace(/\/$/, '') : raw;
  }, [target, pathname]);

  const [items, setItems] = useState<CommentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<CommentSettings>(DEFAULT_SETTINGS);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [content, setContent] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackType, setFeedbackType] = useState<'success' | 'error'>('success');
  const [liked, setLiked] = useState<number[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 记住访客的昵称与邮箱，省得每次都填
  useEffect(() => {
    try {
      const stored = readStorage(AUTHOR_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (parsed?.name) setName(String(parsed.name));
      if (parsed?.email) setEmail(String(parsed.email));
    } catch {
      /* 忽略脏数据 */
    }
    try {
      setLiked(JSON.parse(readStorage(LIKED_KEY) || '[]'));
    } catch {
      setLiked([]);
    }
  }, []);

  const load = useCallback(
    async (nextPage: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError('');
      try {
        const query = `target=${encodeURIComponent(threadKey)}&page=${nextPage}&size=${PAGE_SIZE}`;
        const response = await fetch(`/api/comments?${query}`, { cache: 'no-store' });
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.message || '评论加载失败');
        }
        if (json.settings) setSettings({ ...DEFAULT_SETTINGS, ...json.settings });
        const incoming: CommentItem[] = json.data?.items || [];
        setItems((prev) => (append ? [...prev, ...incoming] : incoming));
        setTotal(json.data?.total || 0);
        setHasMore(Boolean(json.data?.has_more));
        setPage(nextPage);
      } catch (err) {
        setError(err instanceof Error ? err.message : '评论加载失败');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [threadKey],
  );

  useEffect(() => {
    setItems([]);
    setTotal(0);
    setHasMore(false);
    setReplyTo(null);
    load(1, false);
  }, [load]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = content.trim();
    if (!text) {
      setFeedbackType('error');
      setFeedback('说点什么再提交吧～');
      return;
    }
    if (!name.trim()) {
      setFeedbackType('error');
      setFeedback('留个昵称吧，方便大家认识你');
      return;
    }
    if (!settings.allowGuest && !email.trim()) {
      setFeedbackType('error');
      setFeedback('本站已关闭匿名留言，请填写邮箱后再提交');
      return;
    }

    setSubmitting(true);
    setFeedback('');
    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-visitor-token': getVisitorToken(),
        },
        body: JSON.stringify({
          target: threadKey,
          target_label: typeof document !== 'undefined' ? document.title : '',
          author_name: name.trim(),
          author_email: email.trim(),
          content: text,
          parent_id: replyTo?.id ?? 0,
          hp: honeypot,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setFeedbackType('error');
        setFeedback(json.message || '提交失败，请稍后再试');
        return;
      }
      setFeedbackType('success');
      setFeedback(json.message || '留言已发布');
      setContent('');
      setHoneypot('');
      setReplyTo(null);
      writeStorage(AUTHOR_KEY, JSON.stringify({ name: name.trim(), email: email.trim() }));
      if (json.data?.status === 'approved') {
        await load(1, false);
      }
    } catch {
      setFeedbackType('error');
      setFeedback('网络异常，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async (item: CommentItem) => {
    if (liked.includes(item.id)) return;
    // 先本地点亮，失败再回滚
    setLiked((prev) => [...prev, item.id]);
    writeStorage(LIKED_KEY, JSON.stringify([...liked, item.id]));
    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-visitor-token': getVisitorToken(),
        },
        body: JSON.stringify({ action: 'like', id: item.id }),
      });
      const json = await response.json();
      if (json.success && typeof json.data?.likes === 'number') {
        const likes = json.data.likes;
        setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, likes } : it)));
      }
    } catch {
      setLiked((prev) => prev.filter((id) => id !== item.id));
      writeStorage(LIKED_KEY, JSON.stringify(liked));
    }
  };

  const startReply = (item: CommentItem) => {
    setReplyTo(item);
    setFeedback('');
    window.setTimeout(() => textareaRef.current?.focus(), 30);
  };

  if (settings.enabled === false) {
    return (
      <div className="w-full mt-10 text-center text-sm text-slate-500 dark:text-slate-400">
        评论区已关闭
      </div>
    );
  }

  const bubble = compact
    ? 'text-[13px] leading-6'
    : 'text-sm md:text-[15px] leading-7';

  return (
    <div className="w-full mt-12 md:mt-16 relative">
      {/* 底部环境光晕，延续全站氛围 */}
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-indigo-500/10 dark:bg-indigo-500/20 blur-3xl rounded-full pointer-events-none z-0" />

      <div className="relative z-10 pt-6 border-t border-slate-200/50 dark:border-slate-700/50 space-y-6">
        {/* 标题 */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 md:w-11 md:h-11 rounded-xl md:rounded-2xl bg-indigo-500/10 flex items-center justify-center">
            <MessageSquareText className="text-indigo-500 w-5 h-5 md:w-6 md:h-6" />
          </div>
          <div>
            <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {settings.title}
            </h3>
            <p className="text-[11px] md:text-xs text-slate-500 dark:text-slate-400 font-medium">
              共 {total} 条留言 · 友善发言，彼此尊重
            </p>
          </div>
        </div>

        {settings.notice && (
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 text-xs md:text-sm text-indigo-700 dark:text-indigo-300 leading-6">
            {settings.notice}
          </div>
        )}

        {/* 发表评论 */}
        <form
          onSubmit={handleSubmit}
          className="rounded-3xl bg-white/60 dark:bg-slate-800/50 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-lg p-4 md:p-6 space-y-3"
        >
          <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="你的昵称 *"
              className="w-full bg-white/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={120}
              required={!settings.allowGuest}
              placeholder={settings.allowGuest ? '邮箱（选填，仅用于显示头像）' : '邮箱 *（本站需要邮箱才能留言）'}
              className="w-full bg-white/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
            />
          </div>

          {/* 蜜罐：真人看不见，机器人会填 */}
          <input
            type="text"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
          />

          {replyTo && (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 px-4 py-2 text-xs text-indigo-700 dark:text-indigo-300">
              <span className="truncate">
                正在回复 <strong>@{replyTo.author_name}</strong>
              </span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="shrink-0 underline underline-offset-2 hover:text-indigo-900 dark:hover:text-indigo-100"
              >
                取消
              </button>
            </div>
          )}

          <div className="relative">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={compact ? 3 : 4}
              maxLength={settings.maxLength}
              placeholder={settings.placeholder}
              className={`w-full bg-white/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition resize-none ${bubble}`}
            />
            <span className="absolute right-4 bottom-3 text-[10px] text-slate-400 tabular-nums">
              {content.length} / {settings.maxLength}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs">
              {feedback && (
                <span className={feedbackType === 'error' ? 'text-rose-500' : 'text-emerald-500'}>
                  {feedback}
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-500/30 hover:bg-indigo-600 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {submitting ? '发表中…' : '发表评论'}
            </button>
          </div>
        </form>

        {/* 列表 */}
        {loading && (
          <div className="flex items-center justify-center gap-3 py-10 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 size={16} className="animate-spin" />
            正在加载留言…
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-3 py-10 text-sm text-slate-500 dark:text-slate-400">
            <AlertTriangle size={18} className="text-amber-500" />
            <span>{error}</span>
            <button
              onClick={() => load(1, false)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs font-bold hover:border-indigo-400 transition"
            >
              <RefreshCw size={13} />
              重新加载
            </button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            还没有人留言，来抢个沙发吧～
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="space-y-4">
            {items.map((item) => (
              <CommentCard
                key={item.id}
                item={item}
                liked={liked.includes(item.id)}
                onLike={() => handleLike(item)}
                onReply={() => startReply(item)}
                compact={compact}
                bubble={bubble}
                allowLike={settings.allowLike}
              />
            ))}
          </div>
        )}

        {hasMore && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => load(page + 1, true)}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs font-bold hover:border-indigo-400 hover:text-indigo-500 transition disabled:opacity-60"
            >
              {loadingMore ? <Loader2 size={13} className="animate-spin" /> : null}
              {loadingMore ? '加载中…' : '加载更多留言'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CommentCard({
  item,
  liked,
  onLike,
  onReply,
  compact,
  bubble,
  allowLike,
}: {
  item: CommentItem;
  liked: boolean;
  onLike: () => void;
  onReply: () => void;
  compact: boolean;
  bubble: string;
  allowLike: boolean;
}) {
  return (
    <article className="rounded-3xl bg-white/60 dark:bg-slate-800/50 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-sm p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div
          className={`shrink-0 rounded-full bg-gradient-to-br ${avatarGradient(item.author_name)} text-white flex items-center justify-center font-black ${
            compact ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
          }`}
        >
          {item.author_name.slice(0, 1).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-800 dark:text-slate-100 text-sm break-all">
              {item.author_name}
            </span>
            {item.is_admin && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 text-[10px] font-bold">
                <ShieldCheck size={11} />
                站长
              </span>
            )}
            <span
              className="text-[11px] text-slate-400 dark:text-slate-500"
              title={fullTime(item.created_at)}
            >
              {formatTime(item.created_at)}
            </span>
          </div>

          <p className={`mt-2 text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words ${bubble}`}>
            {item.content}
          </p>

          <div className="mt-3 flex items-center gap-4 text-[11px] font-bold text-slate-400 dark:text-slate-500">
            {allowLike && (
              <button
                onClick={onLike}
                disabled={liked}
                className={`inline-flex items-center gap-1 transition ${
                  liked ? 'text-rose-500' : 'hover:text-rose-400'
                }`}
              >
                <Heart size={13} fill={liked ? 'currentColor' : 'none'} />
                {item.likes > 0 ? item.likes : '点赞'}
              </button>
            )}
            <button onClick={onReply} className="inline-flex items-center gap-1 hover:text-indigo-500 transition">
              <Reply size={13} />
              回复
            </button>
          </div>

          {item.replies && item.replies.length > 0 && (
            <div className="mt-4 border-l-2 border-indigo-500/20 pl-3 md:pl-4 space-y-3">
              {item.replies.map((reply) => (
                <div key={reply.id} className="rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-700 dark:text-slate-200 text-xs break-all">
                      {reply.author_name}
                    </span>
                    {reply.is_admin && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 text-[9px] font-bold">
                        <ShieldCheck size={10} />
                        站长
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">{formatTime(reply.created_at)}</span>
                  </div>
                  <p className={`mt-1.5 text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words ${bubble}`}>
                    {reply.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
