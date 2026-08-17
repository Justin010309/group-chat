import { request } from './request'

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

export async function fetchHistoryApi(
  roomId: string,
  cursor?: string | null,
): Promise<{ messages: MessageView[]; nextCursor: string | null }> {
  const params = new URLSearchParams()
  if (cursor) params.set('cursor', cursor)
  const res = (await request.get(`/rooms/${roomId}/messages?${params.toString()}`)) as {
    success: true
    data: { messages: MessageView[]; nextCursor: string | null }
  }
  return res.data
}
