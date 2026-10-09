// Desktop / remote surfaces: the office as one SVG image per project room.
import type { Office } from '../types'
import { DW, MIN_ROOM_W, hudSvg, moreRoomsSvg, roomStripSvg, roomSvg } from './svg'
import { deskOrder, groupByRoom, isActive, summarizeUsage } from './status'

const MAX_ROOMS = 8
const QUIET_FOLD_FROM = 3 // fold rooms with nothing going on once there are more than this many rooms

// When each worker first appeared in a drawing, for the fade-in.
const seenAt = new Map<string, number>()
export const pruneSeen = (ids: Set<string>) => {
  for (const id of seenAt.keys()) if (!ids.has(id)) seenAt.delete(id)
}

type Ui = { Box: any; Text: any; Svg: any }

export const renderDesktop = (o: Office, { Box, Text, Svg }: Ui, bodyColumns: number) => {
  for (const w of o.workers) if (!seenAt.has(w.id)) seenAt.set(w.id, o.now)
  const view = { now: o.now, seenAt }
  const colsPx = Math.floor(bodyColumns * 7.5)
  const maxCols = Math.max(2, Math.min(6, Math.floor((colsPx - 16) / DW)))

  let groups = groupByRoom(o.workers)
  if (!groups.length) return <Text dimColor>辦公室還沒有人上班…</Text>

  // Too many rooms: keep every busy one, fill the rest with quiet ones, say how many are hidden.
  let hidden = 0
  if (groups.length > MAX_ROOMS) {
    let room = MAX_ROOMS - groups.filter(ws => ws.some(w => isActive(w.status))).length
    const keep = groups.filter(ws => ws.some(w => isActive(w.status)) || room-- > 0)
    hidden = groups.length - keep.length
    groups = keep
  }
  const fold = groups.length > QUIET_FOLD_FROM
  const quiet = groups.map(ws => fold && !ws.some(w => isActive(w.status)))

  const full = groups.map((ws, i) => (quiet[i] ? undefined : roomSvg(ws.sort(deskOrder), maxCols, view)))
  const W = Math.max(MIN_ROOM_W, ...full.map(r => r?.W ?? 0))
  const rooms = groups.map((ws, i) => full[i] ?? roomStripSvg(ws, W))

  const { limits } = summarizeUsage(o.workers)
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Svg alt="用量總覽" width={W} source={hudSvg(W, limits)} />
      </Box>
      {rooms.map((r, i) => (
        <Box key={`room-${groups[i][0].cwd}`} marginBottom={quiet[i] ? 0 : 1}>
          <Svg alt={quiet[i] ? '閒置辦公室' : '像素辦公室'} width={r.W} height={r.H} isInteractive={!quiet[i]} source={r.source} />
        </Box>
      ))}
      {hidden > 0 && (
        <Box>
          <Svg alt="更多辦公室" width={W} height={26} source={moreRoomsSvg(hidden, W)} />
        </Box>
      )}
    </Box>
  )
}
