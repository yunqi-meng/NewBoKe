import type { Metadata } from 'next';
import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import ChatterBoard from './ChatterBoard';
import { getArticles } from '../../lib/contentApi';
import { liveMetadata } from '../../lib/pageMetadata';


export async function generateMetadata(): Promise<Metadata> {
  return liveMetadata('杂谈', '日常碎片与灵感记录');
}

export default async function ChatterPage() {
  // 杂谈正文存在统一后端的数据库里，这里直接取列表
  const items = await getArticles('chatter', true);
  const chatters = items.map(item => ({
    slug: item.slug,
    title: item.title || '',
    date: item.date || '未知时间',
    tags: item.tags || [],
    mood: item.mood || '',
    cover: item.cover || '',
    // 去掉开头的 markdown 标题，避免卡片上出现重复的大标题
    content: (item.content || '').replace(/^#+ .*\n/m, ''),
  }));

  return (
    <div className="min-h-screen relative pb-10">
      <Navbar />
      <PageTransition>
        {/* 将解析好的数据传递给客户端组件进行瀑布流渲染 */}
        <ChatterBoard chatters={chatters} />
      </PageTransition>
    </div>
  );
}
