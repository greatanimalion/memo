export interface TodoItem {
  id: string
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