import type { NextFunction, Request, Response } from 'express'
import { verifyToken } from '../utils/jwt'
import { fail } from '../utils/response'

export interface AuthedRequest extends Request {
  user?: { uid: string }
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    fail(res, 401, 'UNAUTHORIZED', 'missing bearer token')
    return
  }
  try {
    req.user = { uid: verifyToken(header.slice(7)).uid }
    next()
  } catch {
    fail(res, 401, 'UNAUTHORIZED', 'invalid or expired token')
  }
}
