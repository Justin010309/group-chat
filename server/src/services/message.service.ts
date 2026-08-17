import { messageRepo } from '../repositories/message.repo'
import { prisma } from '../utils/prisma'

export interface MessageView {
  id: string
  roomId: string
  senderId: string
  senderNickname: string
  type: string
  content: string
  createdAt: string
  clientMsgId?: string | null
}

function toView(msg: {
  id: string
  roomId: string
  senderId: string
  sender: { nickname: string }
  type: string
  content: string
  createdAt: Date
  clientMsgId: string | null
}): MessageView {
  return {
    id: msg.id,
    roomId: msg.roomId,
    senderId: msg.senderId,
    senderNickname: msg.sender.nickname,
    type: msg.type,
    content: msg.content,
    createdAt: msg.createdAt.toISOString(),
    clientMsgId: msg.clientMsgId
  }
}

export const messageService = {
  async send(
    roomId: string,
    senderId: string,
    content: string,
    clientMsgId?: string,
    type = 'text'
  ): Promise<MessageView> {
    if (clientMsgId) {
      const dup = await messageRepo.findByClientId(senderId, clientMsgId)
      if (dup) {
        const full = await prisma.message.findUnique({
          where: { id: dup.id },
          include: { sender: { select: { nickname: true } } }
        })
        if (full) return toView(full)
      }
    }

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          roomId,
          senderId,
          type,
          content,
          clientMsgId: clientMsgId || null
        },
        include: { sender: { select: { nickname: true } } }
      })
      await tx.room.update({ where: { id: roomId }, data: { lastMessageAt: created.createdAt } })
      return created
    })
    return toView(message)
  },

  async history(
    roomId: string,
    cursor: string | null,
    limit: number
  ): Promise<{ messages: MessageView[]; nextCursor: string | null }> {
    const rows = await prisma.message.findMany({
      where: {
        roomId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {})
      },
      include: { sender: { select: { nickname: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit + 1
    })
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const messages = page.reverse().map(toView)
    const nextCursor = hasMore ? messages[0].createdAt : null
    return { messages, nextCursor }
  }
}
