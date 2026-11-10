import api from ".";

export interface UsageStat {
  date: string;
  typingMs: number;
  activeMs: number;
  updatedAt?: number;
}

// getUsage 拉取最近 days 天的每日统计（含今日）
export async function getUsage(days = 7): Promise<UsageStat[]> {
  try {
    const res = await api.get("/api/usage", { params: { days } });
    return res.data.data || [];
  } catch (error) {
    console.log(error);
    return [];
  }
}

// saveUsage 上报某一天的绝对累计值（幂等）
export async function saveUsage(
  row: Pick<UsageStat, "date" | "typingMs" | "activeMs">,
): Promise<boolean> {
  try {
    await api.post("/api/usage/upsert", row);
    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
}
