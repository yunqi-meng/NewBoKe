#!/usr/bin/env node
/**
 * 管理后台密码工具。
 *
 * 用法：
 *   node scripts/manager-passwd.mjs "你的密码"                       只打印密码哈希
 *   node scripts/manager-passwd.mjs "你的密码" --env-file /etc/xhblogs-manager.env
 *                                                               同时把哈希写进 env 文件
 *   node scripts/manager-passwd.mjs --secret --env-file /etc/xhblogs-manager.env
 *                                                               生成随机会话密钥写进 env 文件
 *
 * 说明：密码只从命令行传入，脚本不会把明文口令写进任何文件，
 * 仓库里也不会保存任何凭据。哈希格式与 lib/auth.ts 保持一致。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);

function parseArgs(list) {
  const result = { envFile: null, key: null, secret: false, password: null };
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index];
    if (item === '--env-file') result.envFile = list[++index];
    else if (item === '--key') result.key = list[++index];
    else if (item === '--secret') result.secret = true;
    else if (!item.startsWith('--') && result.password === null) result.password = item;
  }
  return result;
}

function hashPassword(password) {
  const N = 16384;
  const r = 8;
  const p = 1;
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function upsertEnv(envFile, key, value) {
  const lines = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8').split(/\r?\n/) : [];
  const pattern = new RegExp(`^${key}=`);
  const index = lines.findIndex((line) => pattern.test(line));
  if (index >= 0) lines[index] = `${key}=${value}`;
  else {
    if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
    lines.push(`${key}=${value}`);
  }
  fs.mkdirSync(path.dirname(envFile), { recursive: true });
  fs.writeFileSync(envFile, `${lines.join('\n').replace(/\n+$/, '')}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(envFile, 0o600);
  } catch {
    /* Windows 上没有权限位，忽略 */
  }
}

const options = parseArgs(args);

if (options.secret) {
  const secret = crypto.randomBytes(32).toString('hex');
  if (options.envFile) {
    upsertEnv(options.envFile, options.key || 'MANAGER_SESSION_SECRET', secret);
    console.log(`会话密钥已写入 ${options.envFile}`);
  } else {
    console.log(secret);
  }
  process.exit(0);
}

if (!options.password) {
  console.error('请提供密码，例如：node scripts/manager-passwd.mjs "你的密码"');
  process.exit(1);
}

const hash = hashPassword(options.password);

if (options.envFile) {
  upsertEnv(options.envFile, options.key || 'MANAGER_ADMIN_PASSWORD_HASH', hash);
  console.log(`密码哈希已写入 ${options.envFile}`);
} else {
  console.log(hash);
}
