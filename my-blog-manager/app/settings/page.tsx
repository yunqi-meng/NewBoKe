"use client";

import { useState, useEffect } from 'react';
import BriefingSection from '../../components/settings/BriefingSection';
import { motion, AnimatePresence } from 'framer-motion';
import { useOperations } from '../../context/OperationContext';
import { siteConfig } from '../../siteConfig';
import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import { ToastProvider, useToast } from '../../components/ToastProvider';

import ProfileSection from '../../components/settings/ProfileSection';
import BackgroundSection from '../../components/settings/BackgroundSection';
import MusicSection from '../../components/settings/MusicSection';
import GallerySection from '../../components/settings/GallerySection';
import PublishSection from '../../components/settings/PublishSection';
import DisplaySection from '../../components/settings/DisplaySection';
import CommentSection from '../../components/settings/CommentSection';
import DanmakuSection from '../../components/settings/DanmakuSection';
import FooterSection from '../../components/settings/FooterSection';
// 👇 🌟 引入刚写的 AI 配置组件
import AICatSection from '../../components/settings/AICatSection';

function SettingsContent() {
  const { operations, addOperation } = useOperations();
  const [activeTab, setActiveTab] = useState('profile');
  const [briefingVisited, setBriefingVisited] = useState(false);
  const [backendMode, setBackendMode] = useState<'checking' | 'preview' | 'live' | 'offline'>('checking');
  const { showToast } = useToast();
  useEffect(() => {
    const readTab = () => {
      const tab = new URLSearchParams(window.location.search).get('tab');
      if (tab && ['profile', 'display', 'background', 'music', 'gallery', 'footer', 'danmaku', 'comment', 'aicat', 'publish', 'briefing'].includes(tab)) {
        setActiveTab(tab);
        if (tab === 'briefing') setBriefingVisited(true);
      }
    };
    readTab();
    window.addEventListener('popstate', readTab);
    return () => window.removeEventListener('popstate', readTab);
  }, []);
  function selectTab(tab: string) {
    setActiveTab(tab);
    if (tab === 'briefing') setBriefingVisited(true);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState(null, '', url);
  }

  const [formData, setFormData] = useState<any>({
    authorName: siteConfig.authorName || "",
    bio: siteConfig.bio || "",
    avatarUrl: siteConfig.avatarUrl || "",
    social: siteConfig.social || {},
    bgImages: [...(siteConfig.bgImages || [])],
    // 👇 🌟 壁纸分组系统初始化
    bgGroups: ((siteConfig as any).bgGroups || []).map((g: any) => ({ ...g, images: [...(g.images || [])] })),
    activeBgGroup: (siteConfig as any).activeBgGroup || 'default',
    gitalkConfig: siteConfig.gitalkConfig || {
      clientID: '',
      clientSecret: '',
      repo: '',
      owner: '',
      admin: []
    },
    danmakuList: [...(siteConfig.danmakuList || [])],
    buildDate: siteConfig.buildDate || "2026-03-23T00:00:00",
    icpConfig: siteConfig.icpConfig || { name: "", link: "" },
    footerBadges: [...(siteConfig.footerBadges || [])],
    // 👇 🌟 初始化小猫 AI 配置数据
    geminiConfig: siteConfig.geminiConfig || {
      modelId: 'gemini-2.5-flash-lite',
      systemPrompt: '',
      maxOutputTokens: 150,
      temperature: 0.85
    }
  });

  useEffect(() => {
    const controller = new AbortController();
    const fetchRealConfig = async () => {
      try {
        const configRes = await fetch(`/backend_config.json?t=${Date.now()}`, { signal: controller.signal });
        if (!configRes.ok) throw new Error('无法读取本机连接设置');
        const configData = await configRes.json();
        if (configData.previewOnly === true) {
          setBackendMode('preview');
          return;
        }

        const res = await fetch(`/api/proxy/api/config/get`, { cache: 'no-store', signal: controller.signal });
        if (!res.ok) throw new Error('网站设置服务尚未就绪');
        const data = await res.json();

        if (data.success && data.data) {
          setFormData((prev: any) => ({
            ...prev,
            ...data.data,
            social: { ...(prev.social || {}), ...(data.data.social || {}) },
            gitalkConfig: { ...(prev.gitalkConfig || {}), ...(data.data.gitalkConfig || {}) },
            // 👇 🌟 合并后端发来的壁纸分组数据
            bgGroups: data.data.bgGroups?.length ? data.data.bgGroups : prev.bgGroups,
            activeBgGroup: data.data.activeBgGroup || prev.activeBgGroup,
            danmakuList: data.data.danmakuList ? [...data.data.danmakuList] : prev.danmakuList,
            buildDate: data.data.buildDate || prev.buildDate,
            icpConfig: data.data.icpConfig || prev.icpConfig,
            footerBadges: data.data.footerBadges ? [...data.data.footerBadges] : prev.footerBadges,
            // 👇 🌟 合并后端发来的小猫配置
            geminiConfig: { ...(prev.geminiConfig || {}), ...(data.data.geminiConfig || {}) }
          }));
          setBackendMode('live');
        } else {
          setBackendMode('offline');
        }
      } catch (error) {
        if (!controller.signal.aborted) setBackendMode('offline');
      }
    };

    fetchRealConfig();
    return () => controller.abort();
  }, []);

  const handleUpdate = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const pushToQueue = (label: string, key?: string, value?: any) => {
    addOperation({
      id: Date.now().toString(),
      type: 'CONFIG',
      label: `配置暂存：${label}`,
      description: `修改了系统的 ${label}，等待同步至 my-blog`,
      timestamp: new Date().toLocaleTimeString().slice(0, 5),
      payload: formData,
      key: key,
      value: value
    });
    showToast(`🎉 【${label}】已加入右上角操作队列！`, "success");
  };

  // 👇 🌟 在菜单里增加 AI 猫咪入口
  const menuItems = [
    { id: 'profile', name: '个人名片设置', icon: '👤' },
    { id: 'briefing', name: '每日选刊', icon: '📖' },
    { id: 'display', name: '视窗画面设置', icon: '🪟' },
    { id: 'background', name: '视觉背景配置', icon: '🌌' },
    { id: 'music', name: '音乐播放设置', icon: '🎵' },
    { id: 'gallery', name: '图库配置管理', icon: '🖼️' },
    { id: 'footer', name: '首页底部设置', icon: '🧩' },
    { id: 'danmaku', name: '全站弹幕设置', icon: '⚡' },
    { id: 'comment', name: '评论系统配置', icon: '💬' },
    { id: 'aicat', name: 'AI 煤球配置', icon: '🐾' }, // 👈 新增的小猫设置
    { id: 'publish', name: '线上发布', icon: '🚀' },
  ];


  return (
    <div className="min-h-screen relative pb-10">
      <Navbar compact previewOnly={backendMode !== 'live'} />

      <PageTransition>
        <main className="w-[95%] max-w-7xl mx-auto mt-24 flex flex-col md:flex-row gap-8 items-start relative z-10">

          <div className="w-full md:w-60 shrink-0 flex flex-col gap-4">
            <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-white/50 dark:border-slate-800/50 rounded-3xl p-4 shadow-xl">
              <h1 className="mb-4 ml-2 text-base font-bold text-slate-700 dark:text-slate-200">网站控制台</h1>
              <nav aria-label="网站控制台设置" className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">

                {menuItems.map((item) => (
                  <button key={item.id} aria-current={activeTab === item.id ? 'page' : undefined} onClick={() => selectTab(item.id)} className={`flex shrink-0 items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 font-bold text-sm ${activeTab === item.id ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 translate-x-1' : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50'}`}>
                    <span>{item.icon}</span>{item.name}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          <div className="min-w-0 flex-1 w-full">
            {backendMode !== 'live' && <div role="status" className="mb-6 rounded-2xl border border-amber-200/60 bg-amber-50/80 px-5 py-4 text-xs leading-7 text-amber-800 dark:border-amber-400/20 dark:bg-amber-950/40 dark:text-amber-200">{backendMode === 'checking' ? '正在检查本机连接…' : backendMode === 'preview' ? '当前是统一控制台的本地预览：每日选刊可以保存；其他原有栏目可只读查看。网站同步、发布和现有每日任务保持原样。' : '网站通用设置后台尚未连接，暂时只读。每日选刊使用自己的本机连接，可在该栏目检查状态。'}{backendMode === 'offline' && <button className="ml-3 underline" onClick={() => window.location.reload()}>重新检测</button>}</div>}
            {briefingVisited && <div hidden={activeTab !== 'briefing'}><BriefingSection /></div>}
            <fieldset disabled={backendMode !== 'live'} hidden={activeTab === 'briefing'} className="min-w-0 w-full border-0 p-0">
            <AnimatePresence mode="wait">
              {activeTab === 'profile' && <ProfileSection key="profile" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {activeTab === 'display' && <DisplaySection key="display" showToast={showToast} />}
              {activeTab === 'background' && <BackgroundSection key="background" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {activeTab === 'music' && <MusicSection key="music" showToast={showToast} />}
              {activeTab === 'gallery' && <GallerySection key="gallery" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {activeTab === 'footer' && <FooterSection key="footer" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {activeTab === 'danmaku' && <DanmakuSection key="danmaku" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {activeTab === 'comment' && <CommentSection key="comment" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {/* 👇 🌟 挂载 AI 猫咪面板 */}
              {activeTab === 'aicat' && <AICatSection key="aicat" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}

              {activeTab === 'publish' && backendMode === 'live' && <PublishSection key="publish" />}
            </AnimatePresence>
            </fieldset>
            {activeTab === 'publish' && backendMode !== 'live' && <section className="rounded-3xl border border-white/60 bg-white/60 p-8 text-sm leading-8 text-slate-600 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300"><h2 className="mb-3 text-lg font-semibold">线上发布</h2>发布功能需要连接网站通用后台。此副本尚未接通，接通后可以在这里查看线上状态并一键发布；当前不会执行任何发布动作。</section>}
          </div>

        </main>
      </PageTransition>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ToastProvider>
      <SettingsContent />
    </ToastProvider>
  );
}
