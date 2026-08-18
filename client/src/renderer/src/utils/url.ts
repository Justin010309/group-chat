const URL_RE = /https?:\/\/[^\s<>"']+/g
const ROOM_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INVITE_LINK_RE = /roomId=([0-9a-f-]{36})/i

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE)
  if (!matches) return []
  return [...new Set(matches.map((m) => m.replace(/[.,;:!?]+$/, '')))]
}

export function buildInviteLink(roomId: string): string {
  return `groupchat://join?roomId=${roomId}`
}

export function parseJoinInput(input: string): string | null {
  const trimmed = input.trim()
  if (ROOM_ID_RE.test(trimmed)) return trimmed.toLowerCase()
  const match = trimmed.match(INVITE_LINK_RE)
  if (match && ROOM_ID_RE.test(match[1])) return match[1].toLowerCase()
  return null
}
