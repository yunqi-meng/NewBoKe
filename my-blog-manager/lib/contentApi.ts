import { backendBaseUrl } from './backendPort';

/**
 * 控制台读取统一后端内容的入口。
 *
 * 内容不再从磁盘的 markdown / TS 文件里解析，而是从数据库取。
 * 控制台看到的与公开站看到的永远是同一份内容，不会各说各话。
 */

export interface ArticleSummary {
  id: string;
  slug: string;
  type: 'post' | 'chatter' | 'about';
  title: string;
  description: string;
  cover: string;
  tags: string[];
  mood: string;
  date: string;
  content?: string;
}

export interface ArticleDetail extends ArticleSummary {
  content: string;
}

export interface MomentItem {
  id: string;
  date: string;
  content: string;
  location: string;
  images: string[];
}

export interface Photo {
  url: string;
  caption?: string;
}

/** @deprecated 用 Photo 代替，保留别名避免旧代码断裂。 */
export type AlbumPhoto = Photo;

export interface Album {
  id: string;
  title: string;
  description: string;
  cover: string;
  date: string;
  photos: Photo[];
}

export interface Friend {
  id: string;
  name: string;
  url: string;
  description: string;
  avatar: string;
  themeColor: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  icon: string;
  githubUrl: string;
  tags: string[];
}

/**
 * 调后端并解析 JSON。
 *
 * 后端不可用时返回 fallback：控制台宁可少显示一点内容，也不能整页打不开。
 */
export async function backendJson<T>(endpoint: string, fallback: T): Promise<T> {
  const base = await backendBaseUrl();
  try {
    const response = await fetch(`${base}${endpoint}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      console.error(`[backend] ${endpoint} 返回 ${response.status}`);
      return fallback;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error(`[backend] 请求 ${endpoint} 失败：`, error);
    return fallback;
  }
}

/** 文章 / 杂谈列表（默认不含正文） */
export async function getArticles(
  type: 'post' | 'chatter',
  includeContent = false,
): Promise<ArticleSummary[]> {
  const suffix = includeContent ? '&include_content=true' : '';
  const payload = await backendJson<{ articles?: ArticleSummary[] }>(
    `/api/articles?type=${type}${suffix}`,
    { articles: [] },
  );
  return payload.articles ?? [];
}

/** 单篇文章 / 杂谈（含正文 Markdown） */
export async function getArticle(slug: string): Promise<ArticleDetail | null> {
  const payload = await backendJson<{ article?: ArticleDetail | null }>(
    `/api/articles/${encodeURIComponent(slug)}`,
    {},
  );
  return payload.article ?? null;
}

/** 关于页 */
export async function getAbout(): Promise<ArticleDetail | null> {
  const payload = await backendJson<{ about?: ArticleDetail | null }>('/api/about', {});
  return payload.about ?? null;
}

/** 说说 */
export async function getMoments(): Promise<MomentItem[]> {
  const payload = await backendJson<{ moments?: MomentItem[] }>('/api/moments', { moments: [] });
  return payload.moments ?? [];
}

/** 相册 */
export async function getAlbums(): Promise<Album[]> {
  const payload = await backendJson<{ albums?: Album[] }>('/api/albums/list', { albums: [] });
  return payload.albums ?? [];
}
