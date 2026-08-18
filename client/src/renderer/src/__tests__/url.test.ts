import { describe, it, expect } from 'vitest'
import { buildInviteLink, extractUrls, parseJoinInput } from '../utils/url'

describe('extractUrls', () => {
  it('提取纯链接', () => {
    expect(extractUrls('看这个 https://example.com/a?b=1 文档')).toEqual([
      'https://example.com/a?b=1'
    ])
  })
  it('忽略非 http 协议', () => {
    expect(extractUrls('本地文件 file:///etc/passwd')).toEqual([])
  })
})

describe('join input parsing', () => {
  const uuid = '3f2f7c4a-9d1e-4f3b-8a5c-6b7d8e9f0a1b'

  it('buildInviteLink 生成深链', () => {
    expect(buildInviteLink(uuid)).toBe(`groupchat://join?roomId=${uuid}`)
  })

  it('parseJoinInput 识别裸 UUID', () => {
    expect(parseJoinInput(uuid)).toBe(uuid)
    expect(parseJoinInput(`  ${uuid.toUpperCase()}  `)).toBe(uuid)
  })

  it('parseJoinInput 识别深链与 web 链接', () => {
    expect(parseJoinInput(`groupchat://join?roomId=${uuid}`)).toBe(uuid)
    expect(parseJoinInput(`http://localhost:5173/#/join?roomId=${uuid}`)).toBe(uuid)
  })

  it('parseJoinInput 非法输入返回 null', () => {
    expect(parseJoinInput('not-a-room-id')).toBeNull()
    expect(parseJoinInput('')).toBeNull()
  })
})
