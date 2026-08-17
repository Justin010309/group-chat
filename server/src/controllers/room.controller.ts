import { body, param, validationResult } from 'express-validator'
import type { Request, Response } from 'express'
import { roomService } from '../services/room.service'
import { fail, ok } from '../utils/response'
import type { AuthedRequest } from '../middleware/auth'

const validate = (req: Request, res: Response): boolean => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    fail(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg)
    return false
  }
  return true
}

export const createRoomRules = [body('name').trim().isLength({ min: 1, max: 64 })]
export const roomIdRules = [param('roomId').isUUID()]

export async function listRooms(req: AuthedRequest, res: Response): Promise<void> {
  ok(res, await roomService.listForUser(req.user!.uid))
}

export async function createRoom(req: AuthedRequest, res: Response): Promise<void> {
  if (!validate(req, res)) return
  const room = await roomService.create(req.user!.uid, req.body.name)
  res.status(201)
  ok(res, room)
}

export async function joinRoom(req: AuthedRequest, res: Response): Promise<void> {
  if (!validate(req, res)) return
  try {
    ok(res, await roomService.join(req.user!.uid, req.params.roomId))
  } catch (e) {
    if ((e as Error & { code?: string }).code === 'ALREADY_MEMBER') {
      fail(res, 409, 'ALREADY_MEMBER', 'already a member')
      return
    }
    throw e
  }
}

export async function listMembers(req: AuthedRequest, res: Response): Promise<void> {
  const roomId = req.params.roomId
  if (!(await roomService.isMember(roomId, req.user!.uid))) {
    fail(res, 403, 'FORBIDDEN', 'not a member')
    return
  }
  ok(res, await roomService.members(roomId))
}
