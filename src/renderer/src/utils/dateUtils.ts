export const formatTime = (timeStemp: string | Date | number): string => {
  if (typeof timeStemp === "string") timeStemp = Number(timeStemp);
  const date = new Date(timeStemp);
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

export const formatDate = (timeStemp: string | Date | number): string => {
  if (typeof timeStemp === "string") timeStemp = Number(timeStemp);
  const date = new Date(timeStemp);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
};

export const formatRelativeTime = (timeStemp: string | Date | number): string => {
  if (typeof timeStemp === "string") timeStemp = Number(timeStemp);
  const date = new Date(timeStemp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return `${diffDays}天前`;
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
};

export const formatDateByTimestamp = (timestamp: number | string): string => {
  const date = new Date(+timestamp);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}-${month < 10 ? "0" + month : month}-${day < 10 ? "0" + day : day}`;
};

export const getCurrentTime = (): string => {
  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();
  return `${year}-${month < 10 ? "0" + month : month}-${day < 10 ? "0" + day : day}-${hour < 10 ? "0" + hour : hour}-${minute < 10 ? "0" + minute : minute}-${second < 10 ? "0" + second : second}`;
};
