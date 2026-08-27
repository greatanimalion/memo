// 视图类型
export type ViewType =
  "home" | "memo" | "diary" | "settings" | "chat" | "person" | "web";

// AI 聊天消息类型
export type MessageType = "user" | "system";

export type { TodoItem } from "@type/diary";
export type { DiaryData } from "@type/diary";
export type { Diary } from "@type/diary";

// AI Key
export interface AIKey {
  id: number;
  model: string;
  key: string;
  provider?: string;
  masked: boolean;
}
// 智能体接口
export type { MyAgent } from "@type/agents";
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
export type { Volume } from "@type/book";
// 文件类型
export type FileType = "folder" | "file";
export type { Book } from "@type/book";
export type { BookDetail } from "@type/book";
export type { Chapter } from "@type/book";
export type { BookUtils } from "@type/book";
