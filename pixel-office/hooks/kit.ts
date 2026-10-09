// Shared drawing kit: layout constants, palettes, pixel sprites and the pixel painter.
export type View = { now: number; seenAt: Map<string, number> }

export const HAIR = ['#3b2a20', '#c9a227', '#222233', '#a83a2a', '#6b4a8a']
export const SKIN = ['#f2c9a0', '#e0ac7e', '#c68a5e', '#f7d9b8']
export const FONT = "'Cascadia Mono','Consolas','Microsoft JhengHei','PingFang TC',monospace"
export const DW = 168 // desk cell
export const DH = 182
export const HEAD = 34 // room header
export const CW = 256 // hover card width

// Paint a character grid as merged <rect> runs.
export const px = (rows: string[], pal: Record<string, string | undefined>, x: number, y: number, u: number) => {
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

export const E = ''
export const MID = ['..h' + 'ssssss' + 'h..', '..h' + 'skssks' + 'h..', '..h' + 'ssssss' + 'h..']
export const HEADS = [
  ['...hhhhhh...', '..hhhhhhhh..', ...MID, '...ssssss...'], // short
  ['...hhhhhh...', '..hhhhhhhh..', ...MID, '..hhssssshh.'], // sideburns
  ['...hhhhhh...', '..hhhhhhhh..', '.hh' + 'ssssss' + 'hh.', '.hh' + 'skssks' + 'hh.', '.hh' + 'ssssss' + 'hh.', '.hh' + 'ssssss' + 'hh.'], // long
  ['..cccccccc..', '.cccccccccc.', ...MID, '...ssssss...'], // cap
  ['....hhhh....', '..hhhhhhhh..', ...MID, '...ssssss...'], // bun
]
export const BODY = ['..bbbbbbbb..', '.dbbbbbbbbd.', '.ss.bbbb.ss.', '.dbbbbbbbbd.', '.dbbbbbbbbd.']
export const BODY_LONG = ['.hhbbbbbbhh.', '.hdbbbbbbdh.', ...BODY.slice(2)]
export const TIE = [E, E, E, E, E, E, '.....tt.....', '.....tt.....']
export const BADGE = [E, E, E, E, E, E, E, '.......pp...']
export const HEADSET = [E, '.e........e.', '.e........e.', '.e........e.']
export const CHECK = ['......g.', '.....gg.', 'g...gg..', 'gg.gg...', '.ggg....', '..g.....']
export const CROSS = ['x.....x', '.x...x.', '..x.x..', '...x...', '..x.x..', '.x...x.', 'x.....x']
export const PLANT = ['..g...g..', '.ggg.ggg.', '..ggggg..', '.ggggggg.', '...ggg...', '..ppppp..', '..ppppp..', '...ppp...']
export const ART = [
  ['.rr.rr', 'rrrrrr', 'rrrrrr', '.rrrr.', '..rr..'],
  ['..yy..', '..yy..', 'yyyyyy', '.yyyy.', '.yy.yy'],
  ['.wwww.', '.wwwwc', '.wwwwc', '..ww..', '.wwww.'],
]
export const ART_PAL = { r: '#f472b6', y: '#fde047', w: '#e2e8f0', c: '#fb923c' }
export const SESS = ['#f472b6', '#22d3ee', '#a3e635', '#fb923c', '#c084fc', '#2dd4bf']
export const BADGES = ['#38bdf8', '#a78bfa', '#fb923c', '#f472b6', '#2dd4bf', '#fde047']
export const CAPS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b']

export const animOpacity = (values: string, dur: string, begin = '0s', calc = 'linear') =>
  `<animate attributeName="opacity" values="${values}" dur="${dur}" begin="${begin}" calcMode="${calc}" repeatCount="indefinite"/>`

export const DEFS =
  `<defs><pattern id="seg" width="6" height="8" patternUnits="userSpaceOnUse"><rect x="5" y="0" width="1" height="8" fill="#0b0f1a" fill-opacity=".55"/></pattern>` +
  `<pattern id="floor" width="48" height="48" patternUnits="userSpaceOnUse"><rect width="48" height="48" fill="#131929"/><rect width="24" height="24" fill="#161d30"/><rect x="24" y="24" width="24" height="24" fill="#161d30"/></pattern></defs>`
