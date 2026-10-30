/**
 * 标题锚点 ID 生成器（服务端 + 客户端共用）。
 *
 * 规则与旧版 ClientTOC 客户端逻辑完全一致：
 * 先扒掉 Markdown 外壳得到纯文本，再只保留汉字 / 字母 / 数字并小写，
 * 前缀 toc-。服务端在渲染管线里直接把 id 打到标题上，
 * #anchor 深链在首屏（JS 未挂载）也能生效。
 */
export function cleanMarkdownHeading(rawText: string): string {
  if (!rawText) return '';
  return rawText
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/[*_~`#]/g, '')
    .trim();
}

export function getHeadingId(rawText: string): string {
  const cleanText = cleanMarkdownHeading(rawText);
  return 'toc-' + cleanText
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
    .toLowerCase();
}

/** 从已渲染的 hast 节点里递归收集纯文本（等价于 cleanMarkdownHeading 之后的结果）。 */
export function collectNodeText(node: {
  type?: string;
  value?: string;
  children?: unknown[];
}): string {
  if (node.type === 'text' && typeof node.value === 'string') return node.value;
  if (!node.children) return '';
  return node.children
    .map((child) => collectNodeText(child as Parameters<typeof collectNodeText>[0]))
    .join('');
}

/**
 * 极简 rehype 插件：给 h1/h2/h3 打上与 TOC 对齐的 id。
 * 不引第三方 rehype-slug（其 slug 规则与本项目客户端逻辑不同）。
 */
export function rehypeHeadingIds() {
  return (tree: { type?: string; tagName?: string; properties?: Record<string, unknown>; children?: unknown[] }) => {
    const walk = (node: typeof tree) => {
      if (
        node.type === 'element' &&
        node.tagName &&
        /^h[1-3]$/.test(node.tagName)
      ) {
        const id = getHeadingId(collectNodeText(node));
        node.properties = { ...(node.properties ?? {}), id };
      }
      if (node.children) {
        for (const child of node.children) {
          walk(child as typeof tree);
        }
      }
    };
    walk(tree);
  };
}
