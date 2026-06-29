import type { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

export const errorMiddleware = (
  error: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  logger.error("Error:", error);
  if (res.headersSent) return;
  const status = error.status || 500;
  const message =
    process.env.NODE_ENV === "development"
      ? error.message || "Internal Server Error"
      : "Internal Server Error";

  res.status(status).json({
    code: status,
    error: message,
  });
};

export const notFoundMiddleware = (req: Request, res: Response): void => {
  logger.warn(`404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    code: 404,
    error: `API endpoint not found: ${req.method} ${req.originalUrl}`,
  });
};

export const loggerMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  logger.info(`API Request: ${req.method} ${req.originalUrl}`);
  next();
};
