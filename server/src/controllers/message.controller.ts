import { query } from 'express-validator'
import type { Request, Response } from 'express'
import { messageService } from '../services/message.service'
import { roomService } from '../services/room.service'
import { fail, ok } from '../utils/response'
import type { AuthedRequest } from '../middleware/auth'

export const historyRules = [
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('cursor').optional().isISO8601()
]

export async function history(req: AuthedRequest, res: Response): Promise<void> {
  const roomId = req.params.roomId
  if (!(await roomService.isMember(roomId, req.user!.uid))) {
    fail(res, 403, 'FORBIDDEN', 'not a member')
    return
  }
  const limit = Number(req.query.limit ?? 20)
  const cursor = (req.query.cursor as string | undefined) ?? null
  ok(res, await messageService.history(roomId, cursor, limit))
}
