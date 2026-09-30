import React, { useEffect } from "react";
import { ClockCircleOutlined, EditOutlined } from "@ant-design/icons";
import { Empty, Segmented } from "antd";
import { dayKey, useUsageStore } from "@renderer/store/useUsageStore";

interface DayUsage {
  date: string;
  typingMs: number;
  activeMs: number;
}

const RANGE_OPTIONS = [
  { label: "7天", value: 7 },
  { label: "30天", value: 30 },
];

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec <= 0) return "0分钟";
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
  if (minutes > 0) return `${minutes}分钟`;
  return `${seconds}秒`;
}

function shortLabel(date: string, rangeDays: number): string {
  const day = new Date(`${date}T00:00:00`);
  if (date === dayKey()) return "今天";
  if (rangeDays <= 7) {
    const week = ["日", "一", "二", "三", "四", "五", "六"][day.getDay()];
    return `周${week}`;
  }
  return `${day.getMonth() + 1}/${day.getDate()}`;
}

const UsageStats: React.FC = () => {
  const today = useUsageStore((s) => s.today);
  const typingMs = useUsageStore((s) => s.typingMs);
  const activeMs = useUsageStore((s) => s.activeMs);
  const history = useUsageStore((s) => s.history);
  const rangeDays = useUsageStore((s) => s.rangeDays);
  const refresh = useUsageStore((s) => s.refresh);
  const setRange = useUsageStore((s) => s.setRange);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const days: DayUsage[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    const row = history.find((item) => item.date === key);
    // 最后一天是今日：以本地实时累计为准（启动时已与服务端取较大值）
    days.push({
      date: key,
      typingMs:
        key === today ? Math.max(typingMs, row?.typingMs ?? 0) : row?.typingMs ?? 0,
      activeMs:
        key === today ? Math.max(activeMs, row?.activeMs ?? 0) : row?.activeMs ?? 0,
    });
  }

  const todayUsage = days[days.length - 1] ?? { typingMs: 0, activeMs: 0 };
  const rangeTyping = days.reduce((sum, day) => sum + day.typingMs, 0);
  const rangeActive = days.reduce((sum, day) => sum + day.activeMs, 0);
  const maxActive = Math.max(...days.map((day) => Math.max(day.activeMs, day.typingMs)), 1);
  // 30 天时每 5 天标注一次，避免文字重叠
  const labelStep = rangeDays > 10 ? 5 : 1;

  return (
    <div
      className="rounded-2xl p-6 shadow-lg"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <ClockCircleOutlined
            className="text-2xl"
            style={{ color: "var(--accent-color)" }}
          />
          <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            使用统计
          </h2>
        </div>
         <Segmented
          size="small"
          options={RANGE_OPTIONS}
          value={rangeDays}
          onChange={(value) => setRange(value as number)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div
          className="rounded-xl p-4 border"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            borderColor: "var(--border-color)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <EditOutlined style={{ color: "var(--accent-color)" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              今日码字时长
            </span>
          </div>
          <div
            className="text-2xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {formatDuration(todayUsage.typingMs)}
          </div>
        </div>
        <div
          className="rounded-xl p-4 border"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            borderColor: "var(--border-color)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <ClockCircleOutlined style={{ color: "var(--accent-color)" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              今日使用时长
            </span>
          </div>
          <div
            className="text-2xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {formatDuration(todayUsage.activeMs)}
          </div>
        </div>
        <div
          className="rounded-xl p-4 border"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            borderColor: "var(--border-color)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: "var(--accent-color)" }}
            />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              近 {rangeDays} 天累计
            </span>
          </div>
          <div
            className="text-2xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {formatDuration(rangeTyping)} / {formatDuration(rangeActive)}
          </div>
        </div>
      </div>

      <div
        className="flex items-center gap-4 mb-3 text-xs flex-wrap"
        style={{ color: "var(--text-tertiary)" }}
      >
        <span className="flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: "var(--accent-color)" }}
          />
          码字时长
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: "var(--text-tertiary)" }}
          />
          使用时长
        </span>
        <span className="ml-auto">累计码字 {formatDuration(rangeTyping)}</span>
       
      </div>

      {rangeTyping === 0 && rangeActive === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="还没有使用记录，去写点什么吧"
        />
      ) : (
        <div
          className={`flex items-end h-40 ${rangeDays > 10 ? "gap-1" : "gap-3"}`}
        >
          {days.map((day, index) => (
            <div
              key={day.date}
              className="flex-1 flex flex-col items-center gap-2 h-full justify-end min-w-0"
            >
              {/* 柱子区域固定占满剩余高度，标签行固定高度，避免有标签的列被压缩 */}
              <div className="w-full flex-1 min-h-0 flex items-end justify-center gap-0.5">
                <div
                  className="w-1/3 rounded-t transition-all duration-500"
                  style={{
                    height: `${Math.max((day.typingMs / maxActive) * 100, 2)}%`,
                    backgroundColor: "var(--accent-color)",
                  }}
                  title={`${day.date} 码字 ${formatDuration(day.typingMs)}`}
                />
                <div
                  className="w-1/3 rounded-t transition-all duration-500"
                  style={{
                    height: `${Math.max((day.activeMs / maxActive) * 100, 2)}%`,
                    backgroundColor: "var(--text-tertiary)",
                  }}
                  title={`${day.date} 使用 ${formatDuration(day.activeMs)}`}
                />
              </div>
              <div
                className="h-4 flex items-center justify-center text-[11px] leading-none whitespace-nowrap"
                style={{
                  color:
                    index === days.length - 1
                      ? "var(--accent-color)"
                      : "var(--text-tertiary)",
                }}
              >
                {index % labelStep === 0 || index === days.length - 1
                  ? shortLabel(day.date, rangeDays)
                  : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default UsageStats;
