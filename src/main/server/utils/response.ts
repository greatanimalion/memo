import type { Response } from "express";

export interface ApiResponse<T = any> {
  code: number;
  data?: T;
  message?: string;
  error?: string;
}

export const successResponse = <T>(
  res: Response,
  data: T,
  message: string = "success",
): void => {
  res.json({
    code: 200,
    data,
    message,
  });
};

export const createdResponse = <T>(
  res: Response,
  data: T,
  message: string = "created",
): void => {
  res.status(201).json({
    code: 201,
    data,
    message,
  });
};

export const errorResponse = (
  res: Response,
  status: number,
  message: string,
): void => {
  res.status(status).json({
    code: status,
    error: message,
  });
};

/**
 * 写入 Server-Sent Events 消息
 * @param res Express Response 对象
 * @param event 事件类型
 * @param data 事件数据
 */
export function sseWrite(res: Response, event: string, data: string): void {
  res.write(`event: ${event}\ndata: ${data}\n\n`);
  if (typeof (res as any).flush === "function") {
    (res as any).flush();
  }
}
