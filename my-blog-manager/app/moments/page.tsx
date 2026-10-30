import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import MomentList from './MomentList';
import { getLiveSiteConfig } from '../../lib/siteConfigRuntime';
import { getMoments } from '../../lib/contentApi';

export async function generateMetadata() {
  const config = await getLiveSiteConfig();
  return {
    title: "说说 | " + config.authorName + " の 博客",
    description: "生活动态与瞬间记录",
  };
}

// 说说必须实时读工作副本：静态预渲染会把说说固化进构建产物，
// 发布后不重建控制台，刷新看到的还是旧说说。
export const dynamic = 'force-dynamic';

export default async function MomentsPage() {
  // 配置只决定标题、头像，跟说说列表没有依赖关系，并发取更省一个往返。
  const [config, allMoments] = await Promise.all([
    getLiveSiteConfig(),
    getMoments(),
  ]);

  return (
    <div className="min-h-screen relative pb-10 flex flex-col">
      <Navbar />
      <PageTransition className="flex-1 flex flex-col">
        <MomentList
          moments={allMoments}
          authorName={config.authorName}
          avatarUrl={config.avatarUrl}
        />
      </PageTransition>
    </div>
  );
}