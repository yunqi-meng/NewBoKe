import type { Metadata } from 'next';
import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import { getLiveSiteConfig } from '../../lib/siteConfigRuntime';
import { getArticles } from '../../lib/contentApi';
import { liveMetadata } from '../../lib/pageMetadata';
import TimelineClient from '../../components/TimelineClient';
// 🌟 1. 引入 ToastProvider 喵！
import { ToastProvider } from '../../components/ToastProvider';

export async function generateMetadata(): Promise<Metadata> {
  return liveMetadata('归档与探索');
}

export default async function Timeline() {
  const [siteConfig, articles] = await Promise.all([
    getLiveSiteConfig(),
    getArticles('post'),
  ]);

  const tagCounts: Record<string, number> = {};
  const posts = articles.map((item) => {
    const postTags = item.tags && item.tags.length > 0 ? item.tags : ['未分类'];
    postTags.forEach((tag) => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });

    return {
      slug: item.slug,
      title: item.title || '无标题',
      date: item.date || '1970-01-01',
      description: item.description || '',
      tags: postTags,
      cover: item.cover || siteConfig.defaultPostCover,
    };
  });

  // 后端已经按日期倒序返回；这里再排一次，保证同一日期下按 slug 倒序，行为与旧版一致
  posts.sort((a, b) => {
    const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
    return dateDiff !== 0 ? dateDiff : b.slug.localeCompare(a.slug);
  });

  const tagsArray = Object.keys(tagCounts)
    .map(name => ({ name, count: tagCounts[name] }))
    .sort((a, b) => b.count - a.count);

  return (
    // 🌟 2. 在最外层用 ToastProvider 包裹整个页面
    <ToastProvider>
      <div className="min-h-screen relative pb-32">
        <Navbar />
        <PageTransition>
          <TimelineClient posts={posts} tags={tagsArray} />
        </PageTransition>
      </div>
    </ToastProvider>
  );
}
