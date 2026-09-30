import { create } from "zustand";
import { getUsage, saveUsage, UsageStat } from "@renderer/services/usage";

const pad = (n: number) => String(n).padStart(2, "0");

/** 本地日期作为“天”的主键：YYYY-MM-DD */
export const dayKey = (d: Date = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const storageKey = (date: string) => `usage:${date}`;

interface DayCounter {
  typingMs: number;
  activeMs: number;
}

function readLocal(date: string): DayCounter | null {
  try {
    const raw = localStorage.getItem(storageKey(date));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      typingMs: Number(parsed.typingMs) || 0,
      activeMs: Number(parsed.activeMs) || 0,
    };
  } catch {
    return null;
  }
}

function writeLocal(date: string, counter: DayCounter) {
  try {
    localStorage.setItem(storageKey(date), JSON.stringify(counter));
  } catch {
    /* 忽略隐私模式等写入失败 */
  }
}

const initialDate = dayKey();
const initialCounter: DayCounter =
  readLocal(initialDate) ?? { typingMs: 0, activeMs: 0 };

interface UsageState {
  /** 当前累计所属的日期（跨天时会切换） */
  today: string;
  typingMs: number;
  activeMs: number;
  /** 服务端返回的每日统计 */
  history: UsageStat[];
  /** 统计图表展示的天数范围 */
  rangeDays: number;
  /** 重新拉取指定范围（默认沿用当前范围） */
  refresh: (days?: number) => Promise<void>;
  /** 切换统计范围 */
  setRange: (days: number) => void;
}

export const useUsageStore = create<UsageState>((set, get) => ({
  today: initialDate,
  typingMs: initialCounter.typingMs,
  activeMs: initialCounter.activeMs,
  history: [],
  rangeDays: 7,
  refresh: async (days) => {
    const range = days ?? get().rangeDays;
    const rows = await getUsage(range);
    set({ history: rows, rangeDays: range });
  },
  setRange: (days) => {
    if (days === get().rangeDays) return;
    set({ rangeDays: days });
    void get().refresh(days);
  },
}));

const IDLE_MS = 2000;
const FLUSH_INTERVAL = 30_000;

let typingUntil = 0;
let lastFlushAt = 0;
let started = false;

/** 有打字动作时调用；2 秒无动作自动结束（空闲窗口由这里统一维护） */
export function markTyping() {
  typingUntil = Date.now() + IDLE_MS;
}

/** 窗口聚焦且页面可见才算“软件使用中” */
function isAppActive() {
  return document.visibilityState === "visible" && document.hasFocus();
}

async function flush() {
  const { today, typingMs, activeMs } = useUsageStore.getState();
  if (!today) return;
  lastFlushAt = Date.now();
  await saveUsage({ date: today, typingMs, activeMs });
}

function tick() {
  const now = Date.now();
  const date = dayKey();
  const state = useUsageStore.getState();

  // 跨天：先把旧的一天上报，再切到新的一天
  if (date !== state.today) {
    void flush();
    const counter = readLocal(date) ?? { typingMs: 0, activeMs: 0 };
    useUsageStore.setState({ today: date, ...counter });
    lastFlushAt = now;
  }

  const current = useUsageStore.getState();
  const active = isAppActive();
  const typing = now < typingUntil;
  if (!active && !typing) return;

  const counter: DayCounter = {
    typingMs: current.typingMs + (typing ? 1000 : 0),
    activeMs: current.activeMs + (active ? 1000 : 0),
  };
  useUsageStore.setState(counter);
  writeLocal(current.today, counter);

  if (now - lastFlushAt >= FLUSH_INTERVAL) void flush();
}

/** 启动统计（幂等），应在 App 挂载时调用一次 */
export function startUsageTracker() {
  if (started) return;
  started = true;

  // 服务端可能有本地缺失的今日数据（如清过 localStorage），取较大值补齐
  void getUsage(1).then((rows) => {
    const remote = rows.find(
      (row) => row.date === useUsageStore.getState().today,
    );
    if (!remote) return;
    const { today, typingMs, activeMs } = useUsageStore.getState();
    const counter = {
      typingMs: Math.max(typingMs, remote.typingMs),
      activeMs: Math.max(activeMs, remote.activeMs),
    };
    useUsageStore.setState(counter);
    writeLocal(today, counter);
  });
  void useUsageStore.getState().refresh();

  window.setInterval(tick, 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush();
  });
  window.addEventListener("pagehide", () => void flush());
  window.addEventListener("beforeunload", () => void flush());
}
