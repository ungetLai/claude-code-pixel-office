import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Office, Usage, Worker } from '../types'

const PANE = 'pixel-office'
const MAIN = 'main'
const office = atom(
  { plugin: 'pixel-office', key: 'office' } as const,
  { workers: [], frame: 0, now: 0 } as Office,
)

// 12x8 pixel worker at a desk; two pixels per terminal row via half blocks.
const SPRITE = [
  '...hhhh.mmmm',
  '..hsssh.mggm',
  '..hsksh.mggm',
  '...sss..mmmm',
  '..bbbbb..mm.',
  '.bbbbbbb.mm.',
  'dddddddddddd',
  'dddddddddddd',
]
const HAIR = ['#3b2a20', '#c9a227', '#222233', '#a83a2a', '#6b4a8a']
const SKIN = ['#f2c9a0', '#e0ac7e', '#c68a5e', '#f7d9b8']
const STATUS: Record<string, { label: string; color: string }> = {
  running: { label: '工作中', color: '#4ade80' },
  pending: { label: '待命(排隊中)', color: '#facc15' },
  waiting: { label: '等待回應', color: '#facc15' },
  idle: { label: '閒置', color: '#94a3b8' },
  completed: { label: '已完成', color: '#60a5fa' },
  failed: { label: '失敗', color: '#f87171' },
  killed: { label: '已終止', color: '#f87171' },
  offline: { label: '已離開', color: '#64748b' },
}

// Stable seating: by session, main first, then id. Sorting by `since` made desks swap places on every status change.
const deskOrder = (a: Worker, b: Worker) =>
  a.session.localeCompare(b.session) || (a.type === 'main' ? -1 : 0) - (b.type === 'main' ? -1 : 0) || a.id.localeCompare(b.id)

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)

const pixel = (ch: string, w: Worker, frame: number): string | undefined => {
  const n = hash(w.id)
  const st = STATUS[w.status] ?? STATUS.idle
  switch (ch) {
    case 'h': return HAIR[n % HAIR.length]
    case 's': return SKIN[n % SKIN.length]
    case 'k': return '#1b1b1b'
    case 'b': return st.color
    case 'm': return '#3a3f4b'
    case 'g': return w.status === 'running' ? (frame % 2 ? '#7dd3fc' : '#38bdf8') : w.status === 'failed' ? '#ef4444' : '#1e293b'
    case 'd': return '#8b5a2b'
    default: return undefined
  }
}


// Everything below is per session; the shared folder joins sessions.
const SID = Math.random().toString(36).slice(2, 10)
const STALE_MS = 6000
let timer: { cancel: () => void } | undefined
let dir = ''
let project = ''
let cwd = ''
const main = { status: 'idle', since: 0, lastTool: undefined as string | undefined }
let lastSig = ''
let lastDetail = ''
let lastDraw = 0
const DETAIL_MS = 15000
let terminalSurface = false
const subTool = new Map<string, string>()
// Workers that just vanished stay as an empty, dimmed desk for a few seconds instead of popping out.
const GHOST_MS = 8000
const seenLive = new Map<string, Worker>()
const ghosts = new Map<string, { w: Worker; until: number }>()
const seenAt = new Map<string, number>()
let NOW = 0
const known = new Map<string, Worker>()

const fmtK = (n?: number) => (n === undefined ? '-' : n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n))
const LIMIT_LABEL: Record<string, string> = { five_hour: '5h 額度', seven_day: '7d 額度', spend_limit: '花費上限' }
const untilReset = (iso: string | undefined, now: number) => {
  if (!iso) return ''
  const m = Math.max(0, Math.round((Date.parse(iso) - now) / 60000))
  return m >= 60 ? `・${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}後重置` : `・${m}m後重置`
}

const readUsage = async ($: any): Promise<Usage | undefined> => {
  try {
    const u = await $.session.usage()
    return {
      ctxTokens: u.context?.tokens,
      ctxWindow: u.context?.window,
      ctxPercent: u.context?.percent,
      limits: (u.rateLimits ?? []).map((r: any) => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })),
      costUsd: u.cost?.usd,
    }
  } catch {
    return undefined
  }
}

