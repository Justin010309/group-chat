import { prisma } from '../utils/prisma'
import { roomRepo } from '../repositories/room.repo'
import { messageRepo } from '../repositories/message.repo'
import { userRepo } from '../repositories/user.repo'

export interface RoomView {
  id: string
  name: string
  ownerId: string
  lastMessageAt: string | null
  memberCount: number
  unread: number
}

async function lastReadAt(roomId: string, userId: string): Promise<Date | null> {
  const membership = await roomRepo.findMembership(roomId, userId)
  if (!membership?.lastReadMessageId) return null
  const read = await prisma.message.findUnique({
    where: { id: membership.lastReadMessageId }
  })
  return read?.createdAt ?? null
}

async function toRoomView(
  room: { id: string; name: string; ownerId: string; lastMessageAt: Date | null },
  lastReadAt: Date | null,
  memberCount: number,
  uid: string
): Promise<RoomView> {
  const unread = await messageRepo.countAfter(room.id, lastReadAt, uid)
  return {
    id: room.id,
    name: room.name,
    ownerId: room.ownerId,
    lastMessageAt: room.lastMessageAt?.toISOString() ?? null,
    memberCount,
    unread
  }
}

export const roomService = {
  async create(uid: string, name: string): Promise<RoomView> {
    const room = await roomRepo.create(uid, name)
    return toRoomView(room, null, 1, uid)
  },

  async listForUser(uid: string): Promise<RoomView[]> {
    const memberships = await prisma.roomMember.findMany({
      where: { userId: uid },
      orderBy: { joinedAt: 'desc' }
    })
    return Promise.all(
      memberships.map(async (m) => {
        const room = await roomRepo.findById(m.roomId)
        if (!room) return null
        const readAt = await lastReadAt(room.id, uid)
        const memberCount = (await roomRepo.members(room.id)).length
        return toRoomView(room, readAt, memberCount, uid)
      })
    ).then((rooms) => rooms.filter((r): r is RoomView => r !== null))
  },

  async join(uid: string, roomId: string): Promise<RoomView> {
    const room = await roomRepo.findById(roomId)
    if (!room) {
      const err = new Error('ROOM_NOT_FOUND') as Error & { code: string }
      err.code = 'ROOM_NOT_FOUND'
      throw err
    }
    if (await roomRepo.findMembership(roomId, uid)) {
      const err = new Error('ALREADY_MEMBER') as Error & { code: string }
      err.code = 'ALREADY_MEMBER'
      throw err
    }
    await roomRepo.addMember(roomId, uid)
    return toRoomView(room, null, (await roomRepo.members(roomId)).length, uid)
  },

  async invite(
    roomId: string,
    inviterUid: string,
    username: string
  ): Promise<{ room: RoomView; memberId: string }> {
    if (!(await roomRepo.findMembership(roomId, inviterUid))) {
      const err = new Error('FORBIDDEN') as Error & { code: string }
      err.code = 'FORBIDDEN'
      throw err
    }
    const target = await userRepo.findByUsername(username)
    if (!target) {
      const err = new Error('USER_NOT_FOUND') as Error & { code: string }
      err.code = 'USER_NOT_FOUND'
      throw err
    }
    if (await roomRepo.findMembership(roomId, target.id)) {
      const err = new Error('ALREADY_MEMBER') as Error & { code: string }
      err.code = 'ALREADY_MEMBER'
      throw err
    }
    await roomRepo.addMember(roomId, target.id)
    const room = await roomRepo.findById(roomId)
    if (!room) throw new Error('ROOM_NOT_FOUND')
    return {
      room: await toRoomView(room, null, (await roomRepo.members(roomId)).length, inviterUid),
      memberId: target.id
    }
  },

  async members(roomId: string) {
    const rows = await roomRepo.members(roomId)
    return rows.map((r) => ({
      id: r.user.id,
      nickname: r.user.nickname,
      username: r.user.username,
      avatarUrl: r.user.avatarUrl
    }))
  },

  async isMember(roomId: string, uid: string): Promise<boolean> {
    return (await roomRepo.findMembership(roomId, uid)) !== null
  }
}
