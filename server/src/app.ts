import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { errorHandler, notFound } from './middleware/error'
import { ok } from './utils/response'
import { authRouter } from './routes/auth'
import { roomsRouter } from './routes/rooms'
import { messagesRouter } from './routes/messages'

export function createApp(): express.Express {
  const app = express()
  app.use(helmet())
  app.use(cors())
  app.use(express.json())
  app.get('/health', (_req, res) => ok(res, { status: 'ok' }))
  app.use('/api/v1/auth', authRouter)
  app.use('/api/v1/rooms', roomsRouter)
  app.use('/api/v1', messagesRouter)
  app.use(notFound)
  app.use(errorHandler)
  return app
}
