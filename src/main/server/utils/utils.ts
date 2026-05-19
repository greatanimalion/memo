import * as crypto from 'crypto';
import { app } from 'electron';
import path from 'path';

// 生成32字节的密钥，适配AES-256-CBC算法
export const ENCRYPT_KEY = crypto.createHash('sha256').update('your-secret-key').digest();

// 加密（可逆）
export function encrypt(content: string, key: string | Buffer): string {
  const algorithm = 'aes-256-cbc';
  const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key);
  const iv = Buffer.alloc(16, 0);
  const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv);
  return cipher.update(content, 'utf8', 'hex') + cipher.final('hex');
}

// 解密
export function decrypt(encrypted: string, key: string | Buffer): string {
  const algorithm = 'aes-256-cbc';
  const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key);
  const iv = Buffer.alloc(16, 0);
  const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);
  return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
}

export function getSystemRootDir(): string {
  if (process.platform === "win32") {
    // 获取可执行文件路径并提取盘符（如 C:\）
    const exePath = app.getPath("exe");
    const rootDir = path.parse(exePath).root;
    return rootDir;
  } else {
    // Unix-like 系统直接返回 /
    return "/";
  }
}