
// 视图类型
export type ViewType = 'home' | 'memo' | 'diary' | 'settings' | 'chat'|'person'|'web'

// AI 聊天消息类型
export type MessageType = 'user' | 'system'

// 日记待办事项
export interface TodoItem {
  id: number
  text: string
  completed: boolean
}

// 日记数据
export interface DiaryData {
  [key: string]: {
    todos: TodoItem[]
    note?: string
  }
}
//一个月为一个单位获日记
export interface Diary {
  id: string
  monthDiarys: DiaryData
  // 可以根据需要添加更多用户属性
  [key: string]: any
}
// AI Key
export interface AIKey {
  id: number
  model: string
  key: string
  provider?: string
  masked: boolean
}


// 视图模式
export type ViewMode = 'grid' | 'list'

// 排序方式
export type SortBy = 'date' | 'name'

// 菜单项
export interface MenuItem {
  id: ViewType
  label: string
  icon: React.ReactNode
  count: number | null
}


export interface ChapterMetadata {
  aiEnhanced: boolean
  tags: string[]
  summary: string
}



export interface BookSettings {
  maxChapterWords: number
  wordCountMode: 'chinese' | 'english'
}



export type FontFamily = 'sans' | 'serif' | 'mono' | 'kaiti' | 'songti'

export interface EditorSettings {
  fontFamily: FontFamily
  fontSize: number
  lineHeight: number
}
