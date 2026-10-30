import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Serif_SC } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "../components/ThemeProvider";
import { getLiveSiteConfig } from "../lib/siteConfigRuntime";
import { SiteConfigProvider } from "../components/SiteConfigProvider";
import { ToastProvider } from '../components/ToastProvider';
import ConsoleShell from '../components/ConsoleShell';

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const notoSerif = Noto_Serif_SC({ subsets: ["latin"], weight: ["400", "700", "900"], variable: "--font-serif", display: 'swap' });

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const config = await getLiveSiteConfig();
  return {
    title: config.title,
    description: config.bio,
    icons: { icon: config.faviconUrl, apple: config.faviconUrl },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // 配置必须实时读：编译进产物的 siteConfig 只是快照，
  // 发布后不重建控制台的话，昵称/头像/壁纸都会停在旧值。
  const config = await getLiveSiteConfig();

  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} ${notoSerif.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="w-screen overflow-x-hidden min-h-full flex flex-col relative transition-colors duration-1000 bg-slate-50 dark:bg-slate-950 font-serif">
        <SiteConfigProvider initialConfig={config}>
        <ThemeProvider>
          <ToastProvider>
              {/* 内容立即可见；开屏动画只是顶层覆盖层，淡出后即见正文 */}
              <ConsoleShell>
                {children}
              </ConsoleShell>
            </ToastProvider>
        </ThemeProvider>
        </SiteConfigProvider>
      </body>
    </html>
  );
}
