export interface MyAgent {
  id: string;
  name: string;
  description: string;
  content: string;
  [key: string]: any;
}

export interface Message {
  role: string;
  content: string;
  timestamp: number;
  // 可以根据需要添加更多用户属性
  [key: string]: any;
}
