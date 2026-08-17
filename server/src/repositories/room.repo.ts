import { prisma } from '../utils/prisma'

export const roomRepo = {
  create(ownerId: string, name: string) {
    return prisma.$transaction(async (tx) => {
      const room = await tx.room.create({ data: { name, ownerId } })
      await tx.roomMember.create({ data: { roomId: room.id, userId: ownerId } })
      return room
    })
  },
  findById(id: string) {
    return prisma.room.findUnique({ where: { id } })
  },
  findMembership(roomId: string, userId: string) {
    return prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } }
    })
  },
  addMember(roomId: string, userId: string) {
    return prisma.roomMember.create({ data: { roomId, userId } })
  },
  members(roomId: string) {
    return prisma.roomMember.findMany({
      where: { roomId },
      include: {
        user: { select: { id: true, username: true, nickname: true, avatarUrl: true } }
      }
    })
  }
}
