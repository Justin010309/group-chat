import type { NextFunction, Request, Response } from 'express'
import { fail } from '../utils/response'
import { logger } from '../utils/logger'

export function notFound(_req: Request, res: Response): void {
  fail(res, 404, 'NOT_FOUND', 'resource not found')
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  logger.error(err)
  fail(res, 500, 'INTERNAL_ERROR', 'internal server error')
}
