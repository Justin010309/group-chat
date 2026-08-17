import { request } from './request'

export interface RoomView {
  id: string
  name: string
  ownerId: string
  lastMessageAt: string | null
  memberCount: number
  unread: number
}

export const listRoomsApi = async (): Promise<RoomView[]> => {
  const res = (await request.get('/rooms')) as { success: true; data: RoomView[] }
  return res.data
}

export const createRoomApi = async (name: string): Promise<RoomView> => {
  const res = (await request.post('/rooms', { name })) as { success: true; data: RoomView }
  return res.data
}

export const markReadApi = async (roomId: string, lastReadMessageId: string): Promise<void> => {
  await request.post(`/rooms/${roomId}/read`, { lastReadMessageId })
}
