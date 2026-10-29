import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import MomentList from './MomentList';
import { getLiveSiteConfig } from '../../lib/siteConfigRuntime';
import { managerPath } from '../../lib/managerRoot';

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
  const config = await getLiveSiteConfig();
  let allMoments: any[] = [];

  try {
    // 🌟 终极防漏绝招：同时扫描两个可能的文件夹，把所有的说说都抓出来！
    const possibleDirs = [
      managerPath('posts', 'moments'),
      managerPath('moments')
    ];

    possibleDirs.forEach(dir => {
      if (fs.existsSync(dir)) {
        const fileNames = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
        fileNames.forEach(fileName => {
          const fullPath = path.join(dir, fileName);
          const { data, content } = matter(fs.readFileSync(fullPath, 'utf8'));

          allMoments.push({
            id: fileName.replace(/\.md$/, ''),
            date: data.date || '1970-01-01',
            location: data.location || '',
            images: data.images || [],
            content: content.trim()
          });
        });
      }
    });

    // 去重，防止你在两个文件夹放了同名文件
    allMoments = Array.from(new Map(allMoments.map(item => [item.id, item])).values());

  } catch (e) {
    console.error("读取说说数据失败:", e);
  }

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