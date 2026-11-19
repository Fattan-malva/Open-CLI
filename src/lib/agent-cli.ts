export function getAgentInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  const initials = parts.map((part) => part[0]?.toUpperCase() ?? '').join('')
  return initials || 'AI'
}

export function normalizeAgentSvg(input: string) {
  const value = input.trim().replace(/^\uFEFF/, '')
  if (!value) return null

  const svgStart = value.search(/<svg[\s>]/i)
  const svgMarkup = svgStart >= 0 ? value.slice(svgStart) : value

  if (/^<svg[\s>]/i.test(svgMarkup)) {
    const cleaned = svgMarkup
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
      .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
      .replace(/javascript:/gi, '')

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleaned)}`
  }

  if (/^https?:\/\//i.test(value) || /^data:image\/svg\+xml/i.test(value)) {
    return value
  }

  return null
}
