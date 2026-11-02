"use client";

import { ReactNode, useSyncExternalStore } from 'react';
import { useHydrated } from '../lib/useHydrated';
import { usePathname } from 'next/navigation';
import { stripBasePath } from '../lib/consoleBasePath';
import BackgroundEffects from './BackgroundEffects';
import { MusicProvider } from './MusicProvider';
import FloatingPlayer from './FloatingPlayer';
import ClickEffect from './ClickEffect';
import BackgroundSlider from './BackgroundSlider';
import GlobalToolbox from './GlobalToolbox';
import SplashScreen from './SplashScreen';
import CyberCat from './CyberCat';
import DanmakuBackground from './DanmakuBackground';
import GlobalSnow from './GlobalSnow';
import { useSiteConfig } from './SiteConfigProvider';

/**
 * 根布局外壳：按路由决定是否挂装饰层。
 * 编辑器（/editor）需要干净、低开销的输入环境，
 * 跳过 Splash / 雪花 / 弹幕 / 点击涟漪 / 音乐等装饰组件。
 */
const MOBILE_QUERY = '(max-width: 767px)';

const subscribeMobile = (onChange: () => void) => {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};
const getMobileSnapshot = () => window.matchMedia(MOBILE_QUERY).matches;
const getServerSnapshot = () => false;

export default function ConsoleShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const siteConfig = useSiteConfig();
  const isMobile = useSyncExternalStore(subscribeMobile, getMobileSnapshot, getServerSnapshot);
  // 挂载后再判定，避免移动端首帧闪出桌面装饰层
  const ready = useHydrated();
  const showDecor = ready && !isMobile;
  const route = stripBasePath(pathname || '/');
  const isEditor = route === '/editor' || route.startsWith('/editor/');

  if (isEditor) {
    return (
      <div id="app-mount-root" className="flex-1 flex flex-col">
        <div className="relative z-10 flex-1 flex-col">
          {children}
        </div>
      </div>
    );
  }

  return (
    <>
      {showDecor && <SplashScreen />}
      <MusicProvider>
        <div id="app-mount-root" className="flex-1 flex flex-col transition-opacity duration-1000">
          <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden">
            {showDecor && !siteConfig.useGradient && <BackgroundSlider />}
            <div className="absolute inset-0 z-[-9] bg-white/40 dark:bg-slate-900/50 transition-colors duration-1000"></div>
            <div
              className="absolute inset-[-30%] z-[-8] opacity-60 dark:opacity-20 transition-opacity duration-1000 transform-gpu will-change-transform"
              style={{
                background: `linear-gradient(-45deg, ${siteConfig.themeColors.join(', ')})`,
                backgroundSize: '400% 400%',
                animation: 'gradientDrift 15s ease infinite'
              }}
            ></div>
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-white/40 dark:bg-indigo-900/20 blur-[100px] rounded-full mix-blend-overlay z-[-7]"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-400/30 dark:bg-purple-900/30 blur-[100px] rounded-full mix-blend-overlay z-[-7]"></div>

            {showDecor && (
              <div className="bg-effects-wrapper transition-opacity duration-1000">
                <BackgroundEffects />
              </div>
            )}
          </div>

          {showDecor && (
            <>
              <DanmakuBackground />
              <GlobalSnow />
            </>
          )}

          <div className="relative z-10 flex-1 flex-col">
            {children}
          </div>

          {showDecor && (
            <>
              <FloatingPlayer />
              <GlobalToolbox />
              <ClickEffect />
            </>
          )}
        </div>

        <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `
          @keyframes gradientDrift { 0% { transform: translate3d(0, 0, 0); } 50% { transform: translate3d(8%, -6%, 0); } 100% { transform: translate3d(0, 0, 0); } }
          body.winter-mode .bg-effects-wrapper { opacity: 0 !important; visibility: hidden; }
          .winter-mode .snow-cap { position: relative !important; overflow: visible !important; }
          .dark.winter-mode .snow-cap {
            background-color: rgba(23, 37, 84, 0.4) !important;
            border-color: rgba(59, 130, 246, 0.3) !important;
            backdrop-filter: blur(12px) brightness(80%) !important;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4) !important;
          }
          body.winter-mode .snow-cap {
            background-color: rgba(239, 246, 255, 0.45) !important;
            border-color: rgba(191, 219, 254, 0.3) !important;
            backdrop-filter: blur(12px) saturate(120%) !important;
            box-shadow: 0 8px 32px rgba(191, 219, 254, 0.25) !important;
            transition: all 0.7s ease !important;
          }
        `}} />
      </MusicProvider>
      {showDecor && <CyberCat />}
    </>
  );
}
