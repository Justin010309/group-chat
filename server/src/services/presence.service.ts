export const presenceService = {
  socketsByUser: new Map<string, Set<string>>(),

  online(uid: string, socketId: string): void {
    const set = this.socketsByUser.get(uid) ?? new Set<string>()
    set.add(socketId)
    this.socketsByUser.set(uid, set)
  },

  offline(uid: string, socketId: string): void {
    const set = this.socketsByUser.get(uid)
    if (!set) return
    set.delete(socketId)
    if (set.size === 0) this.socketsByUser.delete(uid)
  },

  isOnline(uid: string): boolean {
    return (this.socketsByUser.get(uid)?.size ?? 0) > 0
  },
}
