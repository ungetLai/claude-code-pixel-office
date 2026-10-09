import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Office, Worker } from '../types'

const PANE = 'pixel-office'
const MAIN = 'main'
const office = atom(
  { plugin: 'pixel-office', key: 'office' } as const,
  { workers: [], frame: 0, now: 0 } as Office,
)

// 12x10 pixel worker at a desk; two pixels per terminal row via half blocks.
const SPRITE = [
  '...hhhh.mmmm',
  '..hsssh.mggm',
  '..hsksh.mggm',
  '...sss..mmmm',
  '..bbbbb..mm.',
  '.bbbbbbb.mm.',
  '.bbbbbbb....',
  'dddddddddddd',
  'dddddddddddd',
  '.dd......dd.',
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
}

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
const subTool = new Map<string, string>()
const known = new Map<string, Worker>()

const refresh = async ($: any) => {
  const list = await $.agent.list()
  const now = await $.clock.now()
  const mk = (id: string, name: string, type: string, description: string, status: string, lastTool?: string): Worker => {
    const old = known.get(id)
    const since = old && old.status === status ? old.since : now
    const w = { id: `${SID}:${id}`, session: SID, project, cwd, name, type, description, status, lastTool, since }
    known.set(id, w)
    return w
  }
  const mine: Worker[] = [
    { ...mk(MAIN, 'Claude (main)', 'main', '主要對話', main.status, main.lastTool), since: main.since || now },
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
  await update($, office, (o: Office) => ({ workers: all, frame: o.frame + 1, now }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    cwd = await $.session.cwd()
    project = cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd
    const root = String($.plugin.root).split('\\').join('/')
    dir = `${root.split('/.claude/')[0]}/.claude/pixel-office`
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
    const { Box, Text } = $.ui.resolve(e)
    const o = await read($, office)
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
            <Box key={`w-${w.id}`} flexDirection="column" marginRight={2} marginBottom={1} width={14}>
              <Text color={st.color}>{w.status === 'running' ? (o.frame % 2 ? '>_ ...' : '>_ .. ') : w.status === 'idle' ? 'z Z z' : ' '}</Text>
              {rows}
              <Text bold>{w.name.slice(0, 13)}</Text>
              <Box position="absolute" top={1} left={0} display="none" hover={{ display: 'flex' }}
                flexDirection="column" borderStyle="round" borderColor={st.color} paddingX={1} width={32}>
                <Text bold>{w.name}</Text>
                <Text>專案: {w.project}</Text>
                <Text>類型: {w.type}</Text>
                <Text color={st.color}>狀態: {st.label} ({sec(w)}s)</Text>
                <Text>任務: {w.description.slice(0, 28)}</Text>
                <Text>最近工具: {w.lastTool ?? '-'}</Text>
              </Box>
            </Box>
          )
    }

    const groups = new Map<string, Worker[]>()
    for (const w of o.workers) groups.set(w.cwd, [...(groups.get(w.cwd) ?? []), w])
    const rowsOut = [...groups.entries()]
      .sort((a, b) => a[1][0].project.localeCompare(b[1][0].project))
      .map(([dirKey, ws]) => (
        <Box key={`p-${dirKey}`} flexDirection="column" marginBottom={1}>
          <Text bold color="#fbbf24">▌ {ws[0].project} <Text dimColor>({ws.length})</Text></Text>
          <Box flexDirection="row" flexWrap="wrap">
            {ws.sort((a, b) => (a.type === 'main' ? -1 : 0) - (b.type === 'main' ? -1 : 0) || a.since - b.since).map(desk)}
          </Box>
        </Box>
      ))

    return <Box flexDirection="column">{rowsOut}</Box>
  })
}
