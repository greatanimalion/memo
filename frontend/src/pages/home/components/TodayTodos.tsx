import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { Checkbox, Empty, Input, Button, Progress } from "antd";
import {
  CalendarOutlined,
  PlusOutlined,
  DeleteOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { useDiary } from "@renderer/hooks/useDiary";
import { getDiaryById } from "@renderer/services/diary";

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

const TodayTodos: React.FC = () => {
  const navigate = useNavigate();
  const { diaryData, setDiaryData, addTodo, toggleTodo, deleteTodo } = useDiary();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const todayKey = dayjs().format("YYYY-MM-DD");
  const monthKey = todayKey.substring(0, 7);
  const weekday = `周${WEEK[dayjs().toDate().getDay()]}`;

  // 失败时回滚：重新拉取本月数据
  const reload = async () => {
    const res = await getDiaryById(monthKey);
    if (!res) {
      setDiaryData({});
      return;
    }
    const monthDiarys =
      typeof res.monthDiarys === "string"
        ? JSON.parse(res.monthDiarys)
        : res.monthDiarys;
    setDiaryData(monthDiarys || {});
  };

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      console.log(error);
      await reload().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = () => {
    const value = text.trim();
    if (!value) return;
    setText("");
    run(() => addTodo(todayKey, value));
  };

  const todayData = diaryData[todayKey] || { todos: [], note: "" };
  const todos = todayData.todos;
  const completed = todos.filter((todo) => todo.completed).length;
  const pending = todos.length - completed;
  const percent = todos.length > 0 ? Math.round((completed / todos.length) * 100) : 0;

  return (
    <div
      className="rounded-2xl p-6 shadow-lg"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <CalendarOutlined
          className="text-2xl"
          style={{ color: "var(--accent-color)" }}
        />
        <h2
          className="text-2xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          当天待办
        </h2>
        <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          {dayjs().format("MM-DD")} {weekday}
        </span>
        <span className="ml-auto text-sm" style={{ color: "var(--text-secondary)" }}>
          已完成 {completed}/{todos.length}
          {pending > 0 && (
            <span style={{ color: "#ef4444" }}> · 待完成 {pending}</span>
          )}
        </span>
        <Button
          type="text"
          size="small"
          onClick={() => navigate("/diary")}
          style={{ color: "var(--accent-color)" }}
        >
          去日记 <RightOutlined />
        </Button>
      </div>

      <Progress
        className="mt-3"
        percent={percent}
        size="small"
        showInfo={false}
        strokeColor="var(--accent-color)"
        trailColor="var(--bg-tertiary)"
      />

      <div className="mt-4 space-y-1 max-h-96 overflow-y-auto pr-1">
        {todos.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="今天还没有待办，添加一条吧"
          />
        ) : (
          todos.map((todo) => (
            <div
              key={todo.id}
              className="group flex items-center gap-2 p-3 rounded-xl"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            >
              <Checkbox
                checked={todo.completed}
                disabled={busy}
                onChange={() => run(() => toggleTodo(todayKey, todo.id))}
              />
              <span
                className="flex-1 text-sm min-w-0 break-words"
                style={{
                  color: todo.completed
                    ? "var(--text-tertiary)"
                    : "var(--text-secondary)",
                  textDecoration: todo.completed ? "line-through" : "none",
                }}
              >
                {todo.text}
              </span>
              <Button
                type="text"
                size="small"
                className="opacity-0 group-hover:opacity-100"
                disabled={busy}
                onClick={() => run(() => deleteTodo(todayKey, todo.id))}
                style={{ color: "var(--text-tertiary)" }}
              >
                <DeleteOutlined />
              </Button>
            </div>
          ))
        )}
      </div>

      <div
        className="mt-4 pt-4 flex items-center gap-2"
        style={{ borderTop: "1px solid var(--border-color)" }}
      >
        <Input
          size="small"
          placeholder="添加待办，回车确认"
          value={text}
          allowClear
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onPressEnter={handleAdd}
        />
        <Button
          size="small"
          icon={<PlusOutlined />}
          disabled={busy || text.trim() === ""}
          onClick={handleAdd}
          style={{ color: "var(--accent-color)", borderColor: "var(--accent-color)" }}
        >
          添加
        </Button>
      </div>
    </div>
  );
};

export default TodayTodos;
