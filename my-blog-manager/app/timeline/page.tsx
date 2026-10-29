import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import { getLiveSiteConfig } from '../../lib/siteConfigRuntime';
import TimelineClient from '../../components/TimelineClient';
import { getArticles } from '../../lib/contentApi';

// 时间轴要实时读工作副本：静态预渲染会把文章列表固化进构建产物。
export const dynamic = 'force-dynamic';

export default async function Timeline() {
  const config = await getLiveSiteConfig();
  const tagCounts: Record<string, number> = {};

  // 文章列表直接来自数据库，和公开站的时间轴是同一份数据。
  const articles = await getArticles('post');

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
      cover: item.cover || config.defaultPostCover,
    };
  });

  const tagsArray = Object.keys(tagCounts)
    .map(name => ({ name, count: tagCounts[name] }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="min-h-screen relative pb-32">
      <Navbar />
      <PageTransition>
        <TimelineClient posts={posts} tags={tagsArray} />
      </PageTransition>
    </div>
  );
}