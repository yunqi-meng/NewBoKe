import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import ChatterBoard from './ChatterBoard';
import { getArticles } from '../../lib/contentApi';

export const metadata = {
  title: "杂谈 | XingHuiSama の 博客",
  description: "日常碎片与灵感记录",
};

// 杂谈列表要实时读工作副本：静态预渲染会把列表固化进构建产物。
export const dynamic = 'force-dynamic';

export default async function ChatterPage() {
  // 杂谈直接来自数据库，和公开站看到的是同一份内容。
  const articles = await getArticles('chatter', true);

  const chatters = articles.map((item) => ({
    slug: item.slug,
    title: item.title || '',
    date: item.date || '1970-01-01',
    tags: item.tags || [],
    mood: item.mood || '',
    cover: item.cover || '',
    content: (item.content || '').replace(/^#+ .*\n/m, ''),
  }));

  return (
    <div className="min-h-screen relative pb-10">
      <Navbar />
      <PageTransition>
        <ChatterBoard chatters={chatters} />
      </PageTransition>
    </div>
  );
}