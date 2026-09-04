export interface BookUtilsAttribute {
  id: string;
  BookUtilsID: string;
  key: string;
  value: string;
}

export interface BookUtils {
  id: string;
  BookID: string;
  image: string[];
  type: string;
  description: string;
  list: BookUtilsAttribute[];
  createTime: number;
}

export interface ChapterMetadata {
  aiEnhanced: boolean;
  tags: string[];
  summary: string;
}

export interface BookSettings {
  maxChapterWords: number;
  wordCountMode: "chinese" | "english"|'all';
}

// 章节接口
export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  content: string;
  wordCount?: number;
  order?: number;
  volumeId?: string;
  createdAt?: number;
  updatedAt?: number;
  metadata?: ChapterMetadata;
}

// 书籍接口
export interface Book {
  id: string;
  title: string;
  cover: string;
  tags: string[];
  description?: string;
  createdAt?: number;
  updatedAt?: number;
  settings?: BookSettings;
}

export interface Volume {
  id: string;
  bookId: string;
  title: string;
  order?: number;
  createdAt?: number;
}

// 带章节和卷的完整书籍（用于查询返回）
export interface BookDetail extends Book {
  chapters: Chapter[];
  volumes: Volume[];
}

// Book Agent 对话消息
export interface BookAgentMessage {
  agent: string;
  role: string;
  content: string;
  timestamp: number;
}

// Book Agent 对话记录
export interface BookAgent {
  id: string;
  bookId: string;
  title: string;
  messages: BookAgentMessage[];
  status: "running" | "done" | "error" | "cancelled";
  createdAt: number;
  updatedAt: number;
}
