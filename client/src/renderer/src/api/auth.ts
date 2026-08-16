import { request } from './request'

export interface SafeUser {
  id: string
  username: string
  nickname: string
}

export async function loginApi(input: { username: string; password: string }) {
  const res = (await request.post('/auth/login', input)) as {
    success: true
    data: { user: SafeUser; token: string }
  }
  return res.data
}
