import { prisma } from '../utils/prisma'

export const messageRepo = {
  create(input: {
    roomId: string
    senderId: string
    type: string
    content: string
    clientMsgId?: string
  }) {
    return prisma.message.create({ data: input })
  },
  findByClientId(senderId: string, clientMsgId: string) {
    return prisma.message.findUnique({
      where: { senderId_clientMsgId: { senderId, clientMsgId } }
    })
  },
  countAfter(roomId: string, after: Date | null) {
    return prisma.message.count({
      where: {
        roomId,
        ...(after ? { createdAt: { gt: after } } : {})
      }
    })
  }
}
