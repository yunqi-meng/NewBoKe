import type { Metadata } from 'next';
import PhotoWallClient from './PhotoWallClient';
import { liveMetadata } from '../../lib/pageMetadata';
import { getAlbums } from '../../lib/contentApi';

export async function generateMetadata(): Promise<Metadata> {
  return liveMetadata('照片墙');
}

export default async function PhotoWallPage() {
  const albums = await getAlbums();

  return <PhotoWallClient albums={albums} />;
}
