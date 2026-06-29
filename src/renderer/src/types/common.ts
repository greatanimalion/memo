// 视图类型
export type ViewType =
  | "home"
  | "memo"
  | "diary"
  | "settings"
  | "chat"
  | "person"
  | "web"
  | "textEditor";

// AI 聊天消息类型
export type MessageType = "user" | "system";

export type { TodoItem } from "../../../types";
export type { DiaryData } from "../../../types";
export type { Diary } from "../../../types";

// AI Key
export interface AIKey {
  id: number;
  model: string;
  key: string;
  provider?: string;
  masked: boolean;
}
// 智能体接口
export type { MyAgent } from "../../../types";
// 视图模式
export type ViewMode = "grid" | "list";
// 排序方式
export type SortBy = "date" | "name";

// 菜单项
export interface MenuItem {
  id: ViewType;
  label: string;
  icon: React.ReactNode;
  count: number | null;
}
export type FontFamily = "sans" | "serif" | "mono" | "kaiti" | "songti";

export interface EditorSettings {
  fontFamily: FontFamily;
  fontSize: number;
  lineHeight: number;
}
// 分卷接口
export type { Volume } from "../../../types";
// 文件类型
export type FileType = "folder" | "file";
export type { Book } from "../../../types";
export type { Chapter } from "../../../types";
export type { BookUtils } from "../../../types";
