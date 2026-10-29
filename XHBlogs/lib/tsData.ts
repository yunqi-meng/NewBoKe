import fs from 'fs';
import { sitePath } from './siteRoot';
import type { Album, Friend, Project } from './types';

export type { Album, AlbumPhoto, Friend, Project } from './types';

/**
 * 运行时读取控制台自动生成的数据文件（data/albums.ts、data/friends.ts、data/projects.ts）。
 *
 * 这三个文件是「export const xxx: Xxx[] = <JSON>;」的固定格式，
 * 直接 import 会被 Next.js 在构建时打进产物（拿到的是构建那一刻的快照），
 * 所以这里在请求时读盘解析，保证前台看到的永远是工作副本里的最新数据。
 *
 * 解析规则与引擎 cms_core/tsdata.py 保持一致：
 * 类型标注里也有方括号（Album[]），必须先越过等号再找数组起点。
 */

/** 从 startIndex（必须是 '['）开始截出配平的 JSON 数组文本 */
function extractJsonArray(content: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < content.length; i++) {
    const ch = content[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '[' || ch === '{') {
      depth += 1;
    } else if (ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) return content.slice(startIndex, i + 1);
    }
  }

  return null;
}

/**
 * 去掉 JSON 里非法的“尾随逗号”。
 * 控制台生成的数据文件沿用 TS 写法（`{"a": 1,}` / `[1, 2,]`），标准 JSON 解析会直接报错，
 * 所以解析前先在字符串之外把这些逗号剔除，避免破坏 `https://` 这类文本。
 */
function stripTrailingCommas(text: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      result += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      result += ch;
      continue;
    }

    if (ch === ',') {
      let probe = i + 1;
      while (probe < text.length && ' \t\r\n'.includes(text[probe])) probe += 1;
      if (probe < text.length && (text[probe] === '}' || text[probe] === ']')) continue;
    }

    result += ch;
  }

  return result;
}

/** 读取一个「export const <name>: Xxx[] = [...]」格式的数据文件 */
function readArrayFile(fileName: string, exportName: string): any[] {
  try {
    const content = fs.readFileSync(sitePath('data', fileName), 'utf8');

    const markerIndex = content.indexOf(`export const ${exportName}`);
    if (markerIndex === -1) return [];

    const assignIndex = content.indexOf('=', markerIndex);
    if (assignIndex === -1) return [];

    const bracketIndex = content.indexOf('[', assignIndex);
    if (bracketIndex === -1) return [];

    const jsonText = extractJsonArray(content, bracketIndex);
    if (!jsonText) return [];

    const parsed = JSON.parse(stripTrailingCommas(jsonText));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readAlbumsFromDisk(): Album[] {
  return readArrayFile('albums.ts', 'albums') as Album[];
}

export function readFriendsFromDisk(): Friend[] {
  return readArrayFile('friends.ts', 'friendsData') as Friend[];
}

export function readProjectsFromDisk(): Project[] {
  return readArrayFile('projects.ts', 'projectsData') as Project[];
}
