import { body, param } from 'express-validator'
import type { Response } from 'express'
import { prisma } from '../utils/prisma'
import { roomRepo } from '../repositories/room.repo'
import { fail, ok } from '../utils/response'
import type { AuthedRequest } from '../middleware/auth'

export const markReadRules = [
  param('roomId').isUUID(),
  body('lastReadMessageId').isUUID()
]

export async function markRead(req: AuthedRequest, res: Response): Promise<void> {
  const roomId = req.params.roomId
  const uid = req.user!.uid
  if (!(await roomRepo.findMembership(roomId, uid))) {
    fail(res, 403, 'FORBIDDEN', 'not a member')
    return
  }
  const message = await prisma.message.findUnique({
    where: { id: req.body.lastReadMessageId }
  })
  if (!message || message.roomId !== roomId) {
    fail(res, 400, 'VALIDATION_ERROR', 'message not in room')
    return
  }
  await prisma.roomMember.update({
    where: { roomId_userId: { roomId, userId: uid } },
    data: { lastReadMessageId: message.id }
  })
  ok(res, { marked: true })
}
