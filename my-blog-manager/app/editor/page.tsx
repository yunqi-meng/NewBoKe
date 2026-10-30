"use client";

import React, { useState, useRef, useEffect, useMemo, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { withBasePath } from '../../lib/consoleBasePath';
import { useSearchParams, useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar';
import type { RichTextEditorHandle } from '../../components/editor/RichTextEditor';
import MetaMatrix from '../../components/editor/MetaMatrix';
import FloatingImageTool from '../../components/editor/FloatingImageTool';
import PageTransition from '../../components/PageTransition';
import { ArrowLeft, AlertTriangle, Save, LogOut } from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { publishArticle, saveDraft } from '../../lib/contentMutations';
import { motion, AnimatePresence } from 'framer-motion';

// 富文本编辑器体积大（Tiptap/ProseMirror/lowlight），拆成独立 chunk 按需加载
const RichTextEditor = dynamic(
  () => import('../../components/editor/RichTextEditor'),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col h-full w-full p-12 gap-6 animate-pulse">
        <div className="h-14 w-3/4 bg-slate-200/50 dark:bg-slate-700/40 rounded-2xl" />
        <div className="h-10 w-full bg-slate-200/40 dark:bg-slate-700/30 rounded-2xl" />
        <div className="space-y-4 flex-1">
          <div className="h-4 w-full bg-slate-200/40 dark:bg-slate-700/30 rounded" />
          <div className="h-4 w-5/6 bg-slate-200/40 dark:bg-slate-700/30 rounded" />
          <div className="h-4 w-2/3 bg-slate-200/40 dark:bg-slate-700/30 rounded" />
        </div>
      </div>
    ),
  }
);

/** 落盘/加载完成后的「干净基线」快照；与当前字段对比得到 isDirty */
function snapshotFields(s: {
  title: string; tags: string[]; cover: string; summary: string; mood: string;
}) {
  return JSON.stringify({ title: s.title, tags: s.tags, cover: s.cover, summary: s.summary, mood: s.mood });
}

type DocType = 'post' | 'chatter' | 'about';

function EditorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { showToast } = useToast();

  const [docType, setDocType] = useState<DocType>(
    (searchParams.get('type') as DocType) || 'post'
  );
  // 新建草稿第一次保存后，后端会分配一个真实 id。用 ref 记住它，
  // 否则后续再点「存草稿」仍会带着 id=null 提交，每存一次就多出一条重复草稿。
  const initialDocId =
    searchParams.get('type') === 'about' ? 'about' : (searchParams.get('id') || 'new');
  const docIdRef = useRef(initialDocId);

  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [cover, setCover] = useState('');
  const [summary, setSummary] = useState('');
  const [mood, setMood] = useState('');
  const [content, setContent] = useState('');
  const [date, setDate] = useState('');

  const [historyPostTags, setHistoryPostTags] = useState<string[]>([]);
  const [historyChatterTags, setHistoryChatterTags] = useState<string[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState(true);
  const historyMoods = ['开心', '疲惫', '平静', '激动', 'Emo'];

  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(initialDocId !== 'new');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [isImgToolOpen, setIsImgToolOpen] = useState(false);
  const [imgToolTarget, setImgToolTarget] = useState<'editor' | 'cover'>('editor');

  const editorRef = useRef<RichTextEditorHandle>(null);

  // 正文不在 React 受控里（避免 setContent 打断光标），用 bodyDirty + 字段基线判断脏状态
  const [bodyDirty, setBodyDirty] = useState(false);
  const fieldsBaselineRef = useRef<string>('');
  const [exitModalOpen, setExitModalOpen] = useState(false);

  const fieldsSnapshot = useMemo(
    () => snapshotFields({ title, tags, cover, summary, mood }),
    [title, tags, cover, summary, mood]
  );
  const hasUnsavedChanges = bodyDirty || fieldsSnapshot !== fieldsBaselineRef.current;

  const refreshBaseline = () => {
    fieldsBaselineRef.current = snapshotFields({
      title, tags, cover, summary, mood
    });
    setBodyDirty(false);
  };

  useEffect(() => {
    const fetchTags = async () => {
      setIsLoadingTags(true);
      try {
        const res = await fetch(withBasePath(`/api/proxy/api/tags`));
        const data = await res.json();
        if (data.success) {
          setHistoryPostTags(data.postTags || []);
          setHistoryChatterTags(data.chatterTags || []);
        }
      } catch (e) { console.error(e); }
      finally { setIsLoadingTags(false); }
    };
    fetchTags();
  }, []);

  useEffect(() => {
    if (initialDocId !== 'new') {
      const loadDraft = async () => {
        setIsLoadingDraft(true);
        try {
          const res = await fetch(withBasePath(`/api/proxy/api/drafts/get`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: initialDocId, type: docType })
          });

          const data = await res.json();
          if (data.success) {
            if (data.draft.type) setDocType(data.draft.type as DocType);
            setDate(data.draft.date || '');
            setTitle(data.draft.type === 'about' ? '关于我' : (data.draft.title || ''));
            setTags(data.draft.tags || []);
            setCover(data.draft.cover || '');
            setSummary(data.draft.description || '');
            setMood(data.draft.mood || '');
            setContent(data.draft.content || '');
            showToast("✅ 已读取本地源数据", "success");
          } else {
             showToast(data.message || "❌ 未找到草稿或原文件", "error");
          }
        } catch { showToast("❌ 读取失败", "error"); }
        finally { setIsLoadingDraft(false); }
      };
      loadDraft();
    }
    // 仅按文档 id 拉取一次；docType/showToast 稳定无影响
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDocId]);

  // 仅在「草稿加载结束」这一刻写基线；之后字段再变靠 useMemo 判脏，不要在这里刷基线
  useEffect(() => {
    if (isLoadingDraft) return;
    fieldsBaselineRef.current = snapshotFields({ title, tags, cover, summary, mood });
    setBodyDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingDraft]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleBack = () => {
    // 直接打开编辑器（history 里没有上一页）时 router.back 会离开控制台
    if (window.history.length <= 1) {
      router.push(withBasePath('/drafts'));
    } else {
      router.back();
    }
  };

  const handleBackClick = () => {
    if (hasUnsavedChanges) {
      setExitModalOpen(true);
    } else {
      handleBack();
    }
  };

  const handleSave = async (isPublish: boolean, shouldExitAfterSave: boolean = false) => {
    if (isSaving) return;
    if (!title.trim() && docType !== 'about') {
      showToast("⚠️ 请填写标题", "warning"); return;
    }
    const payload = {
      id: docType === 'about' ? 'about' : (docIdRef.current === 'new' ? null : docIdRef.current),
      type: docType, title, tags, cover, mood, description: summary,
      content: editorRef.current?.getContent() || '',
      date: date || new Date().toISOString().split('T')[0],
      published: isPublish
    };

    // 保存即生效：存草稿只进草稿箱，正式发布直接写进文章表，公开站刷新就能看到。
    // 不再攒「待处理操作」，也就不存在忘了点发布导致改动一直不上线的情况。
    setIsSaving(true);
    try {
      const result = isPublish ? await publishArticle(payload) : await saveDraft(payload);
      if (!result.ok) {
        showToast(`❌ ${isPublish ? '发布' : '保存'}失败：${result.message}`, 'error');
        return;
      }

      const nextId = result.data?.id;
      if (typeof nextId === 'string' && nextId) docIdRef.current = nextId;
      setLastSaved(new Date().toLocaleTimeString());
      refreshBaseline();
      showToast(isPublish ? '🚀 已发布，公开站实时生效' : '💾 草稿已落盘', 'success');

      if (shouldExitAfterSave) {
        setExitModalOpen(false);
        handleBack();
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Ctrl+S / Cmd+S：等同「存为草稿」（不是发布）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!isSaving) void handleSave(false, false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div className="h-screen w-screen overflow-hidden relative flex flex-col">

      <AnimatePresence>
        {exitModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setExitModalOpen(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-sm bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-[40px] shadow-2xl border border-white/50 dark:border-white/10 p-10 text-center overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-transparent via-yellow-500 to-transparent opacity-50" />
              <div className="w-20 h-20 bg-yellow-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6"><AlertTriangle className="w-10 h-10 text-yellow-500" /></div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">存在未保存的数据</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-8 leading-relaxed">你的研究尚未记录，<br />直接离开将会导致这些数据消散在虚空中。</p>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => handleSave(false, true)}
                  disabled={isSaving}
                  className="w-full py-4 bg-indigo-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-500/30 hover:bg-indigo-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save size={16} /> {isSaving ? '保存中…' : '存为草稿并离开'}
                </button>
                <div className="flex gap-3">
                  <button onClick={() => setExitModalOpen(false)} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all">取消</button>
                  <button onClick={() => { setExitModalOpen(false); setBodyDirty(false); fieldsBaselineRef.current = fieldsSnapshot; handleBack(); }} className="flex-1 py-4 bg-red-500/10 text-red-500 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2">
                    <LogOut size={16} /> 强行抛弃
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 未保存提示只挡导航链接，主题切换/推送等按钮保持可点 */}
      <div className="relative z-50">
        <Navbar unsavedGuard={hasUnsavedChanges} onGuardClick={() => setExitModalOpen(true)} />
      </div>

      <PageTransition className="flex-1 min-h-0">
        <main className="mx-auto w-[96%] max-w-[1750px] flex flex-col lg:flex-row gap-6 relative mt-[100px] lg:mt-[144px] h-auto lg:h-[calc(100vh-144px-32px)] lg:mb-8 overflow-y-auto lg:overflow-hidden pb-8">

          <button
            onClick={handleBackClick}
            className="lg:absolute -top-14 left-2 px-5 py-2.5 bg-white/40 dark:bg-slate-800/60 backdrop-blur-md border border-white/50 dark:border-white/10 rounded-2xl shadow-lg flex items-center gap-2 text-slate-700 dark:text-slate-200 font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all group z-50 shrink-0 self-start"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform text-indigo-500" />
            返回上一级
          </button>

          <section className="flex-1 min-h-[50vh] lg:min-h-0 bg-white/30 dark:bg-slate-800/40 backdrop-blur-[60px] rounded-[50px] shadow-2xl border border-white/30 dark:border-white/10 flex flex-col overflow-hidden">
            {isLoadingDraft ? (
              <div className="flex flex-col h-full w-full p-12 gap-6 animate-pulse" aria-busy="true" aria-label="正在加载草稿">
                <div className="h-14 w-3/4 bg-slate-200/50 dark:bg-slate-700/40 rounded-2xl" />
                <div className="h-10 w-full bg-slate-200/40 dark:bg-slate-700/30 rounded-2xl" />
                <div className="space-y-4 flex-1">
                  <div className="h-4 w-full bg-slate-200/40 dark:bg-slate-700/30 rounded" />
                  <div className="h-4 w-5/6 bg-slate-200/40 dark:bg-slate-700/30 rounded" />
                  <div className="h-4 w-2/3 bg-slate-200/40 dark:bg-slate-700/30 rounded" />
                </div>
              </div>
            ) : (
              <RichTextEditor
                ref={editorRef}
                title={title}
                setTitle={(val) => setTitle(val)}
                initialContent={content}
                isTitleLocked={docType === 'about'}
                onOpenImageTool={() => { setImgToolTarget('editor'); setIsImgToolOpen(true); }}
                onChange={() => setBodyDirty(true)}
              />
            )}
          </section>

          <aside className="w-full lg:w-[360px] shrink-0 bg-white/30 dark:bg-slate-800/40 backdrop-blur-[60px] rounded-[50px] shadow-2xl border border-white/30 dark:border-white/10 flex flex-col overflow-hidden max-h-[70vh] lg:max-h-none">
            <MetaMatrix
              type={docType} tags={tags} setTags={setTags} cover={cover} setCover={setCover} summary={summary} setSummary={setSummary} mood={mood} setMood={setMood}
              allHistoryPostTags={historyPostTags} allHistoryChatterTags={historyChatterTags} isLoadingTags={isLoadingTags}
              allHistoryMoods={historyMoods} onSave={(isPublish) => handleSave(isPublish, false)} isSaving={isSaving || isLoadingDraft} lastSaved={lastSaved} onOpenImageTool={() => { setImgToolTarget('cover'); setIsImgToolOpen(true); }}
            />
          </aside>
        </main>
      </PageTransition>
      <FloatingImageTool isOpen={isImgToolOpen} onClose={() => setIsImgToolOpen(false)} onInsert={(url) => {
        if (imgToolTarget === 'editor') { editorRef.current?.insertImage(url); if (!cover) setCover(url); }
        else { setCover(url); setIsImgToolOpen(false); }
        setBodyDirty(true);
      }} />
    </div>
  );
}

// 在底部暴露真正的 EditorPage，并用 Suspense 把里面的内容套起来
export default function EditorPage() {
  return (
    <Suspense fallback={
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
          <p className="text-slate-500 font-bold tracking-widest text-sm uppercase">加载编辑器内核中...</p>
        </div>
      </div>
    }>
      <EditorContent />
    </Suspense>
  );
}
