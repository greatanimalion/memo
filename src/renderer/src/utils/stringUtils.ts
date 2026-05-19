/**
 * 字符串工具函数
 */

/**
 * 遮罩 API Key（显示前4位和后4位，中间用 * 替代）
 * @param key API Key
 * @returns 遮罩后的 Key
 */
export const maskApiKey = (key: string): string => {
  if (key.length <= 8) return '*'.repeat(key.length);
  return key.substring(0, 4) + '*'.repeat(key.length - 8) + key.substring(key.length - 4);
};

/**
 * 截断文本（超出长度显示省略号）
 * @param text 原文本
 * @param maxLength 最大长度
 * @returns 截断后的文本
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};

/**
 * 生成唯一 ID
 * @param prefix 前缀
 * @returns 唯一 ID
 */
export const generateId = (prefix: string = 'id'): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * 格式化文件大小
 * @param bytes 字节数
 * @returns 格式化后的大小（如：1.5 MB）
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

/**
 * 深拷贝对象
 * @param obj 原对象
 * @returns 深拷贝后的对象
 */
export const deepClone = <T>(obj: T): T => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * 防抖函数
 * @param func 要执行的函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的函数
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

/**
 * 节流函数
 * @param func 要执行的函数
 * @param delay 延迟时间（毫秒）
 * @returns 节流后的函数
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    }
  };
};
