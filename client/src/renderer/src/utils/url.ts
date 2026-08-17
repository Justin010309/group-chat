const URL_RE = /https?:\/\/[^\s<>"']+/g

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE)
  if (!matches) return []
  return [...new Set(matches.map((m) => m.replace(/[.,;:!?]+$/, '')))]
}
