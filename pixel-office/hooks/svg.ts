// The office drawn as SVG: one image per project room, plus the usage bar.
import type { Worker } from '../types'
import { SHORT, statusOf } from './status'
import { LIMIT_LABEL, barColor, clip, cw, esc, fmtDur, fmtK, hash, hhmm, resetAt, shade, wrap } from './util'
import type { Limit } from './status'

// What a drawing needs to know about "now" and about who has just arrived.
export type View = { now: number; seenAt: Map<string, number> }

export const HAIR = ['#3b2a20', '#c9a227', '#222233', '#a83a2a', '#6b4a8a']
export const SKIN = ['#f2c9a0', '#e0ac7e', '#c68a5e', '#f7d9b8']
const FONT = "'Cascadia Mono','Consolas','Microsoft JhengHei','PingFang TC',monospace"
export const DW = 168 // desk cell
const DH = 182
const HEAD = 34 // room header
const CW = 256 // hover card width

// Paint a character grid as merged <rect> runs.
const px = (rows: string[], pal: Record<string, string | undefined>, x: number, y: number, u: number) => {
  let out = ''
  rows.forEach((row, r) => {
    let c = 0
    while (c < row.length) {
      const ch = row[c]
      let e = c
      while (e < row.length && row[e] === ch) e++
      const fill = pal[ch]
      if (fill) out += `<rect x="${x + c * u}" y="${y + r * u}" width="${(e - c) * u}" height="${u}" fill="${fill}"/>`
      c = e
    }
  })
  return out
}

const E = ''
const MID = ['..h' + 'ssssss' + 'h..', '..h' + 'skssks' + 'h..', '..h' + 'ssssss' + 'h..']
const HEADS = [
  ['...hhhhhh...', '..hhhhhhhh..', ...MID, '...ssssss...'], // short
  ['...hhhhhh...', '..hhhhhhhh..', ...MID, '..hhssssshh.'], // sideburns
  ['...hhhhhh...', '..hhhhhhhh..', '.hh' + 'ssssss' + 'hh.', '.hh' + 'skssks' + 'hh.', '.hh' + 'ssssss' + 'hh.', '.hh' + 'ssssss' + 'hh.'], // long
  ['..cccccccc..', '.cccccccccc.', ...MID, '...ssssss...'], // cap
  ['....hhhh....', '..hhhhhhhh..', ...MID, '...ssssss...'], // bun
]
const BODY = ['..bbbbbbbb..', '.dbbbbbbbbd.', '.ss.bbbb.ss.', '.dbbbbbbbbd.', '.dbbbbbbbbd.']
const BODY_LONG = ['.hhbbbbbbhh.', '.hdbbbbbbdh.', ...BODY.slice(2)]
const TIE = [E, E, E, E, E, E, '.....tt.....', '.....tt.....']
const BADGE = [E, E, E, E, E, E, E, '.......pp...']
const HEADSET = [E, '.e........e.', '.e........e.', '.e........e.']
const CHECK = ['......g.', '.....gg.', 'g...gg..', 'gg.gg...', '.ggg....', '..g.....']
const CROSS = ['x.....x', '.x...x.', '..x.x..', '...x...', '..x.x..', '.x...x.', 'x.....x']
const PLANT = ['..g...g..', '.ggg.ggg.', '..ggggg..', '.ggggggg.', '...ggg...', '..ppppp..', '..ppppp..', '...ppp...']
const ART = [
  ['.rr.rr', 'rrrrrr', 'rrrrrr', '.rrrr.', '..rr..'],
  ['..yy..', '..yy..', 'yyyyyy', '.yyyy.', '.yy.yy'],
  ['.wwww.', '.wwwwc', '.wwwwc', '..ww..', '.wwww.'],
]
const ART_PAL = { r: '#f472b6', y: '#fde047', w: '#e2e8f0', c: '#fb923c' }
const SESS = ['#f472b6', '#22d3ee', '#a3e635', '#fb923c', '#c084fc', '#2dd4bf']
const BADGES = ['#38bdf8', '#a78bfa', '#fb923c', '#f472b6', '#2dd4bf', '#fde047']
const CAPS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b']

const animOpacity = (values: string, dur: string, begin = '0s', calc = 'linear') =>
  `<animate attributeName="opacity" values="${values}" dur="${dur}" begin="${begin}" calcMode="${calc}" repeatCount="indefinite"/>`

