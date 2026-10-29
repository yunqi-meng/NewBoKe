import type { Metadata } from 'next';
import PhotoWallClient from './PhotoWallClient';
import { liveMetadata } from '../../lib/pageMetadata';
import { readAlbumsFromDisk } from '../../lib/tsData';

export async function generateMetadata(): Promise<Metadata> {
  return liveMetadata('照片墙');
}

export default function PhotoWallPage() {
  const albums = readAlbumsFromDisk();

  return <PhotoWallClient albums={albums} />;
}
