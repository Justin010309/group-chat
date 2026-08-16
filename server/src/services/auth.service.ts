import bcrypt from 'bcryptjs'
import { userRepo } from '../repositories/user.repo'
import { signToken } from '../utils/jwt'

export interface SafeUser {
  id: string
  username: string
  nickname: string
}

function toSafeUser(user: { id: string; username: string; nickname: string }): SafeUser {
  return { id: user.id, username: user.username, nickname: user.nickname }
}

export const authService = {
  async register(input: { username: string; password: string; nickname: string }) {
    const existing = await userRepo.findByUsername(input.username)
    if (existing) {
      const err = new Error('USERNAME_TAKEN') as Error & { code: string }
      err.code = 'USERNAME_TAKEN'
      throw err
    }
    const passwordHash = await bcrypt.hash(input.password, 10)
    const user = await userRepo.create({
      username: input.username,
      passwordHash,
      nickname: input.nickname,
    })
    return { user: toSafeUser(user), token: signToken(user.id) }
  },

  async login(input: { username: string; password: string }) {
    const user = await userRepo.findByUsername(input.username)
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      const err = new Error('BAD_CREDENTIALS') as Error & { code: string }
      err.code = 'BAD_CREDENTIALS'
      throw err
    }
    return { user: toSafeUser(user), token: signToken(user.id) }
  },
}
