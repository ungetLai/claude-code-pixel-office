import { expect, test } from 'claude-code/testing'
import type { Worker } from '../types'
import { hudSvg, roomStripSvg, roomSvg } from './svg'
import { STATUS } from './status'

const worker = (status: string, i: number): Worker => ({
  id: `s:${i}`, session: 's', project: 'proj', cwd: 'C:/proj', name: `w${i}`, type: i ? 'Explore' : 'main', description: '任務 description', status, since: 0,
})

test('every status draws a room, a strip and a usage bar without throwing', () => {
  const ws = Object.keys(STATUS).map(worker)
  const room = roomSvg(ws, 4, { now: 5000, seenAt: new Map() })
  expect(room.source.startsWith('<svg')).toBe(true)
  expect(roomStripSvg(ws, room.W).source).toContain('proj')
  expect(hudSvg(400, [{ kind: 'five_hour', percentUsed: 42 }])).toContain('42%')
})
