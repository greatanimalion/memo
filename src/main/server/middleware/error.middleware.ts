import type { Request, Response, NextFunction } from 'express';
import { logger } from '@main/server/utils/logger';

export const errorMiddleware = (
  error: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error('Error:', error);
  const status = error.status || 500;
  const message = error.message || 'Internal Server Error';

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

export const loggerMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  logger.info(`API Request: ${req.method} ${req.originalUrl}`);
  next();
};
