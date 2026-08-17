import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { history, historyRules } from '../controllers/message.controller'

export const messagesRouter = Router()
messagesRouter.use(requireAuth)
messagesRouter.get('/rooms/:roomId/messages', historyRules, history)
