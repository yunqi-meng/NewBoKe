// app/api/chat/route.ts
import { getLiveSiteConfig } from '../../../lib/siteConfigRuntime';

/**
 * AI 煤球的对话接口。
 *
 * 走 OpenAI 兼容协议（DeepSeek 等），密钥只从环境变量读，仓库里不存任何口令：
 *   DEEPSEEK_API_KEY  DeepSeek 官方密钥
 *   OPENAI_API_KEY    其它兼容渠道的密钥（备用）
 *   GEMINI_API_KEY    兼容旧配置的兜底
 *   AI_BASE_URL       覆盖接口地址，默认取配置里的 baseUrl
 *
 * 站点配置在 siteConfig.aiConfig 里：模型、接口地址、性格 Prompt、生成预算、发散度。
 *
 * 为什么用 nodejs 而不是 edge：
 *   edge 运行时对环境变量的处理依赖构建期注入，而密钥是运行时才写进环境文件的；
 *   node 运行时直接读进程环境，改完密钥重启服务即可生效，不必重新构建。
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 读取密钥：没有任何一个可用就返回空串 */
function readApiKey(): string {
  return (
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    ''
  ).trim();
}

/** 接口地址，末尾斜杠去掉，避免拼出双斜杠 */
function readBaseUrl(): string {
  const siteConfig = getLiveSiteConfig();
  const raw = process.env.AI_BASE_URL || siteConfig.aiConfig.baseUrl || 'https://api.deepseek.com';
  return raw.trim().replace(/\/+$/, '');
}

export async function POST(req: Request) {
  try {
    const { message } = await req.json();
    const cfg = getLiveSiteConfig().aiConfig;

    const apiKey = readApiKey();
    if (!apiKey) {
      console.error('❌ 找不到 API Key');
      return Response.json({ error: 'Key missing' }, { status: 500 });
    }

    const baseUrl = readBaseUrl();
    const modelId = (cfg.modelId || 'deepseek-flash').trim();
    const payload = {
      model: modelId,
      messages: [
        { role: 'system', content: cfg.systemPrompt },
        { role: 'user', content: String(message ?? '') },
      ],
      max_tokens: cfg.maxOutputTokens,
      temperature: cfg.temperature,
      // 推理强度：低配省时间，高配让煤球多想一会儿
      ...(cfg.effort ? { effort: cfg.effort } : {}),
    };

    console.log(`📡 正在呼叫模型: ${modelId} @ ${baseUrl}`);

    let response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    // 有些兼容渠道不认识 effort 参数，遇到 400 就摘掉重试一次
    if (response.status === 400 && payload.effort) {
      const { effort, ...rest } = payload;
      console.warn('⚠️ 接口不接受 effort 参数，摘掉后重试');
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(rest),
        cache: 'no-store',
      });
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('🚨 模型拒绝了请求:', JSON.stringify(data));
      return Response.json(
        {
          error: `模型拒绝访问: ${response.status}`,
          details: data?.error?.message || '未知错误',
        },
        { status: response.status },
      );
    }

    const choice = data?.choices?.[0];
    const content = typeof choice?.message?.content === 'string' ? choice.message.content.trim() : '';

    if (!content) {
      // 推理模型可能把预算全花在思考上，正文就空了，这时给个兜底台词
      console.warn('⚠️ 模型没有返回正文（可能推理预算用尽）');
      return Response.json({ reply: '本喵想得太入神，话卡在嘴边了喵…' });
    }

    console.log('✅ 回复已生成，准备传回前端');
    return Response.json({ reply: content });
  } catch (error) {
    console.error('🔥 运行时崩溃:', error instanceof Error ? error.message : error);
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function GET() {
  return Response.json({
    status: 'Ready',
    model: getLiveSiteConfig().aiConfig.modelId,
    provider: readBaseUrl(),
  });
}
