import 'dotenv/config'
import http from 'http'
import { createApp } from './app'
import { initSocket } from './sockets'
import { logger } from './utils/logger'

const port = Number(process.env.PORT || 3001)
const server = http.createServer(createApp())
initSocket(server)
server.listen(port, () => logger.info(`[group-chat] server listening on ${port}`))
