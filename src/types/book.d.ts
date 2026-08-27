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
  wordCountMode: "chinese" | "english";
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
  author: string;
  cover: string;
  tags: string[];
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
