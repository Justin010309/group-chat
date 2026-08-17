interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamAiInput {
  baseUrl: string
  apiKey: string
  model: string
  messages: AiMessage[]
}

export async function streamAiReply(
  input: StreamAiInput,
  onDelta: (text: string) => void
): Promise<string> {
  const res = await fetch(`${input.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.apiKey}`
    },
    body: JSON.stringify({ model: input.model, messages: input.messages, stream: true })
  })
  if (!res.ok || !res.body) throw new Error(`AI request failed: ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta.length > 0) {
          full += delta
          onDelta(delta)
        }
      } catch {
        // 跳过无法解析的行
      }
    }
  }
  return full
}
