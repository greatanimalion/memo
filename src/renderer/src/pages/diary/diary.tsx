import React, { useState } from "react";
import { Form } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { useDiary } from "@renderer/hooks/useDiary";
import { updateDiary } from "@renderer/services/diary";
import StatsCards from "./components/StatsCards";
import CalendarView from "./components/CalendarView";
import TodoList from "./components/TodoList";
import DiaryModal from "./components/DiaryModal";

const DiaryPage: React.FC = () => {
  const {
    selectedDate,
    setSelectedDate,
    diaryData,
    stats,
    getDateData,
    setDiaryData,
    handleDateSelect,
    handleMonthChange,
  } = useDiary();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  const handleSave = () => {
    form.validateFields().then(async (values) => {
      if (selectedDate) {
        const dateKey = selectedDate.format("YYYY-MM-DD");
        const todos = values.todos
          .map((todo: any, index: number) => ({
            id: index + 1,
            text: todo.text,
            completed: todo.completed,
          }))
          .filter((todo) => todo.text.trim() !== "");

        let newDiary;
        if (!values.note && todos.length === 0) {
          newDiary = { ...diaryData };
          delete newDiary[dateKey];
        } else {
          newDiary = {
            ...diaryData,
            [dateKey]: {
              todos,
              note: values.note.trim() || "",
            },
          };
        }
        const monthKey = dateKey.substring(0, 7);
        updateDiary({
          id: monthKey,
          monthDiarys: newDiary,
        });
        setDiaryData(newDiary);
        setIsModalOpen(false);
      }
    });
  };

  return (
    <div className="flex-1 overflow-y-auto p-8" style={{ backgroundColor: "var(--bg-secondary)" }}>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 页面标题 */}
        <div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>日记</h1>
          <p style={{ color: "var(--text-tertiary)" }}>记录每一天的待办事项和笔记</p>
        </div>

        <StatsCards stats={stats} />
        <CalendarView
          getDateData={getDateData}
          handleDateSelect={handleDateSelect}
          handleMonthChange={handleMonthChange}
          setSelectedDate={setSelectedDate}
          setIsModalOpen={setIsModalOpen}
          form={form}
        />
        <TodoList
          diaryData={diaryData}
          setSelectedDate={setSelectedDate}
          setIsModalOpen={setIsModalOpen}
          form={form}
        />
      </div>

      <DiaryModal
        isOpen={isModalOpen}
        selectedDate={selectedDate}
        form={form}
        onSave={handleSave}
        onCancel={() => setIsModalOpen(false)}
      />
    </div>
  );
};

export default DiaryPage;