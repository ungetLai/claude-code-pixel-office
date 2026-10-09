// A project room: back wall, desks, plants and hover cards.
import type { Worker } from '../types'
import { statusOf } from './status'
import { clip, esc, hash } from './util'
import type { View } from './kit'
import { ART, ART_PAL, CW, DEFS, DH, DW, FONT, HEAD, PLANT, animOpacity, px } from './kit'
import { cardSvg } from './card'
import { deskSvg } from './desk'

// Back wall: windows follow the real time of day, a clock shows it, posters fill the gaps.
const WALL = 46
const wallSvg = (W: number, seed: number, now: number) => {
  const d = new Date(now)
  const hour = d.getHours()
  const y0 = HEAD
  let o = `<rect y="${y0}" width="${W}" height="${WALL}" fill="#1b2440"/>`
  for (let x = 24; x < W; x += 48) o += `<rect x="${x}" y="${y0}" width="1" height="${WALL}" fill="#222c4d"/>`
  o += `<rect y="${y0 + WALL - 6}" width="${W}" height="6" fill="#2d3858"/><rect y="${y0 + WALL - 6}" width="${W}" height="2" fill="#3b4872"/>`
  const kinds = ['win', 'poster', 'win', 'clock']
  let x = 20
  for (let i = 0; x + 52 <= W; i++) {
    const kind = kinds[(i + seed) % kinds.length]
    const y = y0 + 6
    if (kind === 'win') {
      const day = hour >= 7 && hour < 17
      const dusk = hour >= 17 && hour < 20
      o += `<rect x="${x - 3}" y="${y - 3}" width="54" height="34" fill="#3b4872"/>`
      if (day) {
        o += `<rect x="${x}" y="${y}" width="48" height="28" fill="#4aa3df"/><rect x="${x + 32}" y="${y + 4}" width="8" height="8" fill="#fde047"/>` +
          `<rect x="${x + 6}" y="${y + 14}" width="14" height="4" fill="#f1f5f9"/><rect x="${x + 10}" y="${y + 10}" width="8" height="4" fill="#f1f5f9"/>`
      } else if (dusk) {
        o += `<rect x="${x}" y="${y}" width="48" height="14" fill="#7c3a6b"/><rect x="${x}" y="${y + 14}" width="48" height="14" fill="#f08a4b"/><rect x="${x + 18}" y="${y + 18}" width="10" height="10" fill="#fde047"/>`
      } else {
        o += `<rect x="${x}" y="${y}" width="48" height="28" fill="#0b1230"/><rect x="${x + 32}" y="${y + 5}" width="8" height="8" fill="#e2e8f0"/><rect x="${x + 35}" y="${y + 5}" width="5" height="8" fill="#0b1230"/>` +
          [[6, 6], [18, 14], [24, 5], [10, 20], [42, 20]].map(([sx, sy], k) => `<rect x="${x + sx}" y="${y + sy}" width="2" height="2" fill="#e2e8f0">${animOpacity('1;.2;1', `${2 + k * 0.4}s`)}</rect>`).join('')
      }
      o += `<rect x="${x + 23}" y="${y}" width="2" height="28" fill="#3b4872"/><rect x="${x}" y="${y + 13}" width="48" height="2" fill="#3b4872"/>`
      x += 48 + 40
    } else if (kind === 'poster') {
      o += `<rect x="${x}" y="${y - 2}" width="30" height="34" fill="#10131d" stroke="#3b4872" stroke-width="2"/>` + px(ART[(i + seed) % ART.length], ART_PAL, x + 6, y + 8, 3)
      x += 30 + 40
    } else {
      const cx = x + 14
      const cy = y + 14
      const m = d.getMinutes()
      const ang = (a: number, r: number) => `x2="${cx + Math.sin(a) * r}" y2="${cy - Math.cos(a) * r}"`
      o += `<rect x="${x}" y="${y}" width="28" height="28" fill="#3b4872"/><rect x="${x + 2}" y="${y + 2}" width="24" height="24" fill="#e2e8f0"/>` +
        `<line x1="${cx}" y1="${cy}" ${ang(((hour % 12) + m / 60) * Math.PI / 6, 6)} stroke="#1b2440" stroke-width="2"/>` +
        `<line x1="${cx}" y1="${cy}" ${ang(m * Math.PI / 30, 9)} stroke="#ef4444" stroke-width="2"/>`
      x += 28 + 40
    }
  }
  return o
}

