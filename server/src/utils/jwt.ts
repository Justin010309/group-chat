import jwt from 'jsonwebtoken'
import { env } from '../config/env'

export interface TokenPayload {
  uid: string
}

export function signToken(uid: string): string {
  return jwt.sign({ uid }, env.jwtSecret, { expiresIn: '7d' })
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.jwtSecret) as TokenPayload
}
