import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
  createRoom,
  createRoomRules,
  joinRoom,
  listMembers,
  listRooms,
  roomIdRules
} from '../controllers/room.controller'

export const roomsRouter = Router()
roomsRouter.use(requireAuth)

roomsRouter.get('/', listRooms)
roomsRouter.post('/', createRoomRules, createRoom)
roomsRouter.post('/:roomId/join', roomIdRules, joinRoom)
roomsRouter.get('/:roomId/members', roomIdRules, listMembers)