export const roomSvg = (ws: Worker[], maxCols: number, v: View) => {
  const cols = Math.max(1, Math.min(ws.length, maxCols))
  const rows = Math.ceil(ws.length / cols)
  const W = Math.max(cols * DW + 16, CW + DW + 16)
  const TOP = HEAD + WALL
  const cards = ws.map(w => cardSvg(w, v.now))
  const H = Math.max(TOP + rows * DH + 8, HEAD + Math.max(...cards.map(c => c.h)) + 8)
  const pos = ws.map((_, i) => ({ x: 8 + (i % cols) * DW, y: TOP + Math.floor(i / cols) * DH }))
  const css =
    `.card{display:none;pointer-events:none}.hl{opacity:0;transition:opacity .15s}.desk:hover .hl{opacity:1}` +
    `.p{transition:transform .15s ease-out}.desk:hover .p{transform:translateY(-4px)}@keyframes fi{from{opacity:0}to{opacity:1}}` +
    ws.map((_, i) => `#d${i}:hover~#c${i}{display:block;animation:fi .18s}`).join('')
  const cardLayer = ws
    .map((w, i) => {
      const st = statusOf(w.status)
      let x = pos[i].x + DW - 8
      if (x + CW > W - 4) x = Math.max(4, pos[i].x - CW + 8) // flip left, but never past the room's left edge
      const y = Math.max(HEAD + 4, Math.min(pos[i].y + 8, H - cards[i].h - 4))
      return (
        `<g id="c${i}" class="card" transform="translate(${x} ${y})">` +
        `<rect x="5" y="5" width="${CW}" height="${cards[i].h}" fill="#000" fill-opacity=".5"/>` +
        `<rect width="${CW}" height="${cards[i].h}" fill="#10131d" stroke="${st.color}" stroke-width="2"/>` +
        `<rect x="2" y="2" width="${CW - 4}" height="3" fill="${st.color}" fill-opacity=".5"/>` +
        cards[i].body + `</g>`
      )
    })
    .join('')
  // Plants fill empty seats and any spare floor to the right of the desks.
  let plants = ''
  const plant = (x: number, y: number) => `<ellipse cx="${x + 18}" cy="${y + 32}" rx="16" ry="3" fill="#000" fill-opacity=".25"/>` + px(PLANT, { g: '#22c55e', p: '#b45309' }, x, y, 4)
  for (let i = ws.length; i < rows * cols; i++) plants += plant(8 + (i % cols) * DW + DW / 2 - 18, TOP + Math.floor(i / cols) * DH + 90)
  if (W - (cols * DW + 8) >= 48) plants += plant(W - 48, TOP + (rows - 1) * DH + 90)
  const head =
    `<rect width="${W}" height="${HEAD}" fill="#1a2036"/><rect width="6" height="${HEAD}" fill="#fbbf24"/><rect y="${HEAD - 2}" width="${W}" height="2" fill="#2a3350"/>` +
    `<text x="18" y="22" font-size="14" font-weight="700" fill="#fbbf24" font-family="${FONT}">${esc(clip(ws[0].project, 30))}</text>` +
    `<text x="${W - 12}" y="21" font-size="11" text-anchor="end" fill="#8f9bb5" font-family="${FONT}">${esc(clip(ws[0].cwd.split('').reverse().join(''), 44).split('').reverse().join(''))}  ·  ${ws.length} 人</text>`
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">` +
    `<style>${css}</style>${DEFS}<rect width="${W}" height="${H}" fill="url(#floor)"/>${wallSvg(W, hash(ws[0].cwd), v.now)}${head}` +
    plants + ws.map((w, i) => deskSvg(w, i, pos[i].x, pos[i].y, v)).join('') + cardLayer + `</svg>`
  return { source, W, H }
}

export const MIN_ROOM_W = CW + DW + 16