const screenFor = (status: string) => {
  const sx = 104
  const sy = 54
  const frame = `<rect x="${sx - 4}" y="${sy - 4}" width="56" height="38" fill="#2b3347"/><rect x="${sx - 2}" y="${sy - 2}" width="52" height="34" fill="#0a0e18"/>`
  const stand = `<rect x="${sx + 18}" y="${sy + 34}" width="12" height="4" fill="#2b3347"/>`
  const bg = (c: string) => `<rect x="${sx}" y="${sy}" width="48" height="30" fill="${c}"/>`
  let inner = ''
  if (status === 'thinking') {
    inner = bg('#120d26')
    ;[0, 1, 2].forEach(i => {
      inner += `<rect x="${sx + 10 + i * 12}" y="${sy + 12}" width="6" height="6" fill="#a78bfa">${animOpacity('.2;1;.2', '1.2s', `${i * 0.3}s`)}</rect>`
    })
    inner += `<rect x="${sx + 5}" y="${sy + 4}" width="20" height="3" fill="#a78bfa" fill-opacity=".3"/><rect x="${sx + 5}" y="${sy + 23}" width="30" height="3" fill="#a78bfa" fill-opacity=".3"/>`
  } else if (status === 'running') {
    inner = bg('#07182a')
    const bars = [[10, '#38bdf8', '0s'], [22, '#7dd3fc', '.4s'], [16, '#34d399', '.8s'], [30, '#38bdf8', '1.2s'], [12, '#a78bfa', '.2s']] as const
    bars.forEach(([w, fill, begin], i) => {
      inner += `<rect x="${sx + 4}" y="${sy + 4 + i * 5}" width="${w}" height="3" fill="${fill}"><animate attributeName="width" values="${w};${w + 14};${Math.max(6, w - 4)};${w + 8};${w}" dur="2.4s" begin="${begin}" repeatCount="indefinite"/></rect>`
    })
    inner += `<rect x="${sx - 4}" y="${sy - 4}" width="56" height="38" fill="none" stroke="#38bdf8" stroke-width="2">${animOpacity('.15;.7;.15', '1.6s')}</rect>`
  } else if (status === 'completed') {
    inner = bg('#082616') + px(CHECK, { g: '#4ade80' }, sx + 8, sy + 3, 4)
  } else if (status === 'failed' || status === 'killed') {
    inner = bg('#2a0b0b') + `<g>${px(CROSS, { x: '#f87171' }, sx + 10, sy + 1, 4)}${animOpacity('1;.25;1', '1s', '0s', 'discrete')}</g>`
  } else if (status === 'offline') {
    inner = bg('#04060b') + `<rect x="${sx + 42}" y="${sy + 24}" width="3" height="3" fill="#475569"/>`
  } else {
    inner = bg('#0c1220')
    const c = status === 'idle' ? '#64748b' : '#facc15'
    inner += `<rect x="${sx + 5}" y="${sy + 5}" width="6" height="4" fill="${c}">${animOpacity('1;0', '1.1s', '0s', 'discrete')}</rect>`
    inner += `<rect x="${sx + 5}" y="${sy + 13}" width="24" height="3" fill="${c}" fill-opacity=".25"/><rect x="${sx + 5}" y="${sy + 19}" width="16" height="3" fill="${c}" fill-opacity=".25"/>`
  }
  return frame + inner + stand
}

const bubbleFor = (status: string) => {
  const box = (fill: string, x = 26, w = 34) =>
    `<rect x="${x}" y="8" width="${w}" height="24" fill="${fill}"/><rect x="${x + 2}" y="6" width="${w - 4}" height="2" fill="${fill}"/><rect x="${x + 2}" y="32" width="${w - 4}" height="2" fill="${fill}"/><rect x="${x + 8}" y="34" width="6" height="4" fill="${fill}"/>`
  if (status === 'offline') return ''
  if (status === 'running' || status === 'thinking')
    return box(status === 'thinking' ? '#ddd6fe' : '#e8eef9', 20, 52) + [0, 1, 2].map(i => `<rect x="${32 + i * 12}" y="17" width="6" height="6" fill="${status === 'thinking' ? '#6d28d9' : '#334155'}">${animOpacity('.2;1;.2', '1.2s', `${i * 0.25}s`)}</rect>`).join('')
  if (status === 'idle')
    return `<text x="62" y="30" font-size="13" font-weight="700" fill="#94a3b8" font-family="${FONT}">z<animate attributeName="y" values="30;12" dur="2.4s" repeatCount="indefinite"/>${animOpacity('0;1;0', '2.4s')}</text>` +
      `<text x="72" y="30" font-size="18" font-weight="700" fill="#94a3b8" font-family="${FONT}">Z<animate attributeName="y" values="30;10" dur="2.4s" begin="1.2s" repeatCount="indefinite"/>${animOpacity('0;1;0', '2.4s', '1.2s')}</text>`
  if (status === 'failed' || status === 'killed')
    return box('#ef4444') + `<text x="43" y="29" text-anchor="middle" font-size="18" font-weight="700" fill="#fff" font-family="${FONT}">!${animOpacity('1;.3;1', '1s', '0s', 'discrete')}</text>`
  if (status === 'completed') return box('#22c55e') + px(CHECK, { g: '#fff' }, 31, 14, 3)
  return box('#facc15') + `<text x="43" y="29" text-anchor="middle" font-size="18" font-weight="700" fill="#422006" font-family="${FONT}">?${animOpacity('1;.4;1', '1.6s')}</text>`
}

