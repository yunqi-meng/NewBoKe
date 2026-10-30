import Link from 'next/link';

import Navbar from '../components/Navbar';
import PageTransition from '../components/PageTransition';
import SearchBar from '../components/SearchBar';
import { getLiveSiteConfig } from '../lib/siteConfigRuntime';
import CloudPlayer from '../components/CloudPlayer';
import ThemeToggleBlock from '../components/ThemeToggleBlock';
import ProfileCard from '../components/ProfileCard';
import SiteDashboard from '../components/SiteDashboard';
import { getAlbums, getArticles } from '../lib/contentApi';
import LyricBar from '../components/LyricBar';
import { ToastProvider } from '../components/ToastProvider';

import LatestPostsCarousel from '../components/LatestPostsCarousel';
import LatestChatterCarousel from '../components/LatestChatterCarousel';
import DanmakuBackground from '../components/DanmakuBackground';

// 控制台首页要显示的是「工作副本」里的最新内容：
// 静态预渲染会把内容固化进构建产物，发布后不重建控制台就会一直显示旧文章。
export const dynamic = 'force-dynamic';

function formatUpdateTime(dateString: string) {
  if (!dateString || dateString === '1970-01-01') return '刚刚更新';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    if (hours === '00' && mins === '00') return `${year}.${month}.${day}`;
    return `${year}.${month}.${day} ${hours}:${mins}`;
  } catch { return dateString; }
}

export default async function Home() {
  // 配置和内容互不依赖，一起发出去：以前是「等配置回来再去要内容」，
  // 白白多串一次往返。
  const [config, postList, chatterList, albumList] = await Promise.all([
    getLiveSiteConfig(),
    getArticles('post'),
    getArticles('chatter'),
    getAlbums(),
  ]);

  const allPosts = postList.map((item) => ({
    slug: item.slug,
    title: item.title || '',
    description: item.description || '',
    cover: item.cover || config.defaultPostCover,
    tags: item.tags || [],
    date: item.date || '',
    formattedDate: formatUpdateTime(item.date || ''),
  }));
  const top5Posts = allPosts.length > 0 ? allPosts.slice(0, 5) : [{ slug: 'none', title: '暂无文章', description: '快去写第一篇吧！', cover: config.defaultPostCover, date: '', formattedDate: '' }];

  const allChatters = chatterList.map((item) => ({
    slug: item.slug,
    title: item.title || '碎片记录',
    description: item.description || '',
    cover: item.cover || 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=1000&auto=format&fit=crop',
    date: item.date || '',
    formattedDate: formatUpdateTime(item.date || ''),
  }));
  const top5Chatters = allChatters.length > 0 ? allChatters.slice(0, 5) : [{ slug: 'none', title: '暂无记录', description: '记录一段思绪...', cover: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=1000&auto=format&fit=crop', date: '', formattedDate: '' }];

  const chatterCount = allChatters.length;
  const realPhotoCount = albumList.reduce((total, album) => total + (album.photos?.length || 0), 0);
  const latestAlbum = albumList.length > 0 ? albumList[0] : { id: '', title: '照片墙', description: '查看摄影', cover: config.photoWallImage, date: '' };

  return (
    <ToastProvider>
      <div className="min-h-screen relative pb-10">
        <Navbar />
        <PageTransition>
          <div className="w-full max-w-6xl mx-auto mt-28 px-4 sm:px-10 relative z-10">
            <SearchBar posts={allPosts} />

            <main className="flex flex-col gap-6 w-full">
              {/* 第一行：个人信息 + 播放器 */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full items-stretch">
                <div className="md:col-span-7 flex">
                    <ProfileCard postCount={allPosts.length} chatterCount={chatterCount} photoCount={realPhotoCount}/>
                </div>

                {/* 🌟 核心修改：去掉乱七八糟的 Link 和层级，直接渲染 CloudPlayer */}
                <div className="md:col-span-5 flex">
                    <CloudPlayer/>
                </div>
              </div>

              {/* 歌词栏 */}
              <div className="w-full mt-[-10px]"><LyricBar/></div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full items-stretch">
                <div className="md:col-span-4 h-full">
                  <LatestPostsCarousel posts={top5Posts} />
                </div>
                <div className="md:col-span-8 flex flex-col gap-6 h-full">
                  <Link href="/photowall" className="flex-1 rounded-3xl bg-white/40 dark:bg-slate-800/50 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-xl overflow-hidden transition-all duration-700 hover:scale-[1.02] relative group min-h-[220px]">
                    <img src={latestAlbum.cover} loading="lazy" decoding="async" className="w-full h-full absolute inset-0 object-cover transition-transform duration-700 group-hover:scale-105 opacity-90"/>
                    <div className="absolute inset-0 bg-black/20 dark:bg-black/50 group-hover:bg-transparent transition-colors duration-500"></div>
                    <div className="absolute bottom-6 left-6 right-6">
                      <h3 className="text-3xl font-bold text-white mb-2 underline decoration-pink-400">{latestAlbum.title}</h3>
                      <p className="text-white/90 text-lg line-clamp-1">{latestAlbum.description}</p>
                    </div>
                  </Link>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 flex-1 min-h-[220px] items-stretch">
                    <div className="md:col-span-8 h-full">
                      <LatestChatterCarousel chatters={top5Chatters} />
                    </div>
                    <div className="md:col-span-4 h-full flex">
                      <ThemeToggleBlock />
                    </div>
                  </div>
                </div>
              </div>

              {/* 底部数据面板 */}
              <div className="w-full mt-2"><SiteDashboard/></div>
            </main>
          </div>
        </PageTransition>
      </div>
    </ToastProvider>
  );
}