/**
 * 路由切换时的骨架屏。
 *
 * 页面是运行时读库渲染的，切换路由要等一次后端往返。没有骨架屏时，
 * 浏览器会停在旧页面上不吭声，看起来像「点了没反应」；有了它，
 * 点击的瞬间就给出结构占位，感知延迟小很多。
 *
 * 只画灰块，不引入任何数据依赖，所以它自己永远不会卡住。
 */

type Variant = 'grid' | 'article' | 'list' | 'gallery';

function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-full bg-slate-400/20 dark:bg-slate-500/20 ${className}`} />;
}

function Card({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-3xl border border-white/40 bg-white/40 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-slate-800/50 ${className}`}
    />
  );
}

export default function PageSkeleton({ variant = 'grid' }: { variant?: Variant }) {
  if (variant === 'article') {
    return (
      <div className="w-[95%] md:w-[90%] max-w-6xl mx-auto mt-24 md:mt-28 flex flex-col lg:flex-row gap-6 md:gap-8">
        <div className="flex-1 rounded-3xl border border-white/40 bg-white/50 shadow-2xl dark:border-white/10 dark:bg-slate-800/50">
          <div className="animate-pulse w-full aspect-video rounded-t-3xl bg-slate-400/20 dark:bg-slate-500/20" />
          <div className="p-5 md:p-12 space-y-4">
            <Bar className="h-8 w-3/4" />
            <Bar className="h-4 w-40" />
            <div className="pt-6 space-y-3">
              {Array.from({ length: 8 }).map((_, index) => (
                <Bar key={index} className={`h-4 ${index % 3 === 2 ? 'w-2/3' : 'w-full'}`} />
              ))}
            </div>
          </div>
        </div>
        <aside className="hidden lg:block w-64 shrink-0 space-y-6">
          <Card className="h-40" />
          <Card className="h-56" />
        </aside>
      </div>
    );
  }

  if (variant === 'gallery') {
    return (
      <div className="w-[95%] md:w-[90%] max-w-6xl mx-auto mt-24 md:mt-28">
        <Bar className="h-10 w-56 mb-8" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="animate-pulse aspect-[4/3] rounded-3xl border border-white/40 bg-white/40 dark:border-white/10 dark:bg-slate-800/50"
            />
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'list') {
    return (
      <div className="w-[95%] md:w-[90%] max-w-4xl mx-auto mt-24 md:mt-28 space-y-6">
        <Bar className="h-10 w-48 mb-8" />
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="h-32" />
        ))}
      </div>
    );
  }

  return (
    <div className="w-[95%] md:w-[90%] max-w-6xl mx-auto mt-24 md:mt-28 space-y-6">
      <Card className="h-12 w-64" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-7 h-64" />
        <Card className="lg:col-span-5 h-64" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-4 h-72" />
        <Card className="lg:col-span-8 h-72" />
      </div>
    </div>
  );
}
