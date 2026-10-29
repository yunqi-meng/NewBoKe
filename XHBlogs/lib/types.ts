/**
 * 前台用到的数据结构类型。
 *
 * 单独放在这里，是为了让客户端组件也能引用类型，
 * 而不会把「读盘解析」那套 Node 代码打进浏览器包。
 */

export type AlbumPhoto = { url: string; caption?: string };

export type Album = {
  id: string;
  title: string;
  description: string;
  cover: string;
  date: string;
  photos: AlbumPhoto[];
};

export type Friend = {
  id: string;
  name: string;
  url: string;
  description: string;
  avatar: string;
  themeColor: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  icon: string;
  githubUrl: string;
  tags: string[];
};
