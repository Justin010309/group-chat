import { describe, it, expect } from 'vitest'
import { extractUrls } from '../utils/url'

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
