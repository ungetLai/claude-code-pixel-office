// One desk: character, monitor, speech bubble and name plate.
import type { Worker } from '../types'
import { SHORT, statusOf } from './status'
import { cw, clip, esc, hash, shade } from './util'
import type { View } from './kit'
import { ART, BADGE, BADGES, BODY, BODY_LONG, CAPS, CHECK, CROSS, DH, DW, FONT, HAIR, HEADS, HEADSET, SESS, SKIN, TIE, animOpacity, px } from './kit'

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

export const deskSvg = (w: Worker, i: number, dx: number, dy: number, v: View) => {
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
