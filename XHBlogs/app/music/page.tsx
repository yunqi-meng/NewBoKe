import type { Metadata } from 'next';
import MusicClient from "./MusicClient";
import { liveMetadata } from "../../lib/pageMetadata";

// 🌟 这里是服务端渲染，完美支持 metadata
export async function generateMetadata(): Promise<Metadata> {
  return liveMetadata('音乐馆');
}

export default function MusicPage() {
  return <MusicClient />;
}
