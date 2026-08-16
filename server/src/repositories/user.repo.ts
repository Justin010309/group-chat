import { prisma } from '../utils/prisma'

export const userRepo = {
  findByUsername(username: string) {
    return prisma.user.findUnique({ where: { username } })
  },
  findById(id: string) {
    return prisma.user.findUnique({ where: { id } })
  },
  create(data: { username: string; passwordHash: string; nickname: string }) {
    return prisma.user.create({ data })
  },
}
