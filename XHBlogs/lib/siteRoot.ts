import path from 'path';

/**
 * 公开站的源码根目录。
 *
 * 线上由 systemd 以 WorkingDirectory=/opt/xinghui-blog/XHBlogs 运行 next start，
 * 所以 process.cwd() 就是站点目录；本地开发时同样是项目根。
 * 控制台发布时会把内容镜像到这个目录，站点在请求时读的就是这份工作副本。
 */
export function siteRoot(): string {
  return process.env.XHS_SITE_ROOT?.trim() || process.cwd();
}

/** 拼出站点根目录下的某个路径 */
export function sitePath(...segments: string[]): string {
  const root = siteRoot();
  // turbopackIgnore：这个路径是运行期拼出来的（站点根目录可以由环境变量覆盖），
  // 打包器没法静态推断范围，标记一下避免把整个项目都打进文件追踪清单。
  return path.join(/*turbopackIgnore: true*/ root, ...segments);
}
