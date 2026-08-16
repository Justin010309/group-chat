import 'dotenv/config'
import { createApp } from './app'
import { logger } from './utils/logger'

const port = Number(process.env.PORT || 3001)
createApp().listen(port, () => logger.info(`[group-chat] server listening on ${port}`))
