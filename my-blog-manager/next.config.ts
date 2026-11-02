import type { NextConfig } from "next";

/**
 * 挂载前缀：与公开站同域部署时挂到 /console，独立入口时留空。
 *
 * 必须是构建期决定（basePath 不能运行时改），所以走 NEXT_PUBLIC_ 变量：
 *   NEXT_PUBLIC_CONSOLE_BASE_PATH=/console npm run build
 * 客户端代码通过 lib/consoleBasePath.ts 读同一个变量给手写路径补前缀。
 */
const consoleBasePath = (process.env.NEXT_PUBLIC_CONSOLE_BASE_PATH || '').replace(/\/+$/, '');

const nextConfig: NextConfig = {
  // 生成可独立运行的 Node.js 服务。
  output: 'standalone',

  // 前缀为空时不写这个字段，保持独立入口的原有行为
  ...(consoleBasePath ? { basePath: consoleBasePath } : {}),

  // 图片由统一后端托管。
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
