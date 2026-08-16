import type { Response } from 'express'

export function ok<T>(res: Response, data: T): void {
  res.json({ success: true, data })
}

export function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ success: false, error: { code, message } })
}
