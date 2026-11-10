export interface Memory {
  id: string;
  title: string;
  type?: string;
  isFolder: number; //0||1
  parentId: string;
  created: number;
  updated: number;
  visitedTime?: number;
  count?: number;
  size?: number;
  starred?: number; //0||1
  fileUrl?: string;
}
