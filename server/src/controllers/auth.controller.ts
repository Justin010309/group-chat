import { body, validationResult } from 'express-validator'
import type { Request, Response } from 'express'
import { authService } from '../services/auth.service'
import { fail, ok } from '../utils/response'

export const registerRules = [
  body('username').trim().isLength({ min: 3, max: 24 }),
  body('password').isLength({ min: 8, max: 72 }),
  body('nickname').trim().isLength({ min: 1, max: 32 }),
]

export const loginRules = [
  body('username').trim().notEmpty(),
  body('password').notEmpty(),
]

function validate(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    fail(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg)
    return false
  }
  return true
}

export async function register(req: Request, res: Response): Promise<void> {
  if (!validate(req, res)) return
  try {
    const result = await authService.register({
      username: req.body.username,
      password: req.body.password,
      nickname: req.body.nickname,
    })
    res.status(201)
    ok(res, result)
  } catch (e) {
    if ((e as Error & { code?: string }).code === 'USERNAME_TAKEN') {
      fail(res, 409, 'USERNAME_TAKEN', 'username already taken')
      return
    }
    throw e
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  if (!validate(req, res)) return
  try {
    const result = await authService.login({
      username: req.body.username,
      password: req.body.password,
    })
    ok(res, result)
  } catch (e) {
    if ((e as Error & { code?: string }).code === 'BAD_CREDENTIALS') {
      fail(res, 401, 'BAD_CREDENTIALS', 'username or password incorrect')
      return
    }
    throw e
  }
}
