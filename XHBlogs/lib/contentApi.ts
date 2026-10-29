import { backendJson, pick } from './backend';
import type { Album, Friend, Project } from './types';

export type { Album, AlbumPhoto, Friend, Project } from './types';

/**
 * 内容读取：全部走统一后端。
 *
 * 以前这里是「读盘 + 解析 markdown / TS」，现在后端把内容存进数据库，
 * 前台只负责取。页面里的渲染逻辑（Markdown → HTML、目录、清洗）都留在前台，
 * 因为那些是「展示层」的事，后端只提供原始 Markdown。
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

interface ArticleListResponse {
  success: boolean;
  articles?: ArticleSummary[];
}

interface ArticleResponse {
  success: boolean;
  article?: ArticleDetail | null;
}

interface MomentListResponse {
  success: boolean;
  moments?: MomentItem[];
}

interface AlbumResponse {
  success: boolean;
  albums?: Album[];
}

interface FriendResponse {
  success: boolean;
  friends?: Friend[];
}

interface ProjectResponse {
  success: boolean;
  projects?: Project[];
}

/** 文章 / 杂谈列表（默认不含正文，列表页只要元信息） */
export async function getArticles(
  type: 'post' | 'chatter',
  includeContent = false,
): Promise<ArticleSummary[]> {
  const suffix = includeContent ? '&include_content=true' : '';
  const payload = await backendJson<ArticleListResponse>(
    `/api/articles?type=${type}${suffix}`,
    { success: false, articles: [] },
  );
  return payload.articles ?? [];
}

/** 单篇文章 / 杂谈（含正文 Markdown） */
export async function getArticle(slug: string): Promise<ArticleDetail | null> {
  const payload = await backendJson<ArticleResponse>(
    `/api/articles/${encodeURIComponent(slug)}`,
    { success: false },
  );
  return payload.article ?? null;
}

/** 关于页 */
export async function getAbout(): Promise<ArticleDetail | null> {
  const payload = await backendJson<{ success: boolean; about?: ArticleDetail | null }>(
    '/api/about',
    { success: false, about: null },
  );
  return payload.about ?? null;
}

/** 说说 */
export async function getMoments(): Promise<MomentItem[]> {
  const payload = await backendJson<MomentListResponse>('/api/moments', {
    success: false,
    moments: [],
  });
  return payload.moments ?? [];
}

/** 相册 */
export async function getAlbums(): Promise<Album[]> {
  const payload = await backendJson<AlbumResponse>('/api/albums/list', {
    success: false,
    albums: [],
  });
  return payload.albums ?? [];
}

/** 友链 */
export async function getFriends(): Promise<Friend[]> {
  const payload = await backendJson<FriendResponse>('/api/friends/list', {
    success: false,
    friends: [],
  });
  return payload.friends ?? [];
}

/** 项目矩阵 */
export async function getProjects(): Promise<Project[]> {
  const payload = await backendJson<ProjectResponse>('/api/projects/list', {
    success: false,
    projects: [],
  });
  return payload.projects ?? [];
}

/** 站点配置（不含 aiConfig，公开站不需要） */
export async function getPublicSiteConfig(): Promise<Record<string, any>> {
  const payload = await backendJson<{ success: boolean; data?: Record<string, any> }>(
    '/api/config/public',
    { success: false, data: {} },
  );
  return payload.data ?? {};
}

/** 站点配置（含 aiConfig，只有服务端路由用） */
export async function getFullSiteConfig(): Promise<Record<string, any>> {
  const payload = await backendJson<{ success: boolean; data?: Record<string, any> }>(
    '/api/config/get',
    { success: false, data: {} },
  );
  return payload.data ?? {};
}

export { pick };