// One-shot confetti when a worker has just finished; slow smoke above the monitor while it is broken.
const sparkles = () =>
  [[18, 52, '#fde047'], [84, 36, '#4ade80'], [96, 60, '#7dd3fc'], [10, 78, '#f9a8d4'], [60, 28, '#fde047'], [100, 20, '#4ade80']]
    .map(([x, y, c], i) =>
      `<rect x="${x}" y="${y}" width="4" height="4" fill="${c}" opacity="0"><animate attributeName="opacity" values="0;1;1;0" dur="1.6s" begin="${i * 0.12}s"/><animate attributeName="y" values="${y};${Number(y) - 16}" dur="1.6s" begin="${i * 0.12}s"/></rect>`)
    .join('')
const smoke = () =>
  [0, 1, 2].map(i =>
    `<rect x="${124 + i * 8}" y="46" width="6" height="6" fill="#94a3b8" opacity="0"><animate attributeName="opacity" values="0;.55;0" dur="2.1s" begin="${i * 0.7}s" repeatCount="indefinite"/><animate attributeName="y" values="48;22" dur="2.1s" begin="${i * 0.7}s" repeatCount="indefinite"/></rect>`).join('')

const deskSvg = (w: Worker, i: number, dx: number, dy: number, v: View) => {
  const st = statusOf(w.status)
  const away = w.status === 'offline'
  const running = w.status === 'running'
  const n = hash(w.id)
  const pick = (k: number, m: number) => Math.floor(n / k) % m
  const fresh = v.now - (v.seenAt.get(w.id) ?? 0) < 3000
  const justChanged = v.now - w.since < 4000
  const pal = {
    h: HAIR[n % HAIR.length], s: SKIN[n % SKIN.length], k: '#1b1b1b', b: st.color, d: shade(st.color, 0.7),
    c: CAPS[pick(5, 4)], l: '#bae6fd', e: '#475569', t: '#fbbf24', p: BADGES[hash(w.type) % BADGES.length],
  }
  const style = pick(7, HEADS.length)
  const glasses = pick(11, 3) === 0
  const headset = pick(13, 4) === 0
  let head = HEADS[style]
  if (glasses) head = head.map((r, y) => (y === 3 ? [...r].map((c, x) => ([3, 5, 6, 8].includes(x) && c === 's' ? 'l' : c)).join('') : r))
  const body = style === 2 ? BODY_LONG : BODY
  let person = px([...head, ...body], pal, 22, 42, 6)
  person += w.type === 'main' ? px(TIE, pal, 22, 42, 6) : px(BADGE, pal, 22, 42, 6)
  if (headset) person += px(HEADSET, pal, 22, 42, 6)
  const blink = glasses ? '' :
    [46, 64].map(x => `<g opacity="0"><rect x="${x}" y="60" width="6" height="6" fill="${pal.s}"/><rect x="${x}" y="64" width="6" height="2" fill="#1b1b1b"/><animate attributeName="opacity" values="0;1;0" keyTimes="0;.95;.98" calcMode="discrete" dur="4.2s" begin="${n % 3}s" repeatCount="indefinite"/></g>`).join('')
  const bob = running ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -2" keyTimes="0;.5" calcMode="discrete" dur=".8s" repeatCount="indefinite"/>` : ''
  const sitting = away ? '' : `<g class="p"><g>${bob}${person}${blink}</g></g>`

  const chair = `<rect x="26" y="62" width="68" height="46" fill="#232b3f"/><rect x="26" y="62" width="68" height="4" fill="#33405c"/>`
  const lamp = `<ellipse cx="34" cy="94" rx="30" ry="10" fill="#fde68a" fill-opacity="${away ? 0 : 0.1}"/>` +
    `<rect x="10" y="86" width="12" height="4" fill="#475569"/><rect x="15" y="70" width="2" height="16" fill="#64748b"/><rect x="8" y="64" width="16" height="8" fill="${away ? '#475569' : '#fbbf24'}"/>`
  const mug = `<rect x="82" y="80" width="10" height="10" fill="#e2e8f0"/><rect x="92" y="83" width="3" height="4" fill="#e2e8f0"/><rect x="83" y="81" width="8" height="2" fill="#7c4a21"/>` +
    (w.status === 'idle' || w.status === 'waiting' || w.status === 'pending'
      ? `<rect x="85" y="70" width="2" height="6" fill="#cbd5e1">${animOpacity('0;.7;0', '2s')}<animate attributeName="y" values="76;64" dur="2s" repeatCount="indefinite"/></rect>`
      : '')
  const desk =
    `<rect x="8" y="90" width="152" height="14" fill="#b9824a"/><rect x="8" y="90" width="152" height="3" fill="#d49b5e"/>` +
    `<rect x="8" y="104" width="152" height="24" fill="#8b5a2b"/><rect x="8" y="104" width="152" height="3" fill="#6f4521"/>` +
    `<rect x="16" y="128" width="8" height="16" fill="#5a3a1c"/><rect x="144" y="128" width="8" height="16" fill="#5a3a1c"/>` +
    `<rect x="64" y="112" width="40" height="10" fill="#6f4521"/><rect x="66" y="114" width="36" height="6" fill="#7d4f26"/>`
  const keyboard = `<rect x="30" y="93" width="40" height="6" fill="#cbd5e1"/><rect x="30" y="97" width="40" height="2" fill="#94a3b8"/>` +
    (running ? [0, 1, 2, 3].map(k => `<rect x="${33 + k * 9}" y="94" width="4" height="2" fill="#38bdf8" opacity="0">${animOpacity('0;1;0', '.5s', `${k * 0.13}s`, 'discrete')}</rect>`).join('') : '')
  const hand = (x: number, begin: string) =>
    `<rect x="${x}" y="90" width="8" height="5" fill="${pal.s}">${running ? `<animate attributeName="y" values="90;87;90" dur=".5s" begin="${begin}" repeatCount="indefinite"/>` : ''}</rect>`
  const hands = away ? '' : hand(38, '0s') + hand(54, '.25s')

  const label = SHORT[w.status] ?? w.status
  const lw = [...label].reduce((a, c) => a + cw(c) * 6, 0)
  const sx0 = DW / 2 + 2 - (12 + lw) / 2
  const sess = SESS[hash(w.session) % SESS.length]
  const plate =
    `<rect x="12" y="148" width="144" height="32" fill="#10131d" stroke="${st.color}" stroke-width="1"/>` +
    `<rect x="12" y="148" width="5" height="32" fill="${sess}"/>` +
    `<text x="${DW / 2 + 2}" y="164" text-anchor="middle" font-size="13" font-weight="700" fill="${away ? '#94a3b8' : '#f1f5f9'}" font-family="${FONT}">${esc(clip(w.name, 16))}</text>` +
    `<rect x="${sx0}" y="169" width="6" height="6" fill="${st.color}">${running ? animOpacity('1;.3;1', '1s', '0s', 'discrete') : ''}</rect>` +
    `<text x="${sx0 + 12}" y="176" font-size="11" fill="${st.color}" font-family="${FONT}">${label}</text>`
  const fx = justChanged ? (w.status === 'completed' ? sparkles() : '') : ''
  const fadeIn = fresh ? `<animate attributeName="opacity" from="0" to="1" dur=".7s" fill="freeze"/>` : ''
  return (
    `<g id="d${i}" class="desk" transform="translate(${dx} ${dy})">` +
    `<rect class="hl" x="2" y="2" width="${DW - 4}" height="${DH - 4}" fill="${st.color}" fill-opacity=".07" stroke="${st.color}" stroke-width="2"/>` +
    `<g${away ? ' opacity=".5"' : ''}><g>${fadeIn}` +
    `<ellipse cx="84" cy="146" rx="70" ry="4" fill="#000" fill-opacity=".25"/>` +
    chair + sitting + screenFor(w.status) + desk + keyboard + lamp + mug + hands + bubbleFor(w.status) +
    (w.status === 'failed' || w.status === 'killed' ? smoke() : '') + fx + plate +
    (away ? `<rect x="8" y="60" width="152" height="86" fill="#05070d" fill-opacity=".3"/>` : '') +
    `</g></g>` +
    `<rect x="0" y="0" width="${DW}" height="${DH}" fill="#fff" fill-opacity="0"/></g>`
  )
}

const cardSvg = (w: Worker, now: number) => {
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

const DEFS =
  `<defs><pattern id="seg" width="6" height="8" patternUnits="userSpaceOnUse"><rect x="5" y="0" width="1" height="8" fill="#0b0f1a" fill-opacity=".55"/></pattern>` +
  `<pattern id="floor" width="48" height="48" patternUnits="userSpaceOnUse"><rect width="48" height="48" fill="#131929"/><rect width="24" height="24" fill="#161d30"/><rect x="24" y="24" width="24" height="24" fill="#161d30"/></pattern></defs>`

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

export const MIN_ROOM_W = CW + DW + 16

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
