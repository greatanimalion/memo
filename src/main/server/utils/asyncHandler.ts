import type { Request, Response, NextFunction } from 'express';

type AsyncMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => unknown | Promise<unknown>;

export const asyncHandler = (fn: AsyncMiddleware) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve()
      .then(() => fn(req, res, next))
      .catch(next);
  };
};
