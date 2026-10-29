import fs from 'fs';
import { siteConfig as staticSiteConfig } from '../siteConfig';
import { deepMerge } from './siteConfigMerge';
import { sitePath } from './siteRoot';

export type SiteConfig = typeof staticSiteConfig;

/**
 * 从 siteConfig.ts 源码里截出 `export const siteConfig = { ... }` 的对象字面量文本。
 *
 * 这里用的是「字符串感知的括号平衡」而不是正则：
 * 值里带 `}`、带 `//`、带转义引号的字符串都很常见，正则会在这些地方截断。
 */
function extractConfigLiteral(source: string): string | null {
  const marker = source.indexOf('export const siteConfig');
  if (marker === -1) return null;

  const assignIndex = source.indexOf('=', marker);
  if (assignIndex === -1) return null;

  const openIndex = source.indexOf('{', assignIndex);
  if (openIndex === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"' || ch === "'" || ch === '`') {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, i + 1);
    }
  }

  return null;
}

/**
 * 把对象字面量求值成真正的 JS 对象。
 *
 * siteConfig.ts 写的是标准 TS 对象字面量（可能带注释、单引号、尾随逗号），
 * 用 `new Function` 求值和打包器编译走的是同一套 JS 语义，最忠实；
 * 解析失败时返回 null，由调用方退回编译期快照，保证站点不会因为配置写坏而打不开。
 */
function evaluateConfigLiteral(literal: string): Record<string, unknown> | null {
  try {
    // eslint-disable-next-line no-new-func
    const factory = new Function(`"use strict"; return (${literal});`);
    const value = factory();
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // 配置语法有问题：退回快照
  }
  return null;
}

/**
 * 读取磁盘上最新的站点配置（服务端用）。
 *
 * siteConfig.ts 原本是被 Next.js 编译进产物的静态模块，
 * 发布后不重新构建站点就永远是旧值（标题、头像、壁纸都要等一次全站构建）；
 * 现在改由服务端在请求时读盘解析，站点配置立刻生效。
 */
export function getLiveSiteConfig(): SiteConfig {
  try {
    const source = fs.readFileSync(sitePath('siteConfig.ts'), 'utf8');
    const literal = extractConfigLiteral(source);
    if (!literal) return staticSiteConfig;

    const parsed = evaluateConfigLiteral(literal);
    if (!parsed) return staticSiteConfig;

    return deepMerge(
      staticSiteConfig as unknown as Record<string, any>,
      parsed,
    ) as SiteConfig;
  } catch {
    return staticSiteConfig;
  }
}
