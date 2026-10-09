// The usage bar on top, the folded-room strip and the "more rooms" note.
import type { Worker } from '../types'
import type { Limit } from './status'
import { statusOf } from './status'
import { LIMIT_LABEL, barColor, clip, esc, resetAt } from './util'
import { DEFS, FONT } from './kit'

export const hudSvg = (W: number, limits: Limit[]) => {
  const H = 60
  let out = `<rect width="${W}" height="${H}" fill="#10131d" stroke="#2a3350" stroke-width="2"/>`
  let x = 16
  // Always keep the bar populated: plan limits can be empty (API key, or before the first reply).
  if (!limits.length) out += `<text x="16" y="40" font-size="12" fill="#8f9bb5" font-family="${FONT}">額度資訊暫無(尚無 rate limit 資料)</text>`
  for (const l of limits) {
    const p = Math.max(0, Math.min(100, l.percentUsed))
    out += `<text x="${x}" y="22" font-size="12" fill="#cbd5e1" font-family="${FONT}">${esc(LIMIT_LABEL[l.kind] ?? l.kind)}</text>` +
      `<text x="${x + 150}" y="22" font-size="12" font-weight="700" text-anchor="end" fill="${barColor(p)}" font-family="${FONT}">${p}%</text>` +
      `<rect x="${x}" y="28" width="150" height="8" fill="#232b40"/><rect x="${x}" y="28" width="${(150 * p) / 100}" height="8" fill="${barColor(p)}"/><rect x="${x}" y="28" width="150" height="8" fill="url(#seg)"/>` +
      `<text x="${x}" y="52" font-size="11" fill="#8f9bb5" font-family="${FONT}">${esc(resetAt(l.resetsAt).replace(' ・', '') || ' ')}</text>`
    x += 174
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${DEFS}${out}</svg>`
}

// A quiet room folded into one strip: name, head count, one status dot per worker.
export const roomStripSvg = (ws: Worker[], W: number, note = '') => {
  const H = 34
  const dots = ws
    .slice(0, 24)
    .map((w, i) => `<rect x="${W - 14 - (i + 1) * 12}" y="12" width="8" height="8" fill="${statusOf(w.status).color}"/>`)
    .join('')
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">` +
    `<rect width="${W}" height="${H}" fill="#141a2b"/><rect width="6" height="${H}" fill="#64748b"/><rect y="${H - 2}" width="${W}" height="2" fill="#2a3350"/>` +
    `<text x="18" y="22" font-size="13" font-weight="700" fill="#94a3b8" font-family="${FONT}">▸ ${esc(clip(ws[0].project, 24))}</text>` +
    `<text x="${W - 14 - Math.min(ws.length, 24) * 12 - 8}" y="21" font-size="11" text-anchor="end" fill="#64748b" font-family="${FONT}">${ws.length} 人${esc(note)}</text>` +
    dots +
    `</svg>`
  return { source, W, H }
}

export const moreRoomsSvg = (n: number, W: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="26" viewBox="0 0 ${W} 26" shape-rendering="crispEdges">` +
  `<text x="18" y="18" font-size="12" fill="#64748b" font-family="${FONT}">… 還有 ${n} 間辦公室未顯示</text></svg>`
