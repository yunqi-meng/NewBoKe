import { backendFetch } from '@/lib/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 每日一句网关：把首页要显示的那句励志语转发到统一后端。
 *
 * 为什么要有这一层？
 *   - 后端只监听 127.0.0.1，外部无法直连；
 *   - 励志语存在统一后端的数据库里，公开站与控制台读的是同一份；
 *   - 这里只暴露「读今天这一句」一个动作，生成与设置都走控制台。
 */

/** GET /api/daily-quote —— 取今天这句励志语 */
export async function GET() {
  return backendFetch('/api/daily-quote/');
}
