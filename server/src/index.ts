import 'dotenv/config'
import express from 'express'

const app = express()
app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } })
})

const port = Number(process.env.PORT || 3001)
app.listen(port, () => console.log(`[group-chat] server listening on ${port}`))
