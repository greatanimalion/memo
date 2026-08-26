import React from "react";
import { Calendar, Badge } from "antd";
import type { CalendarProps } from "antd";
import dayjs, { Dayjs } from "dayjs";
import Select from "antd/es/select";
import { Button } from "antd";

import type { FormInstance } from "antd";

interface CalendarViewProps {
  getDateData: (dateKey: string) => {
    todos: Array<{ text: string; completed: boolean }>;
    note?: string;
  };
  handleDateSelect: (value: Dayjs) => void;
  handleMonthChange: (value: Dayjs) => void;
  setSelectedDate: (date: Dayjs | null) => void;
  setIsModalOpen: (open: boolean) => void;
  form: FormInstance;
}

const CalendarView: React.FC<CalendarViewProps> = ({
  getDateData,
  handleDateSelect,
  handleMonthChange,
  setSelectedDate,
  setIsModalOpen,
  form,
}) => {
  const dateCellRender: CalendarProps<Dayjs>["cellRender"] = (value) => {
    const dateKey = value.format("YYYY-MM-DD");
    const data = getDateData(dateKey);
    const incompleteTodos = data.todos.filter((todo) => !todo.completed).length;
    return (
      <div className="flex gap-1 items-center justify-center">
        {data.todos.length > 0 && (
          <Badge
            count={incompleteTodos}
            color={"#ef4444"}
            style={{
              fontSize: "10px",
              height: "16px",
              lineHeight: "16px",
              minWidth: "16px",
            }}
          />
        )}
        {data.note && <Badge dot color="#3b82f6" />}
      </div>
    );
  };

  const handleDateSelectWithModal: CalendarProps<Dayjs>["onSelect"] = (
    value,
  ) => {
    handleDateSelect(value);
    const dateKey = value.format("YYYY-MM-DD");
    const data = getDateData(dateKey);
    form.setFieldsValue({
      todos: data.todos.map((todo) => ({
        text: todo.text,
        completed: todo.completed,
      })),
      note: data.note ?? "",
    });
    //@ts-ignore
    if (window.___NOTPOPEN) return;
    setIsModalOpen(true);
  };

  const headerRender: CalendarProps<Dayjs>["headerRender"] = ({
    value,
    onChange,
  }) => {
    const year = value.year();
    const month = value.month();

    const monthOptions = Array.from({ length: 12 }, (_, i) => ({
      label: `${i + 1}月`,
      value: i,
    }));

    const yearOptions = Array.from({ length: 21 }, (_, i) => ({
      label: `${year - 10 + i}年`,
      value: year - 10 + i,
    }));

    return (
      <div style={{ padding: "8px 0" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Select
              value={year}
              onChange={(newYear: number) => {
                //@ts-ignore
                window.___NOTPOPEN = true;
                const _Y = value.clone().year(newYear);
                onChange?.(_Y);
                handleMonthChange(_Y);
                //@ts-ignore
                window.___NOTPOPEN = false;
              }}
              options={yearOptions}
              style={{ width: 100 }}
              size="middle"
            />
            <Select
              value={month}
              onChange={(newMonth: number) => {
                //@ts-ignore
                window.___NOTPOPEN = true;
                const _m = value.clone().month(newMonth);
                onChange?.(_m);
                handleMonthChange(_m);
                //@ts-ignore
                window.___NOTPOPEN = false;
              }}
              options={monthOptions}
              style={{ width: 90 }}
              size="middle"
            />
          </div>
          <Button type="primary" onClick={() => onChange?.(value.clone())}>
            今天
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl p-6 shadow-lg" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="mb-4">
        <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>日历视图</h2>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>点击日期查看或编辑待办事项</p>
      </div>
      <div>
        <Calendar
          fullscreen={false}
          cellRender={dateCellRender}
          onSelect={handleDateSelectWithModal}
          headerRender={headerRender}
        />
      </div>
    </div>
  );
};

export default CalendarView;