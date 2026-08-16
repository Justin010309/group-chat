import 'dotenv/config'
import { execSync } from 'child_process'

export default function globalSetup(): void {
  const url = process.env.TEST_DATABASE_URL
  if (!url) {
    throw new Error('TEST_DATABASE_URL 未配置，请检查 server/.env')
  }
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  })
}
