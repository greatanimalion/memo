import type { Memory } from "../../../types";

export const toggleFileStar = (files: Memory[], fileId: string): Memory[] => {
  return files.map((item) =>
    item.id === fileId ? { ...item, starred: item.starred ? 0 : 1 } : item,
  );
};

export function getReadableByteSize(str: string) {
  const bytes = new Blob([str]).size;
  if (bytes === 0) return "0B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const sizeValue = (bytes / Math.pow(k, i)).toFixed(2);
  return `${sizeValue}${sizes[i]}`;
}

export function fileToText(file: File, encoding: string = "UTF-8") {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file, encoding);
  });
}

export function getExtension(filename: string): string {
  const lastIndex = filename.lastIndexOf(".");
  if (lastIndex === -1 || lastIndex === filename.length - 1) return "";
  return filename.substring(lastIndex + 1);
}
