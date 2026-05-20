export interface Chapter {
  id: string;
  title: string;
  content: string;
  wordCount?: number;
  order?: number;
  createdAt?: number;
  updatedAt?: number;
  metadata?: ChapterMetadata;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  cover: string;
  chapters: Chapter[];
}

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