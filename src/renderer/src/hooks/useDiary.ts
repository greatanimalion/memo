import { useState, useEffect, useCallback } from "react";
import dayjs, { Dayjs } from "dayjs";
import { DiaryData, TodoItem } from "../types/common";
import { getDiaryById, updateDiary } from "../services/diary";

export const useDiary = () => {
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(null);
  const [diaryData, setDiaryData] = useState<DiaryData>({});
  const [currentYM, setCurrentYM] = useState<Dayjs | null>(null);
  const [stats, setStats] = useState({
    todayTodos: 0,
    totalTodos: 0,
    completedTodos: 0,
    daysWithTodos: 0,
  });
  // 初始化当前年月
  useEffect(() => {
    setCurrentYM(dayjs(Date.now()));
  }, []);
  const initDiary = async () => {
    if (!currentYM) return;
    const dateKey = currentYM.format("YYYY-MM-DD").substring(0, 7);
    const res = await getDiaryById(dateKey);
    if (!res) {
      setDiaryData({});
    } else {
      setDiaryData(res.monthDiarys);
    }
  };
  // 加载日记数据
  useEffect(() => {
    initDiary();
  }, [currentYM]);

  // 计算统计数据
  useEffect(() => {
    if (!currentYM) return;
    const today = new Date(currentYM.toDate());
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const todayData = diaryData[todayKey] || { todos: [], note: "" };
    let totalTodos = 0;
    let completedTodos = 0;
    let daysWithTodos = 0;
    Object.keys(diaryData).forEach((dateKey) => {
      const data = diaryData[dateKey] || { todos: [], note: "" };
      totalTodos += data.todos.length;
      completedTodos += data.todos.filter((t) => t.completed).length;
      if (data.todos.length > 0) daysWithTodos++;
    });
    setStats({
      todayTodos: todayData.todos.filter((t) => !t.completed).length,
      totalTodos,
      completedTodos,
      daysWithTodos,
    });
  }, [diaryData, currentYM]);

  // 获取指定日期的数据
  const getDateData = useCallback(
    (date: string) => {
      return diaryData[date] || { todos: [], note: "" };
    },
    [diaryData],
  );

  // 更新日记数据
  const updateDiaryData = useCallback(
    async (dateKey: string, todos: TodoItem[], note?: string) => {
      const monthKey = dateKey.substring(0, 7);
      let savedData: DiaryData = {};
      setDiaryData((prev) => {
        savedData = {
          ...prev,
          [dateKey]: { todos, note: note || prev[dateKey]?.note },
        };
        return savedData;
      });

      const res = await updateDiary({
        id: monthKey,
        monthDiarys: savedData,
      });

      return res;
    },
    [],
  );

  // 添加待办事项
  const addTodo = useCallback(
    async (dateKey: string, text: string) => {
      const currentData = getDateData(dateKey);
      const newTodo: TodoItem = {
        id: Date.now(),
        text,
        completed: false,
      };
      const newTodos = [...currentData.todos, newTodo];
      await updateDiaryData(dateKey, newTodos, currentData.note);
    },
    [getDateData, updateDiaryData],
  );

  // 切换待办事项状态
  const toggleTodo = useCallback(
    async (dateKey: string, todoId: number) => {
      const currentData = getDateData(dateKey);
      const updatedTodos = currentData.todos.map((todo) =>
        todo.id === todoId ? { ...todo, completed: !todo.completed } : todo,
      );
      await updateDiaryData(dateKey, updatedTodos, currentData.note);
    },
    [getDateData, updateDiaryData],
  );

  // 删除待办事项
  const deleteTodo = useCallback(
    async (dateKey: string, todoId: number) => {
      const currentData = getDateData(dateKey);
      const updatedTodos = currentData.todos.filter(
        (todo) => todo.id !== todoId,
      );
      await updateDiaryData(dateKey, updatedTodos, currentData.note);
    },
    [getDateData, updateDiaryData],
  );

  // 更新笔记
  const updateNote = useCallback(
    async (dateKey: string, note: string) => {
      const currentData = getDateData(dateKey);

      await updateDiaryData(dateKey, currentData.todos, note);
    },
    [getDateData, updateDiaryData],
  );

  // 切换月份
  const handleMonthChange = useCallback((date: Dayjs) => {
    setCurrentYM(date);
  }, []);

  // 选择日期
  const handleDateSelect = useCallback((date: Dayjs) => {
    setSelectedDate(date);
  }, []);

  return {
    selectedDate,
    setSelectedDate,
    diaryData,
    currentYM,
    stats,
    setDiaryData,
    getDateData,
    addTodo,
    toggleTodo,
    deleteTodo,
    updateNote,
    handleMonthChange,
    handleDateSelect,
  };
};
