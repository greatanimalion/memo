interface Chapter {
  id: string;
  title: string;
  content: string;
}
interface Book {
  id: string;
  title: string;
  author: string;
  cover: string;
  chapters: Chapter[];
}

interface BookUtilsAttribute {
  id: string;
  BookUtilsID: string;
  key: string;
  value: string;
}

interface BookUtils {
  id: string;
  BookID: string;
  image: string[];
  type: string;
  description: string;
  list: BookUtilsAttribute[];
  createTime: number;
}


//环境
