import type { Metadata } from 'next';
import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import FriendsBoard from './FriendsBoard';
import { liveMetadata } from '../../lib/pageMetadata';
import { getFriends } from '../../lib/contentApi';

export async function generateMetadata(): Promise<Metadata> {
  return liveMetadata('友链', '赛博空间里的有趣灵魂');
}

export default async function FriendsPage() {
  const friends = await getFriends();

  return (
    <div className="min-h-screen relative pb-20">
      <Navbar />
      <PageTransition>
        <div className="mt-28">
          <FriendsBoard friends={friends} />
        </div>
      </PageTransition>
    </div>
  );
}
