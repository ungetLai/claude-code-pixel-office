// The hover card shown beside a desk.
import type { Worker } from '../types'
import { SHORT, statusOf } from './status'
import { barColor, clip, esc, fmtDur, fmtK, hash, hhmm, wrap } from './util'
import { CW, FONT, SESS } from './kit'

export const cardSvg = (w: Worker, now: number) => {
  const st = statusOf(w.status)
  const out: string[] = []
  const T = (x: number, y: number, s: string, fill: string, extra = '') =>
    out.push(`<text x="${x}" y="${y}" fill="${fill}" font-family="${FONT}" ${extra}>${esc(s)}</text>`)
  T(14, 28, clip(w.name, 20), '#f1f5f9', 'font-size="14" font-weight="700"')
  out.push(`<rect x="${CW - 86}" y="12" width="72" height="22" fill="${st.color}"/>`)
  T(CW - 50, 28, SHORT[w.status] ?? w.status, '#0b0f1a', 'font-size="12" font-weight="700" text-anchor="middle"')
  out.push(`<rect x="14" y="40" width="${CW - 28}" height="1" fill="#2a3350"/>`)
  let y = 60
  const kv = (k: string, v: string, color = '#e2e8f0') => {
    T(14, y, k, '#9aa5bd', 'font-size="12"')
    T(70, y, v, color, 'font-size="12"')
    y += 19
  }
  kv('類型', clip(w.type, 23))
  const task = wrap(w.description || '-', 23, 2)
  task.forEach((l, k) => {
    if (k === 0) kv('任務', l)
    else kv('', l)
  })
  kv('最近工具', clip(w.lastTool ?? '-', 23))
  kv('持續', `${fmtDur(now - w.since)} · ${hhmm(w.since)}`, st.color)
  out.push(`<rect x="14" y="${y - 10}" width="9" height="9" fill="${SESS[hash(w.session) % SESS.length]}"/>`)
  T(70, y, `#${w.session.slice(0, 4)}`, '#9aa5bd', 'font-size="12"')
  T(14, y, 'Session', '#9aa5bd', 'font-size="12"')
  y += 19
  if (w.usage && w.status !== 'offline') {
    y += 2
    out.push(`<rect x="14" y="${y - 10}" width="${CW - 28}" height="1" fill="#2a3350"/>`)
    y += 10
    T(14, y, 'SESSION 用量', '#9aa5bd', 'font-size="11" letter-spacing="1"')
    y += 14
    const bar = (label: string, right: string, pct: number) => {
      const p = Math.max(0, Math.min(100, pct))
      T(14, y, label, '#cbd5e1', 'font-size="12"')
      T(CW - 14, y, right, barColor(p), 'font-size="12" text-anchor="end"')
      out.push(`<rect x="14" y="${y + 6}" width="${CW - 28}" height="8" fill="#232b40"/>`)
      out.push(`<rect x="14" y="${y + 6}" width="${((CW - 28) * p) / 100}" height="8" fill="${barColor(p)}"/>`)
      out.push(`<rect x="14" y="${y + 6}" width="${CW - 28}" height="8" fill="url(#seg)"/>`)
      y += 32
    }
    const u = w.usage
    if (u.ctxPercent !== undefined) bar('Context', `${u.ctxPercent}%  ${fmtK(u.ctxTokens)}/${fmtK(u.ctxWindow)}`, u.ctxPercent)
  }
  return { h: y + 8, body: out.join('') }
}
