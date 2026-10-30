import Link from 'next/link';
import { notFound } from 'next/navigation';

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm'; // 🌟 核心引入：支持删除线和表格等 GFM 语法
import remarkRehype from 'remark-rehype';
import rehypeHighlight from 'rehype-highlight';
import rehypeStringify from 'rehype-stringify';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// 引入高亮主题 + 数学公式样式（页面级引入，不再挂在全站 layout）
import 'highlight.js/styles/atom-one-dark.css';
import 'katex/dist/katex.min.css';

import Navbar from '../../../components/Navbar';
import PageTransition from '../../../components/PageTransition';
import { getLiveSiteConfig } from '../../../lib/siteConfigRuntime';
import { getArticle, getArticles } from '../../../lib/contentApi';
import ClientSocials from '../../../components/ClientSocials';
import ClientTOC from '../../../components/ClientTOC';
import BackButton from '../../../components/BackButton';
import Comments from '../../../components/Comments';
import SidebarLyric from '../../../components/SidebarLyric';
import { getHeadingId, rehypeHeadingIds } from '../../../lib/headingSlug';

// 详情页按需生成后缓存 60 秒：重复访问不再每次跑 Markdown 管线；
// 发布时后端会调 /api/revalidate 让 'content' 标签下的内容立刻失效
export const revalidate = 60;

/**
 * 构建时预渲染现有文章；后端不可达时返回空列表，其余 slug 仍按需生成并缓存。
 */
export async function generateStaticParams() {
  try {
    const posts = await getArticles('post');
    return posts
      .filter((post) => post.slug)
      .map((post) => ({ slug: post.slug }));
  } catch {
    return [];
  }
}

function extractToc(content: string) {
  const toc = [];
  let fence: { marker: string; length: number } | null = null;
  for (const line of content.split(/\r?\n/)) {
    const delimiter = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (delimiter) {
      const marker = delimiter[1][0];
      if (!fence) {
        if (marker !== '`' || !delimiter[2].includes('`')) {
          fence = { marker, length: delimiter[1].length };
          continue;
        }
      } else if (marker === fence.marker && delimiter[1].length >= fence.length && !delimiter[2].trim()) {
        fence = null;
        continue;
      }
    }
    if (fence) continue;
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      const text = match[2].trim();
      // id 与服务端 rehypeHeadingIds / 客户端 getHeadingId 同一套规则
      toc.push({ level: match[1].length, text, id: getHeadingId(text) });
    }
  }
  return toc;
}

async function getPostData(slug: string) {
  const siteConfig = await getLiveSiteConfig();
  const article = await getArticle(slug);
  if (!article) {
    notFound();
  }

  let content = article.content || '';

  // ==========================================
  // 🌟 前台渲染清洗区：终极防吞换行补丁！
  // ==========================================

  // 1. 强行修复数字列表缺少空格导致无法渲染为列表的 Bug (1.百度 -> 1. 百度)
  content = content.replace(/^(\s*\d+)\.([^ \n])/gm, '$1. $2');

  // 2. 🌟 拯救被 Markdown 引擎吞噬的“连续空行”！
  // 统一换行符，并清理纯空格的废弃空行
  content = content.replace(/\r\n/g, '\n').replace(/^[ \t]+$/gm, '');

  // 将代码块切开保护，只处理正文的连续空行！
  const blocks = content.split(/(```[\s\S]*?```)/g);
  content = blocks.map((block, index) => {
    // 奇数索引是代码块，原样返回，绝对不碰！
    if (index % 2 === 1) return block;

    // 偶数索引是正文。把 3 个以上的连续 \n 替换为真实的 <br/> 标签。
    // （3 个 \n 相当于中间空了 1 行真正的空白）
    return block.replace(/\n{3,}/g, (match) => {
      const brCount = match.length - 2;
      return '\n\n' + '<br/>'.repeat(brCount) + '\n\n';
    });
  }).join('');

  // ==========================================

  const processedContent = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    // 🌟 allowDangerousHtml 必须开启，这样上面生成的 <br/> 才能顺利通过变成真正的换行！
    .use(remarkRehype, { allowDangerousHtml: true })
    // 🌟 核心升级：开启代码语言自动侦测，并限制白名单，大幅提高 C++ 和常用语言的猜中率！
    .use(rehypeHighlight, {
      detect: true,
      ignoreMissing: true,
      subset: ['cpp', 'c', 'python', 'java', 'javascript', 'typescript', 'go', 'rust', 'bash', 'json', 'html', 'css', 'sql', 'xml']
    })
    .use(rehypeKatex)
    // 服务端给标题打 id：#anchor 深链首屏即可命中
    .use(rehypeHeadingIds)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(content);

  return {
    slug,
    contentHtml: processedContent.toString(),
    toc: extractToc(content),
    title: article.title,
    date: article.date,
    tags: Array.isArray(article.tags) ? article.tags : [],
    cover: article.cover || siteConfig.defaultPostCover
  };
}

