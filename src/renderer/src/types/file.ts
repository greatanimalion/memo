export type FileType = "folder" | "file";

export interface FileItem {
  id: number;
  name: string;
  type: FileType;
  count?: number;
  size?: string;
  date: string;
  starred: boolean;
  content?: string;
}

export interface FolderContent {
  name: string;
  items: FileItem[];
}
