// Terminal surface: pixel workers drawn with half-block characters.
import type { Office, Worker } from '../types'
import { HAIR, SKIN } from './kit'
import { deskOrder, groupByRoom, statusOf, summarizeUsage } from './status'
import { LIMIT_LABEL, fmtK, hash, untilReset } from './util'

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

const pixel = (ch: string, w: Worker, frame: number): string | undefined => {
  const n = hash(w.id)
  const st = statusOf(w.status)
  const lit = w.status === 'running' || w.status === 'thinking'
  switch (ch) {
    case 'h': return HAIR[n % HAIR.length]
    case 's': return SKIN[n % SKIN.length]
    case 'k': return '#1b1b1b'
    case 'b': return st.color
    case 'm': return '#3a3f4b'
    case 'g': return lit ? (frame % 2 ? '#7dd3fc' : '#38bdf8') : w.status === 'failed' ? '#ef4444' : '#1e293b'
    case 'd': return '#8b5a2b'
    default: return undefined
  }
}

// The element table is typed per surface by the engine; the pieces used here are plain components.
type Ui = { Box: any; Text: any }

export const renderTerminal = (o: Office, { Box, Text }: Ui) => {
  const sec = (w: Worker) => Math.max(0, Math.round((o.now - w.since) / 1000))

  const desk = (w: Worker) => {
    const st = statusOf(w.status)
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
    const blink = w.status === 'running' || w.status === 'thinking'
    return (
      <Box key={`w-${w.id}`} flexDirection="column" marginRight={1} width={12}>
        {rows}
        <Text bold><Text color={st.color}>{blink ? (o.frame % 2 ? '●' : '○') : w.status === 'idle' ? 'z' : '●'}</Text> {w.name.slice(0, 10)}</Text>
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
              <Text>Context {w.usage.ctxPercent ?? '-'}% ({fmtK(w.usage.ctxTokens)}/{fmtK(w.usage.ctxWindow)})</Text>
            </>
          )}
        </Box>
      </Box>
    )
  }

  const rooms = groupByRoom(o.workers).map(ws => (
    <Box key={`p-${ws[0].cwd}`} flexDirection="column">
      <Text bold color="#fbbf24">▌ {ws[0].project} <Text dimColor>({ws.length})</Text></Text>
      <Box flexDirection="row" flexWrap="wrap">
        {ws.sort(deskOrder).map(desk)}
      </Box>
    </Box>
  ))

  const { sessions, limits } = summarizeUsage(o.workers)
  const overview = sessions.length > 0 && (
    <Box flexDirection="row" marginBottom={1}>
      {limits.map(l => (
        <Text key={l.kind} color={l.percentUsed >= 90 ? '#f87171' : '#a3e635'}>
          {LIMIT_LABEL[l.kind] ?? l.kind} {l.percentUsed}%{untilReset(l.resetsAt, o.now)}{'   '}
        </Text>
      ))}
    </Box>
  )

  return <Box flexDirection="column">{overview}{rooms}</Box>
}