async function getRecentPosts(currentSlug: string) {
  const posts = await getArticles('post');
  return posts
    .filter(p => p.slug !== currentSlug)
    .slice(0, 3)
    .map(p => ({ slug: p.slug, title: p.title || '无标题', date: p.date }));
}

export default async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  // 三件事互不依赖，一起发出去，别让页面排队等三个来回
  const [siteConfig, postData, recentPosts] = await Promise.all([
    getLiveSiteConfig(),
    getPostData(resolvedParams.slug),
    getRecentPosts(resolvedParams.slug),
  ]);

  return (
    <div className="min-h-screen relative pb-20">
      <Navbar />
      <PageTransition>
        <main className="w-[95%] md:w-[90%] max-w-6xl mx-auto mt-24 md:mt-28 flex flex-col lg:flex-row gap-6 md:gap-8 relative z-10">

          <article className="flex-1 bg-white/60 dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/40 dark:border-white/10 overflow-hidden transition-colors duration-700">
            <div className="w-full aspect-video bg-slate-200 dark:bg-slate-700 relative group">
              <img src={postData.cover} alt={postData.title || '文章封面'} decoding="async" fetchPriority="high" className="w-full h-full object-cover opacity-90 transition-transform duration-1000 group-hover:scale-105" />
            </div>

            <div className="p-5 md:p-12 relative">
              <BackButton />

              <header className="mb-6 md:mb-8 border-b border-slate-300/50 dark:border-slate-700 pb-5 md:pb-6 relative">
                <h1 className="text-2xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight transition-colors duration-700 pr-16 md:pr-24 leading-snug">
                  {postData.title}
                </h1>

                {/* ✅ 前端展示：修改此篇的特权按钮已经彻底移除 */}

                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                  <div className="flex items-center gap-1.5 md:gap-2 text-indigo-700 dark:text-indigo-400 font-bold bg-white/30 dark:bg-slate-900/50 px-3 md:px-4 py-1.5 md:py-2 rounded-full w-max text-xs md:text-sm transition-colors duration-700 shadow-sm border border-white/20 dark:border-white/5">
                    <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    写作时间：{postData.date}
                  </div>

                  {postData.tags.map((tag: string) => (
                    <div key={tag} className="flex items-center gap-1 text-pink-600 dark:text-pink-400 font-bold bg-white/30 dark:bg-slate-900/50 px-2.5 md:px-3 py-1.5 md:py-2 rounded-full text-xs md:text-sm transition-colors duration-700 shadow-sm border border-white/20 dark:border-white/5">
                      <span className="text-[10px] md:text-xs opacity-70">#</span> {tag}
                    </div>
                  ))}
                </div>
              </header>

              <div className="relative">
                {/* 排版样式已收拢到 app/globals.css 的 .prose 段；代码高亮色由 atom-one-dark 主题提供 */}

                <div
                  id="article-content"
                  className="prose prose-slate dark:prose-invert prose-base md:prose-lg max-w-none text-slate-800 dark:text-slate-200 transition-colors duration-700 scroll-smooth"
                  dangerouslySetInnerHTML={{ __html: postData.contentHtml }}
                />
              </div>

              <div className="mt-12 md:mt-16">
                <Comments />
              </div>

            </div>
          </article>

          <aside className="w-full lg:w-[320px] flex flex-col gap-6 flex-shrink-0">
            <div className="bg-white/60 dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl p-6 border border-white/40 dark:border-white/10 shadow-xl text-center">
              <div className="w-20 h-20 mx-auto rounded-full p-1 bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-md mb-4 transition-transform duration-500 hover:rotate-3">
                <img src={siteConfig.avatarUrl} alt="avatar" className="w-full h-full rounded-full object-cover bg-white" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{siteConfig.authorName}</h3>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium mb-4">{siteConfig.bio}</p>
              <ClientSocials />
            </div>

            <SidebarLyric />

            <div className="bg-white/60 dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl p-6 border border-white/40 dark:border-white/10 shadow-xl">
              <h3 className="font-black text-slate-900 dark:text-white mb-4 border-l-4 border-indigo-500 pl-2 text-sm">RECOMMENDED</h3>
              <div className="space-y-4">
                {recentPosts.map(p => (
                  <Link key={p.slug} href={`/posts/${p.slug}`} className="group block">
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">{p.title}</h4>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-bold uppercase">{p.date}</p>
                  </Link>
                ))}
              </div>
            </div>

            {postData.toc.length > 0 && (
              <ClientTOC toc={postData.toc} />
            )}
          </aside>
        </main>
      </PageTransition>
    </div>
  );
}