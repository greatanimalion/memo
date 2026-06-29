import * as crypto from 'crypto';
import { app } from 'electron';
import path from 'path';

// 生成32字节的密钥，适配AES-256-CBC算法
export const ENCRYPT_KEY = crypto.createHash('sha256').update('memo-app-encrypt-key-2024').digest();

// 加密（可逆）
export function encrypt(content: string, key: string | Buffer): string {
  const algorithm = 'aes-256-gcm';
  const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv);
  const encrypted = cipher.update(content, 'utf8', 'hex') + cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + authTag + ':' + encrypted;
}

// 解密
export function decrypt(encrypted: string, key: string | Buffer): string {
  const algorithm = 'aes-256-gcm';
  const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key);
  const parts = encrypted.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encryptedData = parts[2];
  const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encryptedData, 'hex', 'utf8') + decipher.final('utf8');
}

export function getSystemRootDir(): string {
  try {
    if (process.platform === "win32") {
      const exePath = app.getPath("exe");
      const rootDir = path.parse(exePath).root;
      return rootDir;
    } else {
      return "/";
    }
  } catch {
    return process.platform === "win32" ? "C:\\" : "/";
  }
}
export function getDatabasePath(): string {
  const env = process.env.NODE_ENV;
  if (env === 'development') {
    return path.join(__dirname, '../data/', 'storage.db');
  }
  const systemRoot = getSystemRootDir();
  return path.join(systemRoot, '.MemoryData/', 'storage.db');
}