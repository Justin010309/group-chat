import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
  createRoom,
  createRoomRules,
  invite,
  inviteRules,
  joinRoom,
  listMembers,
  listRooms,
  roomIdRules
} from '../controllers/room.controller'
import { markRead, markReadRules } from '../controllers/read.controller'

export const roomsRouter = Router()
roomsRouter.use(requireAuth)

roomsRouter.get('/', listRooms)
roomsRouter.post('/', createRoomRules, createRoom)
roomsRouter.post('/:roomId/join', roomIdRules, joinRoom)
roomsRouter.post('/:roomId/invite', inviteRules, invite)
roomsRouter.get('/:roomId/members', roomIdRules, listMembers)
roomsRouter.post('/:roomId/read', markReadRules, markRead)
