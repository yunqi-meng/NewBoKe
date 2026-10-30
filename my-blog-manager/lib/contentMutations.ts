/**
 * 控制台的内容写入口。
 *
 * 这里不再攒「待处理操作」：每一次保存都直接写进统一后端，
 * 数据库一更新，公开站刷新就是新内容，不需要再点一次发布。
 *
 * 照片墙 / 友链 / 项目这几类接口是「整份覆盖」，
 * 快速连点删除时如果并发发出，先发的旧列表可能后到、把删掉的数据写回去，
 * 所以同类写请求在这里排成一条链，保证落库顺序与界面操作顺序一致。
 */

export type WriteResult = {
  ok: boolean;
  message: string;
  data?: { id?: string; busy?: boolean; [key: string]: unknown };
};

const API_BASE = '/api/proxy';

async function postJson(endpoint: string, body: unknown): Promise<WriteResult> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.success === false) {
      return {
        ok: false,
        message: data.message || data.detail || `内容引擎返回 ${res.status}`,
        data,
      };
    }

    return { ok: true, message: data.message || '已保存', data };
  } catch (error) {
    return {
      ok: false,
      message: `无法连接内容引擎：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** 同类写请求的排队链：后一次一定等前一次落库完成再发出 */
const tails = new Map<string, Promise<unknown>>();

function serial(channel: string, task: () => Promise<WriteResult>): Promise<WriteResult> {
  const previous = tails.get(channel) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  tails.set(channel, next);
  return next;
}

/** 正式发布文章 / 杂谈 / 关于页（写入文章表，删掉同名草稿） */
export function publishArticle(payload: unknown): Promise<WriteResult> {
  return postJson(`${API_BASE}/api/drafts/publish`, payload);
}

/** 保存草稿（只落草稿表，不对外发布） */
export function saveDraft(payload: unknown): Promise<WriteResult> {
  return postJson(`${API_BASE}/api/drafts/save`, payload);
}

/** 发布说说 */
export function createMoment(payload: unknown): Promise<WriteResult> {
  return postJson(`${API_BASE}/api/moments`, payload);
}

/** 整份覆盖相册 */
export function syncAlbums(albums: unknown): Promise<WriteResult> {
  return serial('albums', () => postJson(`${API_BASE}/api/albums/sync`, { albums }));
}

/** 整份覆盖友链 */
export function syncFriends(friends: unknown): Promise<WriteResult> {
  return serial('friends', () => postJson(`${API_BASE}/api/friends/sync`, { friends }));
}

/** 整份覆盖项目矩阵 */
export function syncProjects(projects: unknown): Promise<WriteResult> {
  return serial('projects', () => postJson(`${API_BASE}/api/projects/sync`, { projects }));
}

/** 更新站点配置（只提交本次改动的字段） */
export function saveSiteConfig(updates: Record<string, unknown>): Promise<WriteResult> {
  return serial('config', () => postJson(`${API_BASE}/api/config/update`, { updates }));
}

/** 生成内容快照并推送到服务器仓库与 GitHub 仓库 */
export function pushToGitHub(blogPath?: string): Promise<WriteResult> {
  return postJson(`${API_BASE}/api/deploy/publish`, { blogPath: blogPath || '' });
}
