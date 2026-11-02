/** 离线测试：node --test tools/test-frontend-regressions.mjs
 * 复用项目自带 TypeScript 编译器；网关的上游均由 fetch stub 隔离。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'XHBlogs/package.json'));
const ts = require('typescript');
const plain = value => JSON.parse(JSON.stringify(value));

function load(relative, { fetch, modules = {} } = {}) {
  const filename = path.join(root, relative);
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const module = { exports: {} };
  const context = vm.createContext({
    module, exports: module.exports, Headers, Request, Response, AbortSignal, Buffer, URL,
    process: { env: { XHS_REVALIDATE_SECRET: 'test-secret' } },
    console: { error() {} }, fetch,
    require(name) {
      if (name in modules) return modules[name];
      throw new Error(`Unmocked dependency: ${name}`);
    },
  });
  vm.runInContext(outputText, context, { filename });
  return module.exports;
}

const backendPort = { backendBaseUrl: async () => 'http://backend' };

for (const project of ['XHBlogs', 'my-blog-manager']) {
  test(`${project}: 音乐库尚未加载时可以服务端渲染`, () => {
    const React = require('react');
    const { renderToString } = require('react-dom/server');
    const { MusicProvider } = load(`${project}/components/MusicProvider.tsx`, {
      modules: {
        react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
        '../lib/music': load(`${project}/lib/music.ts`),
        '../lib/consoleBasePath': { withBasePath: value => value },
      },
    });
    assert.match(renderToString(React.createElement(MusicProvider, null, 'content')), /content/);
  });
  test(`${project}: 歌词支持重复时间戳、毫秒、排序及边界查询`, () => {
    const { parseLrc, lyricAt, isLocalMusicTrack } = load(`${project}/lib/music.ts`);
    const lines = parseLrc('[00:03.123]结束\n[00:01.50][00:02.00]开\u200b始\n[00:99.00]无效');
    assert.deepEqual(plain(lines), [
      { time: 1.5, text: '开始' }, { time: 2, text: '开始' }, { time: 3.123, text: '结束' },
    ]);
    assert.equal(lyricAt(lines, 0), undefined);
    assert.equal(lyricAt(lines, 1.5).text, '开始');
    assert.equal(lyricAt(lines, 100).text, '结束');
    assert.equal(lyricAt([], 10), undefined);
    assert.equal(parseLrc('x'.repeat(30001)).length, 0);
    assert.equal(isLocalMusicTrack(null), false);
    assert.equal(isLocalMusicTrack({ id: '1', file: 'a.mp3', available: false }), false);
    assert.equal(isLocalMusicTrack({ id: '1', file: 'a.mp3' }), true);
  });

  test(`${project}: 配置合并保留默认值、允许清空数组并拒绝原型字段`, () => {
    const { deepMerge } = load(`${project}/lib/siteConfigMerge.ts`);
    const base = { social: { github: 'original', mail: 'mail' }, bgGroups: ['one'] };
    const patch = JSON.parse('{"social":{"github":"updated"},"bgGroups":[],"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}');
    const merged = deepMerge(base, patch);
    assert.deepEqual(plain(merged), { social: { github: 'updated', mail: 'mail' }, bgGroups: [] });
    assert.equal(merged.polluted, undefined);
    assert.equal(base.social.github, 'original');
  });

  test(`${project}: SVG 图片网关保留 sandbox 和 nosniff`, async () => {
    const moduleName = project === 'XHBlogs' ? '../../../lib/backend' : '../../../lib/backendPort';
    const backend = project === 'XHBlogs' ? { resolveBackendBase: async () => 'http://backend' } : backendPort;
    const route = load(`${project}/app/uploads/[...path]/route.ts`, {
      modules: { [moduleName]: backend },
      fetch: async () => new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }),
    });
    const response = await route.GET(new Request('http://site/uploads/a.svg'), {
      params: Promise.resolve({ path: ['a.svg'] }),
    });
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('content-security-policy'), /sandbox/);
    assert.equal(await response.text(), '<svg/>');
    for (const segments of [['..\\private'], ['C:private'], ['nested', 'a.svg']]) {
      assert.equal((await route.GET({}, { params: Promise.resolve({ path: segments }) })).status, 400);
    }
  });
}

test('管理网关流式转发 multipart 并保留 Cookie、Range 及安全响应头', async () => {
  const form = new FormData();
  form.append('file', new Blob(['audio payload']), 'test.mp3');
  const request = new Request('http://console/api/proxy/api/music/upload', { method: 'POST', body: form });
  request.nextUrl = new URL(request.url);
  request.headers.set('Cookie', 'xh_mgr_session=test');
  request.headers.set('User-Agent', 'regression-test');
  const route = load('my-blog-manager/app/api/proxy/[...path]/route.ts', {
    modules: { '../../../../lib/backendPort': backendPort },
    fetch: async (target, init) => {
      assert.equal(target, 'http://backend/api/music/upload');
      assert.equal(init.body, request.body);
      assert.equal(init.duplex, 'half');
      assert.equal(init.headers.get('cookie'), 'xh_mgr_session=test');
      assert.equal(init.headers.get('user-agent'), 'regression-test');
      assert.match(await new Response(init.body).text(), /audio payload/);
      return new Response('partial', { status: 206, headers: {
        'Content-Range': 'bytes 0-6/100', 'Accept-Ranges': 'bytes',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Set-Cookie': 'one=1',
      } });
    },
  });
  const response = await route.POST(request, { params: Promise.resolve({ path: ['api', 'music', 'upload'] }) });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 0-6/100');
  assert.match(response.headers.get('content-security-policy'), /sandbox/);
  assert.equal(response.headers.get('set-cookie'), 'one=1');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('管理网关拒绝代理路径穿越', async () => {
  const route = load('my-blog-manager/app/api/proxy/[...path]/route.ts', {
    modules: { '../../../../lib/backendPort': backendPort },
    fetch: () => { throw new Error('must not fetch'); },
  });
  for (const part of ['..', '.', 'nested/escape', 'nested\\escape']) {
    const response = await route.GET({}, { params: Promise.resolve({ path: ['api', part] }) });
    assert.equal(response.status, 400);
  }
});

test('公开音乐网关无法通过路径穿越访问其他后端接口', async () => {
  const route = load('XHBlogs/app/api/music/[...path]/route.ts', {
    modules: { '@/lib/backend': { resolveBackendBase: async () => 'http://backend' } },
    fetch: () => { throw new Error('must not fetch'); },
  });
  for (const segments of [['file', '..', '..', 'config'], ['file', '..\\secret'], ['drafts']]) {
    const response = await route.GET({}, { params: Promise.resolve({ path: segments }) });
    assert.equal(response.status, 404);
  }
});

test('登录状态网关传递 Cookie，后端故障或格式错误时保持鉴权要求', async () => {
  let upstream = Response.json({ success: true, authEnabled: true, authenticated: true });
  const route = load('my-blog-manager/app/api/auth/login/route.ts', {
    modules: { '../../../../lib/backendPort': backendPort },
    fetch: async (_url, init) => {
      assert.equal(init.headers.Cookie, 'xh_mgr_session=test');
      return upstream;
    },
  });
  const request = new Request('http://console/api/auth/login', { headers: { Cookie: 'xh_mgr_session=test' } });
  assert.equal((await (await route.GET(request)).json()).authenticated, true);
  for (const invalid of [Response.json({}, { status: 500 }), Response.json({})]) {
    upstream = invalid;
    const response = await route.GET(request);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).authEnabled, true);
  }
});

test('全局管理入口在后端错误时拒绝放行', async () => {
  const route = load('my-blog-manager/proxy.ts', {
    modules: {
      'next/server': { NextResponse: {
        next: () => ({ allowed: true }), json: Response.json,
        redirect: url => new Response(null, { status: 307, headers: { Location: String(url) } }),
      } },
      './lib/auth': { SESSION_COOKIE: 'xh_mgr_session' },
      './lib/backendPort': backendPort,
      './lib/consoleBasePath': { stripBasePath: value => value, withBasePath: value => value },
    },
    fetch: async () => Response.json({ authEnabled: false }, { status: 500 }),
  });
  const request = { url: 'http://console/settings', nextUrl: new URL('http://console/settings'), cookies: { get() {} } };
  const response = await route.proxy(request);
  assert.equal(response.status, 307);
  assert.match(response.headers.get('location'), /\/login\?next=/);
  request.nextUrl = new URL('http://console/api/proxy/api/config/get');
  assert.equal((await route.proxy(request)).status, 401);
});

test('发布 webhook 让内容缓存立即过期且拒绝无效密钥', async () => {
  const calls = [];
  const route = load('XHBlogs/app/api/revalidate/route.ts', {
    modules: { 'next/cache': { revalidateTag: (...args) => calls.push(plain(args)) } },
  });
  const denied = await route.POST(new Request('http://site/api/revalidate', { method: 'POST' }));
  assert.equal(denied.status, 401);
  assert.equal(calls.length, 0);
  const response = await route.POST(new Request('http://site/api/revalidate', {
    method: 'POST', headers: { 'X-Revalidate-Token': 'test-secret' },
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [['content', { expire: 0 }]]);
});
