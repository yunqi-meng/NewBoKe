import type { Metadata } from 'next';
import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import MomentList from './MomentList';
import { getLiveSiteConfig } from '../../lib/siteConfigRuntime';
import { getMoments } from '../../lib/contentApi';
import { liveMetadata } from '../../lib/pageMetadata';

export async function generateMetadata(): Promise<Metadata> {
  return liveMetadata('说说', '生活动态与瞬间记录');
}

export default async function MomentsPage() {
  const [siteConfig, moments] = await Promise.all([
    getLiveSiteConfig(),
    getMoments(),
  ]);

  return (
    <div className="min-h-screen relative pb-10 flex flex-col">
      <Navbar />
      <PageTransition className="flex-1 flex flex-col">
        <MomentList
          moments={moments}
          authorName={siteConfig.authorName}
          avatarUrl={siteConfig.avatarUrl}
        />
      </PageTransition>
    </div>
  );
}
