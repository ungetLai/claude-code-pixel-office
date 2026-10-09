// Pure helpers: string clipping, colours, time formatting.

export const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Display width in monospace cells: CJK counts double.
export const cw = (c: string) => (c.charCodeAt(0) > 0x2e7f ? 2 : 1)

export const clip = (s: string, units: number) => {
  let n = 0
  let out = ''
  for (const c of s) {
    n += cw(c)
    if (n > units) return out.replace(/\s+$/, '') + '…'
    out += c
  }
  return out
}

export const wrap = (s: string, units: number, maxLines: number) => {
  const lines: string[] = []
  let cur = ''
  let n = 0
  for (const c of s.replace(/\s+/g, ' ')) {
    if (n + cw(c) > units) {
      lines.push(cur)
      cur = ''
      n = 0
      if (lines.length === maxLines) break
    }
    cur += c
    n += cw(c)
  }
  if (lines.length < maxLines && cur) lines.push(cur)
  if (lines.length === maxLines && s.length > lines.join('').length) lines[maxLines - 1] = clip(lines[maxLines - 1], units - 1).replace(/…$/, '') + '…'
  return lines.length ? lines : ['-']
}

export const shade = (hex: string, f: number) => {
  const n = parseInt(hex.slice(1), 16)
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)))
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => c(v).toString(16).padStart(2, '0')).join('')}`
}

export const hhmm = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const fmtK = (n?: number) => (n === undefined ? '-' : n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n))

export const fmtDur = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return s < 60 ? `${s} 秒` : m < 60 ? `${m} 分鐘` : `${Math.floor(m / 60)} 小時 ${m % 60} 分`
}

export const barColor = (pct: number) => (pct >= 90 ? '#f87171' : pct >= 70 ? '#facc15' : '#4ade80')

export const LIMIT_LABEL: Record<string, string> = { five_hour: '5h 額度', seven_day: '7d 額度', spend_limit: '花費上限' }

export const untilReset = (iso: string | undefined, now: number) => {
  if (!iso) return ''
  const m = Math.max(0, Math.round((Date.parse(iso) - now) / 60000))
  return m >= 60 ? `・${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}後重置` : `・${m}m後重置`
}

export const resetAt = (iso?: string) => (iso ? ` ・${hhmm(Date.parse(iso))} 重置` : '')
