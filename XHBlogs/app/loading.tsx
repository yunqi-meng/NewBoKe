import PageSkeleton from '../components/PageSkeleton';

/** 首页骨架屏：内容矩阵还没渲染好时先占位，避免白屏。 */
export default function Loading() {
  return <PageSkeleton variant="grid" />;
}
