import { Router } from 'express'
import { login, loginRules, register, registerRules } from '../controllers/auth.controller'

export const authRouter = Router()

authRouter.post('/register', registerRules, register)
authRouter.post('/login', loginRules, login)
