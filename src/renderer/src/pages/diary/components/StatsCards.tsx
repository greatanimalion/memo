import React from "react";

interface StatsCardsProps {
  stats: {
    todayTodos: number;
    totalTodos: number;
    completedTodos: number;
    daysWithTodos: number;
  };
}

const StatsCards: React.FC<StatsCardsProps> = ({ stats }) => {
  return (
    <div className="grid grid-cols-4 max-sm:grid-cols-2 gap-4">
      <div className="rounded-xl p-5 shadow-lg" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="text-sm mb-1" style={{ color: "var(--text-tertiary)" }}>当天待办</div>
        <div className="text-3xl font-bold text-blue-600">
          {stats.todayTodos}
        </div>
      </div>
      <div className="rounded-xl p-5 shadow-lg" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="text-sm mb-1" style={{ color: "var(--text-tertiary)" }}>当月总待办数</div>
        <div className="text-3xl font-bold text-purple-600">
          {stats.totalTodos}
        </div>
      </div>
      <div className="rounded-xl p-5 shadow-lg" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="text-sm mb-1" style={{ color: "var(--text-tertiary)" }}>已完成</div>
        <div className="text-3xl font-bold text-green-600">
          {stats.completedTodos}
        </div>
      </div>
      <div className="rounded-xl p-5 shadow-lg" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="text-sm mb-1" style={{ color: "var(--text-tertiary)" }}>当月记录天数</div>
        <div className="text-3xl font-bold text-orange-600">
          {stats.daysWithTodos}
        </div>
      </div>
    </div>
  );
};

export default StatsCards;