// /rename lands in the transcript as a `custom-title` entry; the mod has no API for it, so read it there.
// Re-read rarely (renames are rare) and keep the last name when the file is gone or over $.fs's 4 MiB limit.
let sessionName = ''
let nameCheckedAt = 0
const readSessionName = async ($: any, now: number) => {
  if (now - nameCheckedAt < 10000) return
  nameCheckedAt = now
  try {
    const sid = await $.session.id()
    const file = `${dir.replace(/\/pixel-office$/, '')}/projects/${cwd.replace(/[^a-zA-Z0-9]/g, '-')}/${sid}.jsonl`
    const text: string = await $.fs.read(file)
    const hits = [...text.matchAll(/"customTitle":("(?:[^"\\]|\\.)*")/g)]
    if (hits.length) sessionName = String(JSON.parse(hits[hits.length - 1][1]))
  } catch {}
}

const refresh = async ($: any) => {
  const list = await $.agent.list()
  const now = await $.clock.now()
  const usage = await readUsage($)
  await readSessionName($, now)
  const mainName = sessionName || await $.session.model().catch(() => '') || 'Claude'
  const mk = (id: string, name: string, type: string, description: string, status: string, lastTool?: string): Worker => {
    const old = known.get(id)
    const since = old && old.status === status ? old.since : now
    const w = { id: `${SID}:${id}`, session: SID, project, cwd, name, type, description, status, lastTool, since, usage }
    known.set(id, w)
    return w
  }
  const mine: Worker[] = [
    { ...mk(MAIN, mainName, 'main', '主要對話', main.status, main.lastTool), since: main.since || now },
    ...list.map((a: any) =>
      mk(a.id, String(a.name ?? a.type ?? 'agent'), String(a.type ?? '-'), String(a.description ?? ''), a.status, subTool.get(a.id)),
    ),
  ]
  await $.fs.write(`${dir}/${SID}.json`, JSON.stringify({ ts: now, workers: mine }))

  const all: Worker[] = []
  for (const f of await $.fs.list(dir).catch(() => [])) {
    if (!f.name.endsWith('.json') || f.name === `${SID}.json`) continue
    if (now - f.mtimeMs > STALE_MS) continue
    try {
      const j = JSON.parse(await $.fs.read(`${dir}/${f.name}`))
      if (now - j.ts <= STALE_MS) all.push(...j.workers)
    } catch {}
  }
  all.push(...mine)
  const live = new Set(all.map(w => w.id))
  for (const w of all) {
    ghosts.delete(w.id)
    seenLive.set(w.id, w)
  }
  for (const [id, w] of seenLive) {
    if (live.has(id)) continue
    seenLive.delete(id)
    ghosts.set(id, { w, until: now + GHOST_MS })
  }
  for (const [id, g] of ghosts) {
    if (g.until <= now) ghosts.delete(id)
    else all.push({ ...g.w, status: 'offline', since: g.until - GHOST_MS })
  }
  // Redraw only when something visible changed: the desktop SVG animates itself, and a
  // redraw every second would reset the hover card under the mouse.
  // Every redraw swaps the whole SVG image (visible flicker), so status changes redraw at once
  // while card-only details (last tool, usage) are throttled.
  const sig = JSON.stringify(all.map(w => [w.id, w.name, w.type, w.description, w.status, w.project]))
  const detail = JSON.stringify(all.map(w => [w.lastTool, w.since, w.usage && [w.usage.ctxPercent, w.usage.limits]]))
  const structural = sig !== lastSig
  if (!terminalSurface && !structural && (detail === lastDetail || now - lastDraw < DETAIL_MS)) return
  lastSig = sig
  lastDetail = detail
  lastDraw = now
  await update($, office, (o: Office) => ({ workers: all, frame: o.frame + 1, now }))
}

// ───────────── Desktop / remote surfaces: the office drawn as one SVG per project ─────────────
const FONT = "'Cascadia Mono','Consolas','Microsoft JhengHei','PingFang TC',monospace"
const SHORT: Record<string, string> = {
  running: '工作中', pending: '待命', waiting: '等待中', idle: '閒置', completed: '完成', failed: '失敗', killed: '終止', offline: '離開',
}
const DW = 168 // desk cell
const DH = 182
const HEAD = 34 // room header
const CW = 256 // hover card width

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const cw = (c: string) => (c.charCodeAt(0) > 0x2e7f ? 2 : 1)
const clip = (s: string, units: number) => {
  let n = 0
  let out = ''
  for (const c of s) {
    n += cw(c)
    if (n > units) return out.replace(/\s+$/, '') + '…'
    out += c
  }
  return out
}
const wrap = (s: string, units: number, maxLines: number) => {
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
const shade = (hex: string, f: number) => {
  const n = parseInt(hex.slice(1), 16)
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)))
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => c(v).toString(16).padStart(2, '0')).join('')}`
}
const hhmm = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const resetAt = (iso?: string) => (iso ? ` ・${hhmm(Date.parse(iso))} 重置` : '')
const barColor = (pct: number) => (pct >= 90 ? '#f87171' : pct >= 70 ? '#facc15' : '#4ade80')

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

const fmtDur = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return s < 60 ? `${s} 秒` : m < 60 ? `${m} 分鐘` : `${Math.floor(m / 60)} 小時 ${m % 60} 分`
}

const animOpacity = (values: string, dur: string, begin = '0s', calc = 'linear') =>
  `<animate attributeName="opacity" values="${values}" dur="${dur}" begin="${begin}" calcMode="${calc}" repeatCount="indefinite"/>`

const screenFor = (status: string) => {
  const sx = 104
  const sy = 54
  const frame = `<rect x="${sx - 4}" y="${sy - 4}" width="56" height="38" fill="#2b3347"/><rect x="${sx - 2}" y="${sy - 2}" width="52" height="34" fill="#0a0e18"/>`
  const stand = `<rect x="${sx + 18}" y="${sy + 34}" width="12" height="4" fill="#2b3347"/>`
  const bg = (c: string) => `<rect x="${sx}" y="${sy}" width="48" height="30" fill="${c}"/>`
  let inner = ''
  if (status === 'running') {
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
  if (status === 'running')
    return box('#e8eef9', 20, 52) + [0, 1, 2].map(i => `<rect x="${32 + i * 12}" y="17" width="6" height="6" fill="#334155">${animOpacity('.2;1;.2', '1.2s', `${i * 0.25}s`)}</rect>`).join('')
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

const deskSvg = (w: Worker, i: number, dx: number, dy: number) => {
  const st = STATUS[w.status] ?? STATUS.idle
  const away = w.status === 'offline'
  const running = w.status === 'running'
  const n = hash(w.id)
  const pick = (k: number, m: number) => Math.floor(n / k) % m
  const fresh = NOW - (seenAt.get(w.id) ?? 0) < 3000
  const justChanged = NOW - w.since < 4000
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

const cardSvg = (w: Worker) => {
  const st = STATUS[w.status] ?? STATUS.idle
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
  kv('持續', `${fmtDur(NOW - w.since)} · ${hhmm(w.since)}`, st.color)
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
const wallSvg = (W: number, seed: number) => {
  const d = new Date(NOW)
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

const roomSvg = (ws: Worker[], maxCols: number) => {
  const cols = Math.max(1, Math.min(ws.length, maxCols))
  const rows = Math.ceil(ws.length / cols)
  const W = Math.max(cols * DW + 16, CW + DW + 16)
  const TOP = HEAD + WALL
  const cards = ws.map(cardSvg)
  const H = Math.max(TOP + rows * DH + 8, HEAD + Math.max(...cards.map(c => c.h)) + 8)
  const pos = ws.map((_, i) => ({ x: 8 + (i % cols) * DW, y: TOP + Math.floor(i / cols) * DH }))
  const css =
    `.card{display:none;pointer-events:none}.hl{opacity:0;transition:opacity .15s}.desk:hover .hl{opacity:1}` +
    `.p{transition:transform .15s ease-out}.desk:hover .p{transform:translateY(-4px)}@keyframes fi{from{opacity:0}to{opacity:1}}` +
    ws.map((_, i) => `#d${i}:hover~#c${i}{display:block;animation:fi .18s}`).join('')
  const cardLayer = ws
    .map((w, i) => {
      const st = STATUS[w.status] ?? STATUS.idle
      let x = pos[i].x + DW - 8
      if (x + CW > W - 4) x = pos[i].x - CW + 8
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
    `<style>${css}</style>${DEFS}<rect width="${W}" height="${H}" fill="url(#floor)"/>${wallSvg(W, hash(ws[0].cwd))}${head}` +
    plants + ws.map((w, i) => deskSvg(w, i, pos[i].x, pos[i].y)).join('') + cardLayer + `</svg>`
  return { source, W, H }
}

const hudSvg = (W: number, limits: { kind: string; percentUsed: number; resetsAt?: string }[]) => {
  const H = 60
  let out = `<rect width="${W}" height="${H}" fill="#10131d" stroke="#2a3350" stroke-width="2"/>`
  let x = 16
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    cwd = await $.session.cwd()
    project = cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd
    const root = String($.plugin.root).split('\\').join('/')
    // Loaded from ~/.claude/... the root tells us the home; loaded from the project folder
    // (CLAUDE_CODE_PLUGIN_DIRS) it does not, so fall back to the user profile.
    const home = root.includes('/.claude/')
      ? root.split('/.claude/')[0]
      : String((globalThis as any).process?.env?.USERPROFILE ?? 'C:/Users/Lai').split('\\').join('/')
    dir = `${home}/.claude/pixel-office`
    await $.command.register({ name: 'office', description: '開啟像素辦公室' })
    void $.ui.open({ id: PANE, title: '像素辦公室' })
    await refresh($).catch(() => {})
    timer?.cancel()
    timer = $.clock.every(1000, () => void refresh($).catch(() => {}))
    return next(e)
  })

  on('command.run', { command: 'office' }, async $ => {
    await $.ui.open({ id: PANE, title: '像素辦公室' })
    return { text: 'Pixel office opened.' }
  })

  on('tool.call', async ($, e, next) => {
    const id = (e as any).agentId as string | undefined
    if (id) subTool.set(id, e.tool)
    else {
      main.lastTool = e.tool
      main.status = 'running'
      main.since = await $.clock.now()
    }
    try {
      return await next(e)
    } finally {
      if (!id) {
        main.status = 'idle'
        main.since = await $.clock.now()
      }
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    terminalSurface = e.surface === 'terminal'
    const o = await read($, office)
    if (!terminalSurface) {
      NOW = await $.clock.now()
      for (const w of o.workers) if (!seenAt.has(w.id)) seenAt.set(w.id, NOW)
      const { Box, Text, Svg } = $.ui.resolve(e) as any
      const colsPx = Math.floor(((e.props as any)?.bodyColumns ?? 100) * 7.5)
      const maxCols = Math.max(2, Math.min(6, Math.floor((colsPx - 16) / DW)))
      const groups = new Map<string, Worker[]>()
      for (const w of o.workers) groups.set(w.cwd, [...(groups.get(w.cwd) ?? []), w])
      const rooms = [...groups.values()]
        .sort((a, b) => a[0].project.localeCompare(b[0].project))
        .map(ws => roomSvg(ws.sort(deskOrder), maxCols))
      if (!rooms.length) return <Text dimColor>辦公室還沒有人上班…</Text>

      const bySession = new Map<string, Worker>()
      for (const w of o.workers) if (w.usage && w.status !== 'offline' && !bySession.has(w.session)) bySession.set(w.session, w)
      const sessions = [...bySession.values()]
      const limits = new Map<string, { kind: string; percentUsed: number; resetsAt?: string }>()
      for (const w of sessions) for (const l of w.usage!.limits) {
        const cur = limits.get(l.kind)
        if (!cur || l.percentUsed > cur.percentUsed) limits.set(l.kind, l)
      }
      const W = Math.max(...rooms.map(r => r.W))
      return (
        <Box flexDirection="column">
          {sessions.length > 0 && (
            <Box marginBottom={1}>
              <Svg alt="用量總覽" width={W} source={hudSvg(W, [...limits.values()])} />
            </Box>
          )}
          {rooms.map((r, i) => (
            <Box key={`room-${i}`} marginBottom={1}>
              <Svg alt="像素辦公室" width={r.W} height={r.H} isInteractive source={r.source} />
            </Box>
          ))}
        </Box>
      )
    }
    const { Box, Text } = $.ui.resolve(e)
    const sec = (w: Worker) => Math.max(0, Math.round((o.now - w.since) / 1000))

    const desk = (w: Worker) => {
          const st = STATUS[w.status] ?? STATUS.idle
          const rows = []
          for (let r = 0; r < SPRITE.length; r += 2) {
            const cells = []
            for (let x = 0; x < 12; x++) {
              const top = pixel(SPRITE[r][x], w, o.frame)
              const bot = pixel(SPRITE[r + 1][x], w, o.frame)
              const k = `c${r}-${x}`
              cells.push(
                !top && !bot ? <Text key={k}> </Text>
                : top && bot ? <Text key={k} color={top} backgroundColor={bot}>▀</Text>
                : top ? <Text key={k} color={top}>▀</Text>
                : <Text key={k} color={bot}>▄</Text>,
              )
            }
            rows.push(<Box key={`r${r}`} flexDirection="row">{cells}</Box>)
          }
          return (
            <Box key={`w-${w.id}`} flexDirection="column" marginRight={1} width={12}>
              {rows}
              <Text bold><Text color={st.color}>{w.status === 'running' ? (o.frame % 2 ? '●' : '○') : w.status === 'idle' ? 'z' : '●'}</Text> {w.name.slice(0, 10)}</Text>
              <Box position="absolute" top={1} left={0} display="none" hover={{ display: 'flex' }}
                flexDirection="column" borderStyle="round" borderColor={st.color} paddingX={1} width={36}>
                <Text bold>{w.name}</Text>
                <Text>類型: {w.type}</Text>
                <Text color={st.color}>狀態: {st.label} ({sec(w)}s)</Text>
                <Text>任務: {w.description.slice(0, 28)}</Text>
                <Text>最近工具: {w.lastTool ?? '-'}</Text>
                {w.usage && (
                  <>
                    <Text dimColor>── Session 用量 ──</Text>
                    {w.usage.ctxPercent !== undefined && (
                      <Text>Context {w.usage.ctxPercent}% ({fmtK(w.usage.ctxTokens)}/{fmtK(w.usage.ctxWindow)})</Text>
                    )}
                  </>
                )}
              </Box>
            </Box>
          )
    }

    const groups = new Map<string, Worker[]>()
    for (const w of o.workers) groups.set(w.cwd, [...(groups.get(w.cwd) ?? []), w])
    const rowsOut = [...groups.entries()]
      .sort((a, b) => a[1][0].project.localeCompare(b[1][0].project))
      .map(([dirKey, ws]) => (
        <Box key={`p-${dirKey}`} flexDirection="column">
          <Text bold color="#fbbf24">▌ {ws[0].project} <Text dimColor>({ws.length})</Text></Text>
          <Box flexDirection="row" flexWrap="wrap">
            {ws.sort(deskOrder).map(desk)}
          </Box>
        </Box>
      ))

    // Overview: plan limits are account-wide (take the newest reading); cost sums per session.
    const bySession = new Map<string, Worker>()
    for (const w of o.workers) if (w.usage && w.status !== 'offline' && !bySession.has(w.session)) bySession.set(w.session, w)
    const sessions = [...bySession.values()]
    const limits = new Map<string, { kind: string; percentUsed: number; resetsAt?: string }>()
    for (const w of sessions) for (const l of w.usage!.limits) {
      const cur = limits.get(l.kind)
      if (!cur || l.percentUsed > cur.percentUsed) limits.set(l.kind, l)
    }
    const overview = sessions.length > 0 && (
      <Box flexDirection="row" marginBottom={1}>
        {[...limits.values()].map(l => (
          <Text key={l.kind} color={l.percentUsed >= 90 ? '#f87171' : '#a3e635'}>
            {LIMIT_LABEL[l.kind] ?? l.kind} {l.percentUsed}%{untilReset(l.resetsAt, o.now)}{'   '}
          </Text>
        ))}
      </Box>
    )

    return <Box flexDirection="column">{overview}{rowsOut}</Box>
  })
}
