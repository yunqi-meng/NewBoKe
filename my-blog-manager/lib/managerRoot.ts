import path from 'path';

/**
 * 控制台内容「工作副本」的根目录。
 *
 * standalone 打包后 process.cwd() 指向 .next/standalone，那里面只是构建时
 * 复制进去的一份内容副本（而且可能是很久以前的），真正被编辑、被发布的数据
 * 在 XHS_MANAGER_ROOT 指向的目录里：服务器上是 /opt/xinghui-blog/my-blog-manager，
 * 桌面版是 exe 同级目录，两者都会设置这个环境变量。
 *
 * 只在服务端组件 / 服务端代码里用；客户端组件拿不到这个环境变量。
 */
export function managerRoot(): string {
  const root = process.env.XHS_MANAGER_ROOT?.trim();
  return root && root.length > 0 ? root : process.cwd();
}

/** 拼出工作副本下的某个路径 */
export function managerPath(...segments: string[]): string {
  return path.join(managerRoot(), ...segments);
}
