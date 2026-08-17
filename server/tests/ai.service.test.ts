import { describe, it, expect, vi, afterEach } from 'vitest'
import { streamAiReply } from '../src/services/ai.service'

function sseChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)))
      controller.close()
    }
  })
}

describe('streamAiReply', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('解析 SSE delta 并拼接完整回复', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: sseChunks([
        'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
        'data: [DONE]\n\n'
      ])
    })
    vi.stubGlobal('fetch', fetchMock)

    const deltas: string[] = []
    const full = await streamAiReply(
      {
        baseUrl: 'https://api.test/v1',
        apiKey: 'sk-test',
        model: 'test-model',
        messages: [{ role: 'user', content: 'hi' }]
      },
      (t) => deltas.push(t)
    )
    expect(full).toBe('你好')
    expect(deltas).toEqual(['你', '好'])
  })
})
