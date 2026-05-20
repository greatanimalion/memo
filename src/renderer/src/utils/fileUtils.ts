/**
 * 文件工具函数
 */

import type { Memory } from '../../../types';

/**
 * 根据名称查找文件
 * @param name 文件名（可包含路径，如："文件夹/文件名"）
 * @param allFiles 根目录文件列表
 * @param subFolderContents 子文件夹内容映射
 * @returns 找到的文件或 null
 */
export const findFileByName = (
  name: string,
  allFiles: Memory[],
  subFolderContents: Record<string, Memory[]>
): Memory | null => {
  // 先在根目录中查找
  const foundInAll = allFiles.find(file => file.title === name);
  if (foundInAll) return foundInAll;

  // 如果名称包含路径，则在子文件夹中查找
  if (name.includes('/')) {
    const [folderName, fileName] = name.split('/');
    const subFiles = subFolderContents[folderName];
    if (subFiles) {
      const found = subFiles.find(file => file.title === fileName);
      return found || null;
    }
  }

  return null;
};

/**
 * 切换文件的收藏状态
 * @param files 文件列表
 * @param fileId 文件ID
 * @returns 更新后的文件列表
 */
export const toggleFileStar = (files: Memory[], fileId: string): Memory[] => {
  return files.map(item =>
    item.id === fileId ? { ...item, starred: item.starred ? 0 : 1 } : item
  );
};

/**
 * 根据 ID 查找文件
 * @param files 文件列表
 * @param fileId 文件ID
 * @returns 找到的文件或 undefined
 */
export const findFileById = (files: Memory[], fileId: string): Memory | undefined => {
  return files.find(file => file.id === fileId);
};

/**
 * 获取文件的扩展名
 * @param fileName 文件名
 * @returns 扩展名（不含点），如 "txt"、"md"
 */
export const getFileExtension = (fileName: string): string => {
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex === -1) return '';
  return fileName.slice(lastDotIndex + 1).toLowerCase();
};

/**
 * 判断是否为文本文件
 * @param fileName 文件名
 * @returns 是否为文本文件
 */
export const isTextFile = (fileName: string): boolean => {
  const textExtensions = ['txt', 'md', 'js', 'ts', 'tsx', 'jsx', 'json', 'html', 'css', 'xml', 'yaml', 'yml'];
  const ext = getFileExtension(fileName);
  return textExtensions.includes(ext);
};

/**
 * 获取文件图标（根据扩展名）
 * @param fileName 文件名
 * @returns 图标类型或颜色
 */
export const getFileIconInfo = (fileName: string) => {
  const ext = getFileExtension(fileName);
  
  const iconMap: Record<string, { color: string; icon: string }> = {
    pdf: { color: 'text-red-500', icon: 'PDF' },
    doc: { color: 'text-blue-600', icon: 'DOC' },
    docx: { color: 'text-blue-600', icon: 'DOCX' },
    xls: { color: 'text-green-500', icon: 'XLS' },
    xlsx: { color: 'text-green-500', icon: 'XLSX' },
    ppt: { color: 'text-orange-500', icon: 'PPT' },
    pptx: { color: 'text-orange-500', icon: 'PPTX' },
    jpg: { color: 'text-purple-500', icon: 'IMG' },
    jpeg: { color: 'text-purple-500', icon: 'IMG' },
    png: { color: 'text-purple-500', icon: 'IMG' },
    gif: { color: 'text-purple-500', icon: 'IMG' },
    zip: { color: 'text-yellow-600', icon: 'ZIP' },
    rar: { color: 'text-yellow-600', icon: 'RAR' },
  };

  return iconMap[ext] || { color: 'text-gray-500', icon: 'FILE' };
};


export function getReadableByteSize(str: string) {
  // 1. 获取原始字节数
  const bytes = new Blob([str]).size;
  
  // 2. 单位换算逻辑
  if (bytes === 0) return '0B';

  const k = 1024; // 进制
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  
  // Math.floor 向下取整，确定当前属于哪个单位层级
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  // 3. 计算具体数值并保留2位小数
  // 如果不需要小数，可以去掉 .toFixed(2)
  const sizeValue = (bytes / Math.pow(k, i)).toFixed(2);
  
  return `${sizeValue}${sizes[i]}`;
}
/**
 * 将 File 对象转换为字符串
 * @param {File} file - 文件对象
 * @param {string} encoding - 编码格式，默认为 UTF-8
 * @returns {Promise<string>} - 文件内容的字符串
 */
export function fileToText(file: File, encoding: string = 'UTF-8') {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();

        // 读取成功
        reader.onload = (e) => {
            resolve(e.target?.result as string);
        };

        // 读取失败
        reader.onerror = (e) => {
            reject(e);
        };

        // 开始读取
        reader.readAsText(file, encoding);
    });
}
/**
 * 获取文件扩展名
*/
export function getExtension(filename: string): string {
    // 1. 找到最后一个点的位置
    const lastIndex = filename.lastIndexOf('.');
    
    // 2. 如果没有点，或者点在最后一位，说明没有后缀
    if (lastIndex === -1 || lastIndex === filename.length - 1) {
        return '';
    }
    
    // 3. 截取后缀
    return filename.substring(lastIndex + 1);
}