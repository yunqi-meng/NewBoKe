import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Serif_SC } from "next/font/google";
import { MotionConfig } from "framer-motion";
import "./globals.css";
import { ThemeProvider } from "../components/ThemeProvider";
import BackgroundEffects from "../components/BackgroundEffects";
import { MusicProvider } from "../components/MusicProvider";
import FloatingPlayer from "../components/FloatingPlayer";
import { getLiveSiteConfig } from "../lib/siteConfigRuntime";
import { SiteConfigProvider } from "../components/SiteConfigProvider";
import ClickEffect from "../components/ClickEffect";
import BackgroundSlider from "../components/BackgroundSlider";
import GlobalToolbox from "../components/GlobalToolbox";
import SplashScreen from "../components/SplashScreen";
import CyberCat from '../components/CyberCat';
import DanmakuBackground from '../components/DanmakuBackground';
import DesktopOnly from '../components/DesktopOnly';

import MobileBackButton from '../components/MobileBackButton';

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const notoSerif = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-serif",
  display: 'swap',
});

// 不再 force-dynamic：内容 fetch 带 revalidate:60 + tags:['content']，
// 页面可静态/ISR 渲染；发布后通过 /api/revalidate 即时失效。

export async function generateMetadata(): Promise<Metadata> {
  const siteConfig = await getLiveSiteConfig();
  return {
    title: siteConfig.title,
    description: siteConfig.bio,
    icons: {
      icon: siteConfig.faviconUrl,
      apple: siteConfig.faviconUrl,
    },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const siteConfig = await getLiveSiteConfig();

  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} ${notoSerif.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* 绘制前设置 dark 类 / 已看过开屏标记，避免主题闪烁；内容不再被 splash 门控 */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (sessionStorage.getItem('hasSeenSplash') === 'true') {
                  document.documentElement.classList.add('splash-seen');
                }
                if (localStorage.getItem('blog-theme') === 'light') {
                  document.documentElement.classList.remove('dark');
                } else {
                  document.documentElement.classList.add('dark');
                }
              } catch (e) {}
            `
          }}
        />
      </head>

      <body className="w-screen overflow-x-hidden min-h-full flex flex-col relative transition-colors duration-1000 bg-slate-50 dark:bg-slate-950 font-serif">
        <SiteConfigProvider initialConfig={siteConfig}>
          <ThemeProvider>
            <MotionConfig reducedMotion="user">

          <SplashScreen />

          <MusicProvider>
            <div id="app-mount-root" className="flex-1 flex flex-col">
              <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden">
                {!siteConfig.useGradient && <BackgroundSlider />}
                <div className="absolute inset-0 z-[-9] bg-white/30 dark:bg-slate-900/40 backdrop-blur-md transition-colors duration-1000"></div>

                {/* 渐变层：改用 transform 驱动（图层放大后平移），避免 background-position 全屏重绘 */}
                <div
                  className="absolute inset-[-30%] z-[-8] opacity-60 dark:opacity-20 mix-blend-color transition-opacity duration-1000 transform-gpu will-change-transform"
                  style={{
                    background: `linear-gradient(-45deg, ${siteConfig.themeColors.join(', ')})`,
                    backgroundSize: '400% 400%',
                    animation: 'gradientDrift 15s ease infinite'
                  }}
                ></div>

                {/* 👇 🌟 优化：手机端去掉了 mix-blend-overlay，但保留了 blur 模糊光晕，确保视觉不打折 */}
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-white/40 dark:bg-indigo-900/20 blur-[100px] rounded-full z-[-7] md:mix-blend-overlay"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-400/30 dark:bg-purple-900/30 blur-[100px] rounded-full z-[-7] md:mix-blend-overlay"></div>

                {/* 隐藏手机端高负载粒子特效：桌面端才真正挂载 */}
                <div className="absolute inset-0 w-full h-full">
                  <DesktopOnly>
                    <BackgroundEffects />
                  </DesktopOnly>
                </div>
              </div>

              {/* 隐藏手机端弹幕 */}
              <div>
                <DesktopOnly>
                  <DanmakuBackground />
                </DesktopOnly>
              </div>

              <div className="relative z-10 flex-1 flex flex-col">
                {children}
              </div>

              <div>
                <DesktopOnly>
                  <FloatingPlayer />
                </DesktopOnly>
              </div>

              <div className="hidden md:block">
                <GlobalToolbox />
              </div>

              <div className="md:hidden block">
                <MobileBackButton />
              </div>

              {/* 隐藏手机端点击粒子 */}
              <div>
                <DesktopOnly>
                  <ClickEffect />
                </DesktopOnly>
              </div>
            </div>

            <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `
              @keyframes gradientDrift {
                0% { transform: translate3d(0, 0, 0); }
                50% { transform: translate3d(8%, -6%, 0); }
                100% { transform: translate3d(0, 0, 0); }
              }
            `}} />
          </MusicProvider>

          <div>
            <DesktopOnly>
              <CyberCat />
            </DesktopOnly>
          </div>

            </MotionConfig>
          </ThemeProvider>
        </SiteConfigProvider>
      </body>
    </html>
  );
}
