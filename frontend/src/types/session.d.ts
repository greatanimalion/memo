export interface Message {
  role: string;
  content: string;
  timestamp?: number;
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
