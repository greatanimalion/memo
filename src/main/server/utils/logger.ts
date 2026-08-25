export const logger = {
  info: (...args: any[]): void => {
    console.log(`[INFO] ${new Date().toISOString()}`, ...args);
  },
  error: (...args: any[]): void => {
    console.error(`[ERROR] ${new Date().toISOString()}`, ...args);
  },
  warn: (...args: any[]): void => {
    console.warn(`[WARN] ${new Date().toISOString()}`, ...args);
  },
  debug: (...args: any[]): void => {
    if (process.env.NODE_ENV === "development") {
      console.debug(`[DEBUG] ${new Date().toISOString()}`, ...args);
    }
  },
};
