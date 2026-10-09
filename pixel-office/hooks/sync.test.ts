import { expect, test } from 'claude-code/testing'
import type { Io } from './sync'
import { configure, refresh, toolEnd, toolStart, turnState } from './sync'

// An in-memory shared folder plus a clock we move by hand.
const makeIo = (files: Map<string, { text: string; mtimeMs: number }>, clock: { t: number }): Io => ({
  agents: async () => [],
  now: async () => clock.t,
  usage: (async () => ({ startedAt: 0, context: { tokens: 1, window: 10, percent: 10 }, rateLimits: [] })) as unknown as Io['usage'],
  sessionId: async () => 'sid',
  model: async () => 'model',
  list: (async () => [...files].map(([name, f]) => ({ name: name.split('/').pop()!, kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false }))) as unknown as Io['list'],
  read: (async (p: string) => {
    const f = files.get(p)
    if (!f) throw new Error('ENOENT')
    return f.text
  }) as unknown as Io['read'],
  write: async (p, text) => void files.set(p, { text, mtimeMs: clock.t }),
  stat: (async () => { throw new Error('ENOENT') }) as unknown as Io['stat'],
})

test('parallel tool calls keep the main agent running until the last one ends', async () => {
  configure({ shareDir: '', claudeDir: '', cwd: 'C:/p', project: 'p' })
  const status = async (t: number) => (await refresh(makeIo(new Map(), { t }), true))!.workers.find(w => w.type === 'main')!.status
  turnState(true, 1)
  expect(await status(1)).toBe('thinking')
  toolStart('Read', 2)
  toolStart('Grep', 2)
  toolEnd(3)
  expect(await status(3)).toBe('running')
  toolEnd(4)
  expect(await status(4)).toBe('thinking')
  turnState(false, 5)
  expect(await status(5)).toBe('idle')
})

test('a dead session\'s file is taken over instead of piling up', async () => {
  configure({ shareDir: 'd', claudeDir: '', cwd: 'C:/p', project: 'p' })
  const files = new Map([['d/old.json', { text: '{}', mtimeMs: 0 }]])
  await refresh(makeIo(files, { t: 100000 }), true)
  expect(files.size).toBe(1)
  expect(files.get('d/old.json')!.text).toContain('workers')
})

test('a peer\'s half-written file keeps its last good reading', async () => {
  configure({ shareDir: 'd', claudeDir: '', cwd: 'C:/p', project: 'p' })
  const peer = { sid: 'peer', ts: 200000, workers: [{ id: 'peer:main', session: 'peer', project: 'q', cwd: 'C:/q', name: 'q', type: 'main', description: '', status: 'idle', since: 0 }] }
  const files = new Map([['d/slot-9.json', { text: JSON.stringify(peer), mtimeMs: 200000 }]])
  const clock = { t: 200000 }
  const io = makeIo(files, clock)
  const first = await refresh(io, true)
  expect(first!.workers.some(w => w.id === 'peer:main')).toBe(true)
  files.set('d/slot-9.json', { text: '{"sid":"peer","ts":2', mtimeMs: 201000 })
  clock.t = 201000
  const second = await refresh(io, true)
  expect(second!.workers.some(w => w.id === 'peer:main')).toBe(true)
})
