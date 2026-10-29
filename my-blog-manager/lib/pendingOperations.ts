import type { Operation } from '../context/OperationContext';

/**
 * 把「待处理操作」队列里的改动写回内容引擎。
 *
 * 以前这是收件箱里单独的「📥 更新本地」按钮：改完东西得先点一次它，
 * 数据才会真正落盘，博客那边还看不到。现在这一步被并进「发布上线」，
 * 点一次发布就会先写回本地、再镜像、提交、构建、重启，博客随之更新。
 */

const API_BASE = '/api/proxy';

export type FlushResult = {
  ok: boolean;
  applied: number;
  failed: number;
  message: string;
};

/** 每种操作对应的引擎接口 */
function endpointFor(op: any): { url: string; body: any } {
  switch (op.type) {
    case 'sync_photowall':
      return { url: `${API_BASE}/api/gallery/sync`, body: { albums: op.value } };
    case 'sync_friends':
      return { url: `${API_BASE}/api/friends/sync`, body: { friends: op.value } };
    case 'sync_projects':
      return { url: `${API_BASE}/api/projects/sync`, body: { projects: op.value } };
    case 'CONFIG':
      return { url: `${API_BASE}/api/config/update`, body: { updates: op.payload } };
    case 'create_moment':
      return { url: `${API_BASE}/api/moments/save`, body: op.payload };
    default:
      // 文章、说说、草稿等写作类操作统一走草稿同步接口
      return { url: `${API_BASE}/api/drafts/sync_local`, body: { operations: [op] } };
  }
}

/**
 * 依次把队列里的操作写回引擎。
 * 任何一项失败都会立刻中止并返回原因，避免半写状态继续往下发布。
 */
export async function flushPendingOperations(operations: Operation[]): Promise<FlushResult> {
  if (!operations.length) {
    return { ok: true, applied: 0, failed: 0, message: '没有待处理的改动' };
  }

  let applied = 0;

  for (const op of operations) {
    const { url, body } = endpointFor(op);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.success === false) {
        return {
          ok: false,
          applied,
          failed: 1,
          message: data.message || data.detail || `写入失败：${op.label}`,
        };
      }

      applied += 1;
    } catch (error) {
      return {
        ok: false,
        applied,
        failed: 1,
        message: `无法连接内容引擎：${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  return { ok: true, applied, failed: 0, message: `已写入 ${applied} 项改动` };
}
