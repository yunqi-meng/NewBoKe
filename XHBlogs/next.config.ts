import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 图片由统一后端托管。
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
