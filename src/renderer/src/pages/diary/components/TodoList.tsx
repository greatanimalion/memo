import React from "react";
import { Badge, Empty } from "antd";
import dayjs from "dayjs";
import type { FormInstance } from "antd";

interface TodoListProps {
  diaryData: Record<
    string,
    {
      todos: Array<{ text: string; completed: boolean }>;
      note?: string;
    }
  >;
  setSelectedDate: (date: dayjs.Dayjs | null) => void;
  setIsModalOpen: (open: boolean) => void;
  form: FormInstance;
}

const TodoList: React.FC<TodoListProps> = ({
  diaryData,
  setSelectedDate,
  setIsModalOpen,
  form,
}) => {
  return (
    <div className="rounded-2xl p-6 shadow-lg" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="mb-4">
        <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>本月待办概览</h2>
      </div>
      {Object.keys(diaryData).length === 0 ? (
        <Empty description="暂无待办事项，点击日历添加" />
      ) : (
        <div className="space-y-3">
          {Object.entries(diaryData)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .slice(0, 10)
            .map(([dateKey, data]) => {
              const incompleteTodos = data.todos.filter(
                (t) => !t.completed,
              ).length;
              return (
                <div
                  key={dateKey}
                  onClick={() => {
                    setSelectedDate(dayjs(dateKey));
                    form.setFieldsValue({
                      todos: data.todos.map((todo) => ({
                        text: todo.text,
                        completed: todo.completed,
                      })),
                      note: data.note || "",
                    });
                    setIsModalOpen(true);
                  }}
                  className="flex items-center justify-between p-4 rounded-xl transition-colors cursor-pointer"
                  style={{ backgroundColor: "var(--bg-tertiary)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-tertiary)")}
                >
                  <div className="flex items-center gap-4">
                    <div className="text-sm font-medium text-blue-600">
                      {dateKey}
                    </div>
                    {incompleteTodos > 0 && (
                      <Badge
                        count={`${incompleteTodos} 待完成`}
                        style={{ backgroundColor: "#ef4444" }}
                      />
                    )}
                    {data.note && <Badge count="有笔记" color="blue" />}
                  </div>
                  <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                    {data.todos.length > 0 &&
                      `${data.todos.filter((t) => t.completed).length}/${data.todos.length} 已完成`}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
};

export default TodoList;