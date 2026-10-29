/**
 * 配置合并工具（前后端共用，禁止在这里引入任何 Node 专属 API）。
 *
 * 控制台启动时会带一份静态快照（siteConfig.ts 编译进产物），
 * 运行时再从引擎读回磁盘上的最新配置，两者在这里做深合并。
 */

export function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 深合并补丁到基础配置上：
 * - 嵌套对象逐层合并（social / aiConfig / icpConfig 这类子对象不能整体替换）
 * - 数组整体替换（壁纸分组、徽章、弹幕列表都是整份换掉）
 * - undefined 的字段直接忽略，避免引擎漏字段时把界面清空
 */
export function deepMerge<T extends Record<string, any>>(base: T, patch: Record<string, any> | undefined | null): T {
  if (!isPlainObject(patch)) return base;

  const result: Record<string, any> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = result[key];
    result[key] = isPlainObject(value) && isPlainObject(current) ? deepMerge(current, value) : value;
  }
  return result as T;
}
