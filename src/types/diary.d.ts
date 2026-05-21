export interface TodoItem {
  id: number //时间戳
  text: string
  completed: boolean
}
export interface DiaryData {
  [key: string]: {
    todos: TodoItem[]
    note?: string
  }
}

export interface Diary {
  id: string
  monthDiarys: DiaryData
}