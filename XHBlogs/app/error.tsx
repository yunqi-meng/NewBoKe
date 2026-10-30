"use client";

/**
 * 路由级错误边界：后端炸了 / 渲染崩了时给一个可恢复的友好页，
 * 不再白屏。样式与站点的 indigo 极客风保持一致。
 * （渲染在根布局之内，不需要 html/body 外壳。）
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-[70vh] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl bg-white/60 dark:bg-slate-800/50 border border-white/40 dark:border-white/10 shadow-xl backdrop-blur-xl p-10 text-center">
        <div className="text-5xl mb-4">😵</div>
        <h1 className="text-2xl font-black mb-3 tracking-tight text-slate-800 dark:text-white">
          页面开小差了
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-8">
          渲染时出了点状况，内容可能暂时取不到。重试一下，或者稍后再来。
        </p>
        <button
          onClick={reset}
          className="px-8 py-3 rounded-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
        >
          重新加载
        </button>
        {error?.digest && (
          <p className="mt-6 text-[10px] text-slate-400 font-mono">
            digest: {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
