import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '../../../lib/auth';

export const runtime = 'nodejs';
const readable = new Set(['settings', 'issues', 'status', 'drafts', 'agents', 'events', 'assets', 'connection-info']);

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const host = request.headers.get('host') ?? '';
  const isLocalHost = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host);
  // 公网访问时本机限制会失效，改为要求携带有效登录会话
  const isAuthenticated = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!isLocalHost && !isAuthenticated) return Response.json({ detail: '此接口需要登录管理后台' }, { status: 403 });
  const parts = (await context.params).path;
  const endpoint = parts.join('/');
  const valid = request.method === 'GET' ? parts.length === 1 && readable.has(endpoint)
    : request.method === 'PUT' ? endpoint === 'settings' || /^drafts\/[a-f0-9]{24}$/.test(endpoint)
    : request.method === 'POST' && (['drafts', 'agents', 'covers'].includes(endpoint) || /^issues\/\d{4}\.\d{2}\.\d{2}\/draft$/.test(endpoint) || /^drafts\/[a-f0-9]{24}\/(publish|withdraw)$/.test(endpoint) || /^agents\/[a-f0-9]{16}\/revoke$/.test(endpoint));
  if (!valid) return Response.json({ detail: '接口或操作不存在' }, { status: 404 });
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin');
    const originHost = origin ? (() => { try { return new URL(origin).host; } catch { return ''; } })() : '';
    if (origin && originHost !== host) return Response.json({ detail: '仅允许控制台页面自身发起保存' }, { status: 403 });
  }
  try {
    const body = request.method !== 'GET' ? await request.text() : undefined;
    const maximum = endpoint === 'covers' ? 4300000 : endpoint === 'settings' ? 64000 : 256000;
    if (body && Buffer.byteLength(body) > maximum) return Response.json({ detail: '提交内容过大' }, { status: 413 });
    const root = process.env.XHS_MANAGER_ROOT ?? process.cwd();
    const port = Number(process.env.XHS_BRIEFING_API_PORT ?? JSON.parse(await fs.readFile(path.join(root, 'public/backend_config.json'), 'utf8')).api_port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local port');
    const token = await fs.readFile(path.join(root, 'manager_data/briefing/.admin-token'), 'utf8');
    const response = await fetch(`http://127.0.0.1:${port}/api/briefing/${endpoint}`, {
      method: request.method,
      headers: { 'Content-Type': 'application/json', 'X-Briefing-Admin': token.trim() },
      body,
      cache: 'no-store', signal: AbortSignal.timeout(8000),
    });
    return new Response(await response.text(), { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ detail: '本机选刊服务尚未连接，请使用 Start.bat 启动控制台，并检查仓库设置中的网站路径。' }, { status: 503 });
  }
}

export const GET = forward;
export const PUT = forward;
export const POST = forward;
