export interface Message {
  role: string;
  content: string;
  [key: string]: any;
}

export interface Session {
  id: string;
  title: string;
  lastUpdated: number;
  messages: Message[];
  description?: string;
  [key: string]: any;
}